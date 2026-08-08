<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type UploadedFile = { id: number; url?: string; name?: string }

type MaintenanceTicket = {
  id: number | string
  documentId?: string
  category: 'Plumbing' | 'Electrical' | 'Structural' | 'Internet' | 'Other'
  priority: 'Low' | 'Normal' | 'High' | 'Critical'
  description: string
  status: 'Pending' | 'In Progress' | 'Completed'
  createdAt?: string
  completedAt?: string
  actionNotes?: string
  images?: UploadedFile[] | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  followUps?: { message: string; author: string; createdAt: string }[]
}

type Tenancy = {
  id: number | string
  documentId?: string
  status: 'Active' | 'Ended' | 'Terminated'
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}
type ListResponse<T> = { data: T[] }

const CATEGORIES = ['Plumbing', 'Electrical', 'Structural', 'Internet', 'Other']
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'] as const

useHead({ title: 'Maintenance | iMapSU' })

const auth = useAuth()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<MaintenanceTicket>>('/api/maintenance-tickets', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[images]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 50
  }
})

const tickets = computed(() => data.value?.data ?? [])

const { data: tenancyData } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 10
  }
})

const tenancies = computed(() => tenancyData.value?.data ?? [])
const activeTenancy = computed(() => tenancies.value.find(tenancy => tenancy.status === 'Active') ?? tenancies.value[0])
const rentedProperty = computed(() => activeTenancy.value?.propertySpace ?? null)
const selectedProperty = computed(() => rentedProperty.value?.documentId)

const category = ref<string>('Plumbing')
const priority = ref<'Low' | 'Normal' | 'High' | 'Critical'>('Normal')
const description = ref('')
const imageFiles = ref<File[]>([])
const submitting = ref(false)
const errorMessage = ref('')

const onImagesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  imageFiles.value = Array.from(input.files ?? [])
}

const submit = async () => {
  errorMessage.value = ''
  if (!selectedProperty.value) {
    errorMessage.value = 'No active tenancy found for your account. Please contact the office.'
    return
  }
  if (!description.value.trim()) {
    errorMessage.value = 'Please describe the issue.'
    return
  }

  submitting.value = true
  try {
    let imageIds: number[] = []
    if (imageFiles.value.length) {
      const formData = new FormData()
      for (const file of imageFiles.value) formData.append('files', file)
      const uploaded = await $api<UploadedFile[]>('/api/upload', {
        method: 'POST',
        body: formData
      })
      imageIds = (uploaded ?? []).map(file => file.id).filter((id): id is number => id != null)
    }
    await $api('/api/maintenance-tickets', {
      method: 'POST',
      body: {
        propertySpace: selectedProperty.value,
        category: category.value,
        priority: priority.value,
        description: description.value.trim(),
        images: imageIds.length ? imageIds : undefined
      }
    })
    category.value = 'Plumbing'
    priority.value = 'Normal'
    description.value = ''
    imageFiles.value = []
    await refresh()
  } catch (err) {
    errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const statusColor = (status: MaintenanceTicket['status']) => {
  switch (status) {
    case 'Completed':
      return 'success'
    case 'In Progress':
      return 'secondary'
    default:
      return 'primary'
  }
}

const priorityColor = (priority: MaintenanceTicket['priority']) => {
  switch (priority) {
    case 'Critical': return 'error'
    case 'High': return 'warning'
    case 'Low': return 'neutral'
    default: return 'secondary'
  }
}

const categoryIcon = (category: MaintenanceTicket['category']) => {
  switch (category) {
    case 'Plumbing':
      return 'i-lucide-droplets'
    case 'Electrical':
      return 'i-lucide-zap'
    case 'Structural':
      return 'i-lucide-hammer'
    case 'Internet':
      return 'i-lucide-wifi'
    default:
      return 'i-lucide-package-open'
  }
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const expandedFollowUps = ref<Record<string, boolean>>({})
const toggleFollowUps = (ticket: MaintenanceTicket) => {
  const key = String(ticket.documentId ?? ticket.id)
  expandedFollowUps.value[key] = !expandedFollowUps.value[key]
}

const followUpOpen = ref(false)
const followUpTarget = ref<MaintenanceTicket | null>(null)
const followUpMessage = ref('')
const followUpSending = ref(false)
const followUpError = ref('')

const openFollowUp = (ticket: MaintenanceTicket) => {
  followUpTarget.value = ticket
  followUpMessage.value = ''
  followUpError.value = ''
  followUpOpen.value = true
}

const closeFollowUp = () => {
  followUpOpen.value = false
  followUpTarget.value = null
}

const submitFollowUp = async () => {
  if (!followUpTarget.value) return
  followUpError.value = ''
  if (!followUpMessage.value.trim()) {
    followUpError.value = 'Please write a follow-up message.'
    return
  }

  followUpSending.value = true
  try {
    await $api(`/api/maintenance-tickets/${followUpTarget.value.documentId ?? followUpTarget.value.id}/follow-up`, {
      method: 'POST',
      body: { message: followUpMessage.value.trim() }
    })
    closeFollowUp()
    await refresh()
  } catch (err) {
    followUpError.value = getErrorMessage(err)
  } finally {
    followUpSending.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Current tenant</p>
        <h1 class="imapsu-page-heading">Maintenance</h1>
        <p class="mt-2 max-w-xl text-muted">Report an issue with your space and track how the maintenance team is handling it.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-3">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Report an issue</h2>
        </template>

        <form class="space-y-5" @submit.prevent="submit">
          <UFormField label="Property" name="propertySpace" required>
            <div v-if="rentedProperty" class="flex items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2.5">
              <UIcon name="i-lucide-building-2" class="size-4 shrink-0 text-primary" />
              <span class="truncate text-sm font-medium text-highlighted">{{ rentedProperty.name }}</span>
              <span class="font-mono text-xs text-muted">({{ rentedProperty.propertyCode }})</span>
            </div>
            <p v-else class="text-sm text-muted">No active tenancy found for your account.</p>
          </UFormField>

          <UFormField label="Category" name="category" required>
            <USelect v-model="category" :items="CATEGORIES" :disabled="submitting" />
          </UFormField>

          <UFormField label="Priority" name="priority" description="How urgent is the issue?">
            <USelect v-model="priority" :items="PRIORITIES.map(p => ({ label: p, value: p }))" :disabled="submitting" />
          </UFormField>

          <UFormField label="Description" name="description" required>
            <UTextarea v-model="description" placeholder="Describe the issue and where in the space it is…" :rows="4" :disabled="submitting" />
          </UFormField>

          <UFormField label="Photos" name="images">
            <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': submitting }">
              <UIcon name="i-lucide-image-plus" class="size-4" />
              {{ imageFiles.length ? `${imageFiles.length} photo${imageFiles.length > 1 ? 's' : ''} selected` : 'Add photos' }}
              <input type="file" accept="image/*" multiple class="sr-only" :disabled="submitting" @change="onImagesSelected" />
            </label>
          </UFormField>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :description="errorMessage" />

          <UButton type="submit" block :loading="submitting">Submit ticket</UButton>
        </form>
      </UCard>

      <div class="lg:col-span-2">
        <div v-if="status === 'pending'" class="space-y-4">
          <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
        </div>

        <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load tickets" :description="error.message" />

        <UEmpty v-else-if="tickets.length === 0" icon="i-lucide-wrench" title="No maintenance tickets" description="Tickets you submit will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in tickets" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <UIcon :name="categoryIcon(item.category)" class="size-4" />
                </span>
                <div class="min-w-0">
                  <p class="font-medium text-highlighted">{{ item.category }}</p>
                  <p class="mt-0.5 text-xs text-muted">Reported {{ formatDate(item.createdAt) }}</p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UBadge :color="priorityColor(item.priority)" variant="subtle">{{ item.priority }}</UBadge>
                <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
              </div>
            </div>

            <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.description }}</p>

            <div v-if="item.images?.length" class="mt-4 flex flex-wrap gap-2">
              <a v-for="image in item.images" :key="image.id" :href="`${baseURL}${image.url}`" target="_blank" rel="noopener">
                <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Ticket photo'" class="h-20 w-20 rounded-lg object-cover transition-transform hover:scale-105" />
              </a>
            </div>

            <div v-if="item.actionNotes" class="mt-4 rounded-lg bg-primary/5 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Action taken</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.actionNotes }}</p>
            </div>

            <div v-if="item.status === 'Completed' && item.completedAt" class="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-check-circle-2" class="size-3.5 text-success-500" />
              Completed {{ formatDateTime(item.completedAt) }}
            </div>

            <p v-if="item.propertySpace" class="mt-3 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ item.propertySpace.name }}
              <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
            </p>

            <div v-if="item.followUps?.length" class="mt-4 border-t border-default pt-3">
              <UButton size="xs" color="neutral" variant="ghost" :label="`${item.followUps.length} follow-up${item.followUps.length > 1 ? 's' : ''}`" :icon="expandedFollowUps[String(item.documentId ?? item.id)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" @click="toggleFollowUps(item)" />
              <div v-if="expandedFollowUps[String(item.documentId ?? item.id)]" class="mt-2 space-y-2">
                <div v-for="(followUp, index) in item.followUps" :key="index" class="rounded-md border border-default bg-muted/20 px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="flex items-center gap-1 text-xs font-semibold text-highlighted">
                      <UIcon name="i-lucide-message-square" class="size-3.5 text-primary" />
                      {{ followUp.author }}
                    </p>
                    <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(followUp.createdAt) }}</span>
                  </div>
                  <p class="mt-1 text-sm leading-relaxed text-toned">{{ followUp.message }}</p>
                </div>
              </div>
            </div>

            <div v-if="item.status !== 'Completed'" class="mt-4 flex justify-end border-t border-default pt-3">
              <UButton size="sm" color="secondary" variant="subtle" icon="i-lucide-message-square" label="Follow up" @click="openFollowUp(item)" />
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </main>

  <UModal v-model:open="followUpOpen" class="max-w-xl" title="Follow up on ticket" :description="followUpTarget ? `${followUpTarget.category} — ${followUpTarget.propertySpace?.name ?? 'maintenance ticket'}` : undefined">
    <template #body>
      <form class="space-y-4" @submit.prevent="submitFollowUp">
        <UFormField label="Message" required>
          <UTextarea v-model="followUpMessage" placeholder="Let the maintenance team know the issue is still there…" :rows="4" :disabled="followUpSending" />
        </UFormField>
        <UAlert v-if="followUpError" color="error" icon="i-lucide-circle-alert" :description="followUpError" />
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="followUpSending" @click="closeFollowUp" />
          <UButton type="submit" :loading="followUpSending">Send follow-up</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
