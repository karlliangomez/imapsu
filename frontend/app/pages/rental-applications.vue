<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['aspiring-tenant']
})

type MediaDoc = { id: number; url?: string; name?: string }
type DocField = 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits'

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
  message?: string
  createdAt?: string
  letterOfIntent?: MediaDoc | null
  dtiDocuments?: MediaDoc[] | null
  birDocuments?: MediaDoc[] | null
  businessPermits?: MediaDoc[] | null
  productsServices?: string
  appearanceDate?: string
  appearanceConfirmed?: boolean
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type PropertySpace = { documentId: string; name: string; propertyCode: string; building: string; monthlyRent?: number | string }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Rental Applications | iMapSU' })

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
    'populate[dtiDocuments]': true,
    'populate[birDocuments]': true,
    'populate[businessPermits]': true,
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

const docSections: { key: DocField; label: string; hint: string }[] = [
  { key: 'letterOfIntent', label: 'Letter of intent', hint: 'Signed letter of intent in PDF or Word format.' },
  { key: 'dtiDocuments', label: 'DTI business documents', hint: 'e.g. DTI business name registration, SEC/DTI incorporation documents.' },
  { key: 'birDocuments', label: 'BIR business documents', hint: 'e.g. BIR Certificate of Registration (2303), latest tax returns.' },
  { key: 'businessPermits', label: 'Business permits', hint: 'e.g. city/municipal business permit, fire safety inspection certificate.' }
]
const stagedSections = computed(() => docSections.filter(section => section.key !== 'letterOfIntent') as { key: Exclude<DocField, 'letterOfIntent'>; label: string; hint: string }[])

const docsOf = (item: RentalApplication, key: DocField) => {
  const value = item[key]
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

const selectedProperty = ref<string>()
const message = ref('')
const productsServices = ref('')
const letterFile = ref<File>()
const letterFormKey = ref(0)
const submitting = ref(false)
const errorMessage = ref('')
const formOpen = ref(false)

type StagedFile = { key: number; file: File }
const staged = reactive<Record<Exclude<DocField, 'letterOfIntent'>, StagedFile[]>>({
  dtiDocuments: [],
  birDocuments: [],
  businessPermits: []
})
let stagedKey = 0
const addFiles = (field: Exclude<DocField, 'letterOfIntent'>, files?: FileList) => {
  if (!files) return
  Array.from(files).forEach(file => staged[field].push({ key: stagedKey++, file }))
}
const removeFile = (field: Exclude<DocField, 'letterOfIntent'>, key: number) => {
  staged[field] = staged[field].filter(entry => entry.key !== key)
}

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
  for (const section of stagedSections.value) {
    if (staged[section.key].length === 0) {
      errorMessage.value = `Please attach your ${section.label.toLowerCase()}.`
      return
    }
  }
  if (!productsServices.value.trim()) {
    errorMessage.value = 'Please describe the products or services you plan to offer.'
    return
  }

  submitting.value = true
  try {
    const uploadFiles = async (files: File[]) => {
      if (files.length === 0) return [] as { id: number }[]
      const form = new FormData()
      files.forEach(file => form.append('files', file))
      return $api<{ id: number }[]>('/api/upload', { method: 'POST', body: form })
    }
    const [letterUploaded, dtiUploaded, birUploaded, permitUploaded] = await Promise.all([
      uploadFiles(letterFile.value ? [letterFile.value] : []),
      uploadFiles(staged.dtiDocuments.map(entry => entry.file)),
      uploadFiles(staged.birDocuments.map(entry => entry.file)),
      uploadFiles(staged.businessPermits.map(entry => entry.file))
    ])
    const letterId = letterUploaded[0]?.id
    if (!letterId) throw new Error('Upload failed')

    await $api('/api/rental-applications', {
      method: 'POST',
      body: {
        propertySpace: selectedProperty.value,
        message: message.value || undefined,
        letterOfIntent: letterId,
        dtiDocuments: dtiUploaded.map(file => file.id),
        birDocuments: birUploaded.map(file => file.id),
        businessPermits: permitUploaded.map(file => file.id),
        productsServices: productsServices.value.trim()
      }
    })
    selectedProperty.value = undefined
    message.value = ''
    productsServices.value = ''
    letterFile.value = undefined
    letterFormKey.value++
    staged.dtiDocuments = []
    staged.birDocuments = []
    staged.businessPermits = []
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

const missingKey = ref<string | null>(null)
const missingError = ref('')

const uploadMissing = async (item: RentalApplication, field: DocField, files?: FileList) => {
  if (!files || files.length === 0) return
  const docId = item.documentId ?? item.id
  missingKey.value = `${docId}:${field}`
  missingError.value = ''
  try {
    const form = new FormData()
    Array.from(files).forEach(file => form.append('files', file))
    const uploaded = await $api<{ id: number }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const newIds = uploaded.map(file => file.id)
    const existingIds = docsOf(item, field).map(doc => doc.id)
    const value = field === 'letterOfIntent' ? newIds[0] : [...existingIds, ...newIds]
    if (!value || (Array.isArray(value) && value.length === 0)) throw new Error('Upload failed')

    await $api(`/api/rental-applications/${docId}`, {
      method: 'PUT',
      body: { data: { [field]: value } }
    })
    const section = docSections.find(entry => entry.key === field)
    toast.add({ title: `${section?.label ?? 'Documents'} added`, description: `Your ${section?.label.toLowerCase() ?? 'documents'} were attached to this application.`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    missingError.value = getErrorMessage(err)
  } finally {
    missingKey.value = null
  }
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatAppearance = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const appearanceDayPassed = (value?: string) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Date.now() >= end.getTime()
}

const confirmingFor = ref<string | null>(null)

const confirmAppearance = async (item: RentalApplication) => {
  const docId = item.documentId ?? item.id
  confirmingFor.value = String(docId)
  try {
    await $api(`/api/rental-applications/${docId}`, {
      method: 'PUT',
      body: { data: { appearanceConfirmed: true } }
    })
    toast.add({ title: 'Attendance confirmed', description: 'You confirmed your office visit for this application.', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not confirm attendance', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    confirmingFor.value = null
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Aspiring tenant</p>
        <h1 class="imapsu-page-heading">Rental Applications</h1>
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

            <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt class="text-xs text-muted">Property</dt><dd class="font-medium text-highlighted">{{ item.propertySpace?.name ?? '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Documents</dt><dd class="font-medium text-highlighted">{{ docSections.filter(section => docsOf(item, section.key).length).length }} of {{ docSections.length }} complete</dd></div>
            </dl>

            <div v-if="item.status === 'Approved' && item.appearanceDate" class="mt-4 rounded-lg border p-4" :class="item.appearanceConfirmed ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-start gap-2.5">
                  <UIcon :name="item.appearanceConfirmed ? 'i-lucide-badge-check' : 'i-lucide-calendar-check'" class="mt-0.5 size-4 shrink-0" :class="item.appearanceConfirmed ? 'text-success' : 'text-warning'" />
                  <div>
                    <p class="text-sm font-medium text-highlighted">{{ item.appearanceConfirmed ? 'Attendance confirmed' : `Report to the office on ${formatAppearance(item.appearanceDate)}` }}</p>
                    <p class="mt-0.5 text-xs text-muted">
                      <template v-if="item.appearanceConfirmed">Thank you for confirming your office visit for this application.</template>
                      <template v-else-if="appearanceDayPassed(item.appearanceDate)">The appearance date has passed. Please contact the OAS office; unconfirmed applications are declined after this day.</template>
                      <template v-else>Please show up at the OAS office on {{ formatAppearance(item.appearanceDate) }} and confirm your attendance. Unconfirmed applications are declined after this day.</template>
                    </p>
                  </div>
                </div>
                <UButton v-if="!item.appearanceConfirmed && !appearanceDayPassed(item.appearanceDate)" label="Confirm attendance" icon="i-lucide-check" :loading="confirmingFor === String(item.documentId ?? item.id)" @click="confirmAppearance(item)" />
              </div>
            </div>

            <p v-if="item.status === 'Declined' && item.appearanceDate && !item.appearanceConfirmed" class="mt-3 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-clock" class="size-3.5" />Declined after the scheduled office visit on {{ formatAppearance(item.appearanceDate) }} was not confirmed.</p>

            <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

            <div class="mt-4 border-t border-default pt-4">
              <p class="mb-2 text-xs font-medium text-muted">Application documents</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="section in docSections" :key="section.key">
                  <p class="mb-1 text-xs font-medium text-muted">{{ section.label }}</p>
                  <div v-if="docsOf(item, section.key).length" class="space-y-1">
                    <a v-for="doc in docsOf(item, section.key)" :key="doc.id" :href="`${baseURL}${doc.url}`" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View {{ doc.name || 'document' }}</a>
                  </div>
                  <label v-else class="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': missingKey === `${item.documentId ?? item.id}:${section.key}` }">
                    <UIcon name="i-lucide-folder-up" class="size-4" />
                    {{ section.key === 'letterOfIntent' ? 'Attach file' : 'Attach files' }}
                    <input type="file" accept=".pdf,.doc,.docx" :multiple="section.key !== 'letterOfIntent'" class="sr-only" :disabled="missingKey === `${item.documentId ?? item.id}:${section.key}`" @change="(event: Event) => { const input = event.target as HTMLInputElement; uploadMissing(item, section.key, input.files).then(() => { input.value = '' }) }" />
                  </label>
                </div>
              </div>
              <p v-if="missingKey" class="mt-2 text-xs text-muted">Uploading…</p>
              <p v-if="missingError" class="mt-2 text-xs text-error">{{ missingError }}</p>
              <div v-if="item.productsServices" class="mt-4">
                <p class="mb-1 text-xs font-medium text-muted">Products / services offered</p>
                <p class="text-sm leading-relaxed text-toned">{{ item.productsServices }}</p>
              </div>
            </div>
          </UCard>
        </div>
    </div>

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="'New application'" :description="'Apply to rent a vacant campus space. A complete document set is required: letter of intent, DTI and BIR business documents, and business permits.'">
      <template #body>
        <form class="space-y-5" @submit.prevent="submit">
        <UFormField label="Vacant property" name="propertySpace" required>
          <USelect v-model="selectedProperty" :items="propertyOptions" placeholder="Select a vacant property" :disabled="submitting" />
          <p v-if="vacantProperties.length === 0" class="mt-1 text-xs text-muted">No vacant spaces are currently available.</p>
        </UFormField>

        <UFormField label="Letter of intent" name="letterOfIntent" required>
          <label class="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': submitting }">
            <UIcon name="i-lucide-folder-up" class="size-4" />
            Choose file
            <input :key="letterFormKey" type="file" accept=".pdf,.doc,.docx" class="sr-only" :disabled="submitting" @change="(event: Event) => { const input = event.target as HTMLInputElement; letterFile = input.files?.[0] }" />
          </label>
          <p v-if="letterFile" class="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary"><UIcon name="i-lucide-file-text" class="size-3.5" />{{ letterFile.name }}</p>
          <p v-else class="mt-1 text-xs text-muted">Attach your signed letter of intent in PDF or Word format.</p>
        </UFormField>

        <UFormField v-for="section in stagedSections" :key="section.key" :label="section.label" required>
          <label class="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': submitting }">
            <UIcon name="i-lucide-folder-up" class="size-4" />
            Choose files
            <input type="file" accept=".pdf,.doc,.docx" multiple class="sr-only" :disabled="submitting" @change="(event: Event) => { const input = event.target as HTMLInputElement; addFiles(section.key, input.files); input.value = '' }" />
          </label>
          <ul v-if="staged[section.key].length" class="mt-2 space-y-1">
            <li v-for="entry in staged[section.key]" :key="entry.key" class="flex items-center justify-between gap-2 rounded-md border border-default px-2 py-1 text-sm">
              <span class="flex min-w-0 items-center gap-1.5 truncate text-toned"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ entry.file.name }}</span></span>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :disabled="submitting" @click="removeFile(section.key, entry.key)" />
            </li>
          </ul>
          <p v-else class="mt-1 text-xs text-muted">{{ section.hint }}</p>
        </UFormField>

        <UFormField label="Products / services" name="productsServices" required description="Describe what your business will offer from this space.">
          <UTextarea v-model="productsServices" :rows="3" placeholder="e.g. A coffee shop and bakery offering specialty drinks, pastries, and light meals." :disabled="submitting" />
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