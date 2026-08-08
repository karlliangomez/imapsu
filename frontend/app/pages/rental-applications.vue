<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['aspiring-tenant']
})

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
  message?: string
  createdAt?: string
  letterOfIntent?: { id: number; url?: string; name?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type PropertySpace = { documentId: string; name: string; propertyCode: string; building: string; monthlyRent?: number | string }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Rental applications | iMapSU' })

const auth = useAuth()
const toast = useToast()
const route = useRoute()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<RentalApplication>>('/api/rental-applications', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[letterOfIntent]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 50
  }
})

const { data: propertyData } = await useFetch<ListResponse<PropertySpace>>('/api/properties', {
  baseURL,
  headers,
  query: {
    'fields[0]': 'name',
    'fields[1]': 'propertyCode',
    'fields[2]': 'building',
    'fields[3]': 'monthlyRent',
    'filters[space_status][$eq]': 'Vacant',
    'pagination[pageSize]': 100
  }
})

const applications = computed(() => data.value?.data ?? [])
const vacantProperties = computed(() => propertyData.value?.data ?? [])
const propertyOptions = computed(() => vacantProperties.value.map(property => ({
  label: `${property.name} (${property.propertyCode})${property.monthlyRent ? ` · ₱${Number(property.monthlyRent).toLocaleString()}` : ''}`,
  value: property.documentId
})))

const selectedProperty = ref<string>()
const message = ref('')
const letterFile = ref<File>()
const letterFormKey = ref(0)
const submitting = ref(false)
const errorMessage = ref('')
const formOpen = ref(false)

const preselectProperty = typeof route.query.property === 'string' ? route.query.property : null

onMounted(() => {
  if (preselectProperty && vacantProperties.value.some(property => property.documentId === preselectProperty)) {
    selectedProperty.value = preselectProperty
    formOpen.value = true
  }
})

const submit = async () => {
  errorMessage.value = ''
  if (!selectedProperty.value) {
    errorMessage.value = 'Please choose a vacant property.'
    return
  }
  if (!letterFile.value) {
    errorMessage.value = 'Please attach your signed letter of intent.'
    return
  }

  submitting.value = true
  try {
    const form = new FormData()
    form.append('files', letterFile.value)
    const uploaded = await $api<{ id: number }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Upload failed')

    await $api('/api/rental-applications', {
      method: 'POST',
      body: {
        propertySpace: selectedProperty.value,
        message: message.value || undefined,
        letterOfIntent: fileId
      }
    })
    selectedProperty.value = undefined
    message.value = ''
    letterFile.value = undefined
    letterFormKey.value++
    formOpen.value = false
    await refresh()
  } catch (err) {
    errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const statusColor = (status: RentalApplication['status']) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Declined':
    case 'Cancelled':
      return 'error'
    case 'For Review':
    case 'For Recommendation':
      return 'info'
    default:
      return 'secondary'
  }
}

const letterUploading = ref(false)
const letterError = ref('')

const uploadLetter = async (item: RentalApplication, file?: File) => {
  if (!file) return
  letterUploading.value = true
  letterError.value = ''
  try {
    const form = new FormData()
    form.append('files', file)
    const uploaded = await $api<{ id: number; url?: string }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Upload failed')

    await $api(`/api/rental-applications/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: { data: { letterOfIntent: fileId } }
    })
    toast.add({ title: 'Letter of intent uploaded', description: 'Your letter was attached to this application.', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    letterError.value = getErrorMessage(err)
  } finally {
    letterUploading.value = false
  }
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Aspiring tenant</p>
        <h1 class="imapsu-page-heading">Rental applications</h1>
        <p class="mt-2 max-w-xl text-muted">Apply to rent a vacant space and track the status of your applications.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="New application" icon="i-lucide-plus" @click="formOpen = true" />
      </div>
    </div>

    <div>
        <div v-if="status === 'pending'" class="space-y-4">
          <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
        </div>

        <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load applications" :description="error.message" />

        <UEmpty v-else-if="applications.length === 0" icon="i-lucide-file-text" title="No applications yet" description="Applications you submit will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in applications" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p v-if="item.propertySpace" class="font-medium text-highlighted">
                  {{ item.propertySpace.name }}
                  <span class="font-mono text-xs text-muted">({{ item.propertySpace.propertyCode }})</span>
                </p>
                <p v-else class="text-sm text-muted">Property removed</p>
                <p class="mt-1 text-xs text-muted">Submitted {{ formatDate(item.createdAt) }}</p>
              </div>
              <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
            </div>

            <dl class="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt class="text-xs text-muted">Property</dt><dd class="font-medium text-highlighted">{{ item.propertySpace?.name ?? '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Letter of intent</dt><dd class="font-medium text-highlighted">{{ item.letterOfIntent ? 'Attached' : 'Not uploaded' }}</dd></div>
            </dl>

            <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

            <div class="mt-4 border-t border-default pt-4">
              <p class="mb-2 text-xs text-muted">Letter of intent</p>
              <div v-if="item.letterOfIntent">
                <a :href="`${baseURL}${item.letterOfIntent.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View letter of intent</a>
              </div>
              <template v-else>
                <UInput type="file" accept=".pdf,.doc,.docx" :disabled="letterUploading" :ui="{ leading: 'none' }" @change="(event: Event) => { const input = event.target as HTMLInputElement; if (input.files?.[0]) uploadLetter(item, input.files[0]).then(() => { input.value = '' }) }" />
                <p class="mt-1 text-xs text-muted">Attach a signed letter of intent in PDF or Word format.</p>
              </template>
              <p v-if="letterError" class="mt-2 text-xs text-error">{{ letterError }}</p>
            </div>
          </UCard>
        </div>
    </div>

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="'New application'" :description="'Apply to rent a vacant campus space. A signed letter of intent is required.'">
      <template #body>
        <form class="space-y-5" @submit.prevent="submit">
        <UFormField label="Vacant property" name="propertySpace" required>
          <USelect v-model="selectedProperty" :items="propertyOptions" placeholder="Select a vacant property" :disabled="submitting" />
          <p v-if="vacantProperties.length === 0" class="mt-1 text-xs text-muted">No vacant spaces are currently available.</p>
        </UFormField>

        <UFormField label="Letter of intent" name="letterOfIntent" required>
          <UInput :key="letterFormKey" type="file" accept=".pdf,.doc,.docx" :disabled="submitting" :ui="{ leading: 'none' }" @change="(event: Event) => { const input = event.target as HTMLInputElement; letterFile = input.files?.[0] }" />
          <p class="mt-1 text-xs text-muted">Attach your signed letter of intent in PDF or Word format — it is the most important part of your application.</p>
          <p v-if="letterFile" class="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary"><UIcon name="i-lucide-file-text" class="size-3.5" />{{ letterFile.name }}</p>
        </UFormField>

        <UFormField label="Message" name="message">
          <UTextarea v-model="message" placeholder="Anything else you want to add? (Optional)" :rows="4" :disabled="submitting" />
        </UFormField>

        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :description="errorMessage" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="submitting" @click="formOpen = false" />
          <UButton type="submit" :loading="submitting">Submit application</UButton>
        </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
