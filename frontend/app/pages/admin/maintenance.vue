<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
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
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
  reporter?: { id: number; username?: string; email?: string } | null
  followUps?: { message: string; author: string; createdAt: string }[]
}

type ListResponse<T> = { data: T[] }

const STATUSES: MaintenanceTicket['status'][] = ['Pending', 'In Progress', 'Completed']
const CATEGORIES = ['Plumbing', 'Electrical', 'Structural', 'Internet', 'Other'] as const
const PRIORITIES: MaintenanceTicket['priority'][] = ['Low', 'Normal', 'High', 'Critical']

useHead({ title: 'Maintenance tickets | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<MaintenanceTicket>>('/api/maintenance-tickets', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[reporter]': true,
    'populate[images]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 200
  }
})

const { data: tenancyData } = await useFetch<ListResponse<{
  documentId?: string
  status: string
  user?: { id: number; username?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
}>>('/api/tenancies', {
  baseURL,
  headers,
  query: {
    'populate[user]': true,
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 200
  }
})

const tickets = computed(() => data.value?.data ?? [])

const tenancyOptions = computed(() => (tenancyData.value?.data ?? [])
  .filter(tenancy => tenancy.status === 'Active' && tenancy.user && tenancy.propertySpace)
  .map(tenancy => ({
    label: `${tenancy.user!.username} — ${tenancy.propertySpace!.name} (${tenancy.propertySpace!.propertyCode})`,
    value: tenancy.documentId!
  })))

const selectedTenancy = (documentId?: string) =>
  (tenancyData.value?.data ?? []).find(tenancy => tenancy.documentId === documentId) ?? null

const filterStatus = ref('All')
const filterPriority = ref('All')
const filterSearch = ref('')

const filteredTickets = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return tickets.value.filter(ticket => {
    if (filterStatus.value !== 'All' && ticket.status !== filterStatus.value) return false
    if (filterPriority.value !== 'All' && ticket.priority !== filterPriority.value) return false
    if (query) {
      const haystack = [
        ticket.reporter?.username,
        ticket.reporter?.email,
        ticket.propertySpace?.name,
        ticket.propertySpace?.propertyCode,
        ticket.category,
        ticket.description,
        ticket.actionNotes
      ].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const filterCount = computed(() => {
  let count = 0
  if (filterStatus.value !== 'All') count++
  if (filterPriority.value !== 'All') count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterStatus.value = 'All'
  filterPriority.value = 'All'
  filterSearch.value = ''
}

const counts = computed(() => ({
  all: tickets.value.length,
  pending: tickets.value.filter(t => t.status === 'Pending').length,
  'in-progress': tickets.value.filter(t => t.status === 'In Progress').length,
  completed: tickets.value.filter(t => t.status === 'Completed').length
}))

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'maintenance-ticket'; id: string; label: string } | null>(null)

const openHistory = (ticket: MaintenanceTicket) => {
  historyTarget.value = {
    type: 'maintenance-ticket',
    id: String(ticket.documentId ?? ticket.id),
    label: `${ticket.category} — ${ticket.propertySpace?.name ?? 'ticket'}`
  }
  historyOpen.value = true
}

const setStatus = async (ticket: MaintenanceTicket, newStatus: MaintenanceTicket['status']) => {
  const previous = ticket.status
  ticket.status = newStatus
  try {
    await $api(`/api/maintenance-tickets/${ticket.documentId ?? ticket.id}`, {
      method: 'PUT',
      body: { data: { status: newStatus } }
    })
    toast.add({ title: `Ticket marked as ${newStatus.toLowerCase()}`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    ticket.status = previous
    toast.add({ title: 'Could not update ticket', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
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

const priorityCounts = computed(() => ({
  Low: tickets.value.filter(t => t.priority === 'Low').length,
  Normal: tickets.value.filter(t => t.priority === 'Normal').length,
  High: tickets.value.filter(t => t.priority === 'High').length,
  Critical: tickets.value.filter(t => t.priority === 'Critical').length
}))

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

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const expandedFollowUps = ref<Record<string, boolean>>({})
const toggleFollowUps = (ticket: MaintenanceTicket) => {
  const key = String(ticket.documentId ?? ticket.id)
  expandedFollowUps.value[key] = !expandedFollowUps.value[key]
}

const formOpen = ref(false)
const editing = ref<MaintenanceTicket | null>(null)
const saving = ref(false)
const formError = ref('')
const imageUploading = ref(false)
const imageDrafts = ref<UploadedFile[]>([])
const form = reactive({
  tenancy: '',
  category: 'Plumbing' as MaintenanceTicket['category'],
  priority: 'Normal' as MaintenanceTicket['priority'],
  description: '',
  actionNotes: '',
  status: 'Pending' as MaintenanceTicket['status']
})

const resetForm = (ticket: MaintenanceTicket | null) => {
  editing.value = ticket
  imageDrafts.value = ticket?.images?.filter(image => image?.id != null) ?? []
  Object.assign(form, {
    tenancy: '',
    category: ticket?.category ?? 'Plumbing',
    priority: ticket?.priority ?? 'Normal',
    description: ticket?.description ?? '',
    actionNotes: ticket?.actionNotes ?? '',
    status: ticket?.status ?? 'Pending'
  })
  formError.value = ''
}

const openCreate = () => {
  resetForm(null)
  formOpen.value = true
}

const openEdit = (ticket: MaintenanceTicket) => {
  resetForm(ticket)
  formOpen.value = true
}

const onImagesSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  imageUploading.value = true
  formError.value = ''
  try {
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    const uploaded = await $api<UploadedFile[]>('/api/upload', {
      method: 'POST',
      body: formData
    })
    imageDrafts.value.push(...(uploaded ?? []).filter(image => image?.id != null))
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    imageUploading.value = false
  }
}

const removeImage = (image: UploadedFile) => {
  imageDrafts.value = imageDrafts.value.filter(item => item.id !== image.id)
}

const save = async () => {
  formError.value = ''
  if (!editing.value && !form.tenancy) {
    formError.value = 'Please choose the tenant and property the ticket is for.'
    return
  }
  if (!form.description.trim()) {
    formError.value = 'Please describe the issue.'
    return
  }

  saving.value = true
  try {
    if (editing.value) {
      await $api(`/api/maintenance-tickets/${editing.value.documentId ?? editing.value.id}`, {
        method: 'PUT',
        body: {
          data: {
            category: form.category,
            priority: form.priority,
            description: form.description.trim(),
            actionNotes: form.actionNotes?.trim() || undefined,
            images: imageDrafts.value.map(image => image.id),
            status: form.status
          }
        }
      })
      toast.add({ title: 'Ticket updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      const tenancy = selectedTenancy(form.tenancy)
      await $api('/api/maintenance-tickets', {
        method: 'POST',
        body: {
          data: {
            reporter: tenancy?.user?.id,
            propertySpace: tenancy?.propertySpace?.documentId,
            category: form.category,
            priority: form.priority,
            description: form.description.trim(),
            status: form.status
          }
        }
      })
      toast.add({ title: 'Ticket created', color: 'success', icon: 'i-lucide-check-circle' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (ticket: MaintenanceTicket) => {
  const label = `${ticket.reporter?.username ?? 'Unknown'} — ${ticket.category}`
  if (!confirm(`Delete this ticket (${label})? This cannot be undone.`)) return
  try {
    await $api(`/api/maintenance-tickets/${ticket.documentId ?? ticket.id}`, { method: 'DELETE' })
    toast.add({ title: 'Ticket deleted', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete ticket', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Maintenance tickets</h1>
        <p class="mt-2 max-w-xl text-muted">Monitor tenant-reported issues and update their status as they are handled.</p>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="New ticket" icon="i-lucide-plus" @click="openCreate" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load tickets" :description="error.message" />

    <UEmpty v-else-if="tickets.length === 0" icon="i-lucide-wrench" title="No maintenance tickets" description="Tickets reported by tenants will appear here." />

    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="ghost" :color="filterStatus === 'All' ? 'primary' : 'neutral'" label="All" :trailing-icon="undefined" @click="filterStatus = 'All'">
          <template #trailing>
            <span class="text-xs opacity-80">{{ counts.all }}</span>
          </template>
        </UButton>
        <UButton size="sm" variant="ghost" :color="filterStatus === 'Pending' ? 'primary' : 'neutral'" @click="filterStatus = 'Pending'">
          Pending <span class="text-xs opacity-80">{{ counts.pending }}</span>
        </UButton>
        <UButton size="sm" variant="ghost" :color="filterStatus === 'In Progress' ? 'primary' : 'neutral'" @click="filterStatus = 'In Progress'">
          In Progress <span class="text-xs opacity-80">{{ counts['in-progress'] }}</span>
        </UButton>
        <UButton size="sm" variant="ghost" :color="filterStatus === 'Completed' ? 'primary' : 'neutral'" @click="filterStatus = 'Completed'">
          Completed <span class="text-xs opacity-80">{{ counts.completed }}</span>
        </UButton>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="[{ label: 'All statuses', value: 'All' }, ...STATUSES.map(s => ({ label: s, value: s }))]" />
          </UFormField>
          <UFormField label="Priority">
            <USelect v-model="filterPriority" :items="[{ label: 'All priorities', value: 'All' }, ...PRIORITIES.map(p => ({ label: p, value: p }))]" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Tenant, space, category, description…" icon="i-lucide-search" />
          </UFormField>
          <div class="flex items-end justify-end">
            <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
          </div>
        </div>
      </UCard>

      <UEmpty v-if="filteredTickets.length === 0" icon="i-lucide-filter" title="No matching tickets" description="No tickets match the current filters." />
      <div v-else class="space-y-4">
        <UCard v-for="item in filteredTickets" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UIcon :name="categoryIcon(item.category)" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ item.category }} — {{ item.status }}</p>
                <p class="mt-0.5 text-xs text-muted">Reported {{ formatDateTime(item.createdAt) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <UBadge :color="priorityColor(item.priority)" variant="subtle">{{ item.priority }}</UBadge>
              <UFormField label="Status">
                <USelect :model-value="item.status" :items="STATUSES.map(s => ({ label: s, value: s }))" size="sm" class="w-40" @update:model-value="(value: string) => setStatus(item, value as MaintenanceTicket['status'])" />
              </UFormField>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ item.reporter?.username ?? item.reporter?.email ?? 'Unknown' }}</span>
            <span v-if="item.propertySpace" class="flex items-center gap-1">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ item.propertySpace.name }}
              <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
            </span>
            <span v-else class="flex items-center gap-1"><UIcon name="i-lucide-building" class="size-3.5" />No property attached</span>
          </div>

          <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.description }}</p>

          <div v-if="item.images?.length" class="mt-4 flex flex-wrap gap-2">
            <a v-for="image in item.images" :key="image.id" :href="`${baseURL}${image.url}`" target="_blank" rel="noopener">
              <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Ticket photo'" class="h-24 w-24 rounded-lg object-cover transition-transform hover:scale-105" />
            </a>
          </div>

          <div v-if="item.actionNotes" class="mt-4 rounded-lg bg-primary/5 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">Action notes</p>
            <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.actionNotes }}</p>
          </div>

          <div v-if="item.status === 'Completed' && item.completedAt" class="mt-4 flex items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-check-circle-2" class="size-3.5 text-success-500" />
            Completed {{ formatDateTime(item.completedAt) }}
          </div>

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

          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-default pt-4">
            <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
            <UButton v-if="item.status !== 'In Progress'" label="Mark in progress" icon="i-lucide-play" color="secondary" variant="subtle" size="sm" @click="setStatus(item, 'In Progress')" />
            <UButton v-if="item.status !== 'Completed'" label="Mark completed" icon="i-lucide-check-check" color="success" variant="subtle" size="sm" @click="setStatus(item, 'Completed')" />
            <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(item)" />
            <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(item)" />
            <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(item)" />
          </div>
        </UCard>
      </div>
    </div>

    <StatusHistoryModal
      v-if="historyTarget"
      v-model:open="historyOpen"
      :entity-type="historyTarget.type"
      :entity-id="historyTarget.id"
      :entity-label="historyTarget.label"
    />
  </main>

  <UModal v-model:open="formOpen" :title="editing ? 'Edit ticket' : 'New ticket'" :description="editing ? 'Update the details of this maintenance ticket.' : 'Log a maintenance issue reported by a tenant.'">
    <template #body>
      <form class="space-y-4" @submit.prevent="save">
        <UFormField v-if="!editing" label="Tenant and property" required>
          <USelect v-model="form.tenancy" :items="tenancyOptions" placeholder="Select an active tenancy" searchable />
          <p v-if="tenancyOptions.length === 0" class="mt-1 text-xs text-muted">No active tenancies found. Create a tenancy first.</p>
        </UFormField>

        <UFormField label="Category" required>
          <USelect v-model="form.category" :items="CATEGORIES.map(c => ({ label: c, value: c }))" :disabled="saving" />
        </UFormField>

        <UFormField label="Priority">
          <USelect v-model="form.priority" :items="PRIORITIES.map(p => ({ label: p, value: p }))" :disabled="saving" />
        </UFormField>

        <UFormField label="Description" required>
          <UTextarea v-model="form.description" placeholder="Describe the issue and where in the space it is…" :rows="4" :disabled="saving" />
        </UFormField>

        <UFormField v-if="editing" label="Photos" description="Photos of the issue for the maintenance team.">
          <div class="flex flex-wrap items-center gap-3">
            <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': imageUploading }">
              <UIcon :name="imageUploading ? 'i-lucide-loader-2' : 'i-lucide-image-plus'" class="size-4" :class="{ 'animate-spin': imageUploading }" />
              {{ imageUploading ? 'Uploading…' : 'Upload photos' }}
              <input type="file" accept="image/*" multiple class="sr-only" :disabled="imageUploading" @change="onImagesSelected" />
            </label>
            <div v-if="imageDrafts.length" class="flex flex-wrap gap-2">
              <div v-for="image in imageDrafts" :key="image.id" class="group relative">
                <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Photo'" class="h-20 w-20 rounded-lg object-cover" />
                <button type="button" class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted shadow hover:text-error" @click="removeImage(image)">
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </div>
            </div>
          </div>
        </UFormField>

        <UFormField v-if="editing" label="Action notes" description="What was done to resolve the issue.">
          <UTextarea v-model="form.actionNotes" :rows="2" :disabled="saving" />
        </UFormField>

        <UFormField label="Status">
          <USelect v-model="form.status" :items="STATUSES.map(s => ({ label: s, value: s }))" :disabled="saving" />
        </UFormField>

        <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
          <UButton type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Create ticket' }}</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
