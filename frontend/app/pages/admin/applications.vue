<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
  message?: string
  evaluation?: string
  recommendation?: string
  createdAt?: string
  letterOfIntent?: { id: number; url?: string; name?: string } | null
  user?: { id: number; username?: string; email?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type RenewalIntent = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  message?: string
  createdAt?: string
  letterOfRenewal?: { id: number; url?: string; name?: string } | null
  user?: { id: number; username?: string; email?: string } | null
  tenancy?: { documentId?: string; propertySpace?: { name?: string; propertyCode?: string; building?: string } | null } | null
}

type ApplicationItem = { kind: 'application'; status: RentalApplication['status']; propertySpace?: RentalApplication['propertySpace']; letterOfIntent?: RentalApplication['letterOfIntent']; evaluation?: RentalApplication['evaluation']; recommendation?: RentalApplication['recommendation'] }
  & Pick<RentalApplication, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type RenewalItem = { kind: 'renewal'; status: RenewalIntent['status']; letterOfRenewal?: RenewalIntent['letterOfRenewal']; tenancy?: RenewalIntent['tenancy'] }
  & Pick<RenewalIntent, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type Item = ApplicationItem | RenewalItem

type ListResponse<T> = { data: T[] }

useHead({ title: 'Review applications | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<RentalApplication>>('/api/rental-applications', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[user]': true,
    'populate[letterOfIntent]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

const { data: renewalData, refresh: refreshRenewals } = await useFetch<ListResponse<RenewalIntent>>('/api/renewal-intents', {
  baseURL,
  headers,
  query: {
    'populate[user]': true,
    'populate[tenancy][populate][propertySpace]': true,
    'populate[letterOfRenewal]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

const applications = computed(() => data.value?.data ?? [])
const renewalIntents = computed(() => renewalData.value?.data ?? [])

const items = computed<Item[]>(() => {
  const apps: ApplicationItem[] = applications.value.map(application => ({ kind: 'application', ...application }))
  const renewals: RenewalItem[] = renewalIntents.value.map(renewal => ({ kind: 'renewal', ...renewal }))
  return [...apps, ...renewals].sort((a, b) => {
    const time = (item: Item) => item.createdAt ? new Date(item.createdAt).getTime() : 0
    return time(b) - time(a)
  })
})

const APPLICATION_STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'For Review', value: 'For Review' },
  { label: 'For Recommendation', value: 'For Recommendation' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Declined', value: 'Declined' },
  { label: 'Cancelled', value: 'Cancelled' }
]

const RENEWAL_STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' }
]

const statusOptions = (item: Item) => item.kind === 'renewal' ? RENEWAL_STATUS_OPTIONS : APPLICATION_STATUS_OPTIONS

const statusColor = (status: string) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Declined':
    case 'Rejected':
      return 'error'
    case 'Cancelled':
      return 'neutral'
    case 'For Review':
      return 'warning'
    default:
      return 'secondary'
  }
}

const FILTER_OPTIONS = [
  { label: 'All applications', value: 'all' },
  { label: 'Unanswered (Pending / For Review)', value: 'unanswered' },
  { label: 'For Recommendation', value: 'For Recommendation' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Declined / Rejected', value: 'declined' },
  { label: 'Cancelled', value: 'Cancelled' }
]

const filter = ref('all')
const filterSearch = ref('')

const isUnanswered = (item: Item) => item.kind === 'application' && (item.status === 'Pending' || item.status === 'For Review')

const filteredItems = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return items.value.filter(item => {
    if (filter.value === 'unanswered' && !isUnanswered(item)) return false
    if (filter.value === 'declined' && !(item.status === 'Declined' || item.status === 'Rejected')) return false
    if (filter.value !== 'all' && filter.value !== 'unanswered' && filter.value !== 'declined' && item.status !== filter.value) return false
    if (query) {
      const haystack = [propertyName(item), propertyCode(item) ?? '', item.user?.username ?? '', item.user?.email ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const filterCount = computed(() => (filter.value !== 'all' ? 1 : 0) + (filterSearch.value.trim() ? 1 : 0))

const clearFilters = () => {
  filter.value = 'all'
  filterSearch.value = ''
}

const propertyName = (item: Item) =>
  item.kind === 'renewal'
    ? item.tenancy?.propertySpace?.name ?? 'Property removed'
    : item.propertySpace?.name ?? 'Property removed'

const propertyCode = (item: Item) =>
  item.kind === 'renewal'
    ? item.tenancy?.propertySpace?.propertyCode
    : item.propertySpace?.propertyCode

const letter = (item: Item) =>
  item.kind === 'renewal' ? item.letterOfRenewal : item.letterOfIntent

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const updating = ref<number | string | null>(null)

const refreshAll = async () => {
  await Promise.all([refresh(), refreshRenewals()])
}

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'rental-application' | 'renewal-intent'; id: string; label: string } | null>(null)

const openHistory = (item: Item) => {
  historyTarget.value = {
    type: item.kind === 'renewal' ? 'renewal-intent' : 'rental-application',
    id: String(item.documentId ?? item.id),
    label: propertyName(item)
  }
  historyOpen.value = true
}

const updateStatus = async (item: Item, statusValue: string) => {
  if (statusValue === item.status) return
  updating.value = item.documentId ?? item.id
  try {
    const path = item.kind === 'renewal' ? '/api/renewal-intents' : '/api/rental-applications'
    await $api(`${path}/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: { data: { status: statusValue } }
    })
    toast.add({ title: `${item.kind === 'renewal' ? 'Renewal' : 'Application'} ${statusValue}`, color: statusValue === 'Approved' ? 'success' : 'neutral', icon: 'i-lucide-check-circle' })
    if (item.kind === 'renewal') {
      await refreshRenewals()
    } else {
      await refresh()
    }
  } catch (err) {
    toast.add({ title: 'Could not update status', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    updating.value = null
  }
}

const reviewOpen = ref(false)
const reviewTarget = ref<Item | null>(null)
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewForm = reactive({
  status: 'For Review' as string,
  evaluation: '',
  recommendation: ''
})

const openReview = (item: Item) => {
  reviewTarget.value = item
  reviewForm.status = item.status
  reviewForm.evaluation = 'evaluation' in item ? item.evaluation ?? '' : ''
  reviewForm.recommendation = 'recommendation' in item ? item.recommendation ?? '' : ''
  reviewError.value = ''
  reviewOpen.value = true
}

const saveReview = async () => {
  if (!reviewTarget.value || reviewTarget.value.kind !== 'application') return
  const item = reviewTarget.value as ApplicationItem
  reviewSaving.value = true
  reviewError.value = ''
  try {
    await $api(`/api/rental-applications/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: {
        data: {
          status: reviewForm.status,
          evaluation: reviewForm.evaluation?.trim() || undefined,
          recommendation: reviewForm.recommendation?.trim() || undefined
        }
      }
    })
    toast.add({ title: `Application ${reviewForm.status}`, description: 'Evaluation and recommendation saved.', color: 'success', icon: 'i-lucide-check-circle' })
    reviewOpen.value = false
    await refresh()
  } catch (err) {
    reviewError.value = getErrorMessage(err)
  } finally {
    reviewSaving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Rental applications</h1>
        <p class="mt-2 max-w-xl text-muted">Review applications and contract renewals, inspect letters, record an evaluation and update their status.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load applications" :description="error.message" />

    <UEmpty v-else-if="items.length === 0" icon="i-lucide-file-text" title="No applications" description="Applications and renewal intents will appear here." />

    <div v-else class="space-y-4">
      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Filter">
            <USelect v-model="filter" :items="FILTER_OPTIONS" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Property, code, applicant…" icon="i-lucide-search" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ filteredItems.length }} of {{ items.length }}</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredItems.length === 0" icon="i-lucide-filter" title="No matching applications" description="No applications match the current filters." />
      <template v-else>
        <UCard v-for="item in filteredItems" :key="`${item.kind}-${item.documentId ?? item.id}`" :ui="{ body: 'p-5' }">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                {{ propertyName(item) }}
                <UBadge v-if="item.kind === 'renewal'" color="primary" variant="subtle">Renewal</UBadge>
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span v-if="propertyCode(item)" class="font-mono">{{ propertyCode(item) }}</span>
                <span v-if="item.user" class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ item.user.username }} · {{ item.user.email }}</span>
                <span>Submitted {{ formatDate(item.createdAt) }}</span>
              </p>
            </div>
            <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
          </div>

          <div class="mt-4 border-t border-default pt-4">
            <p class="mb-2 text-xs font-medium text-muted">{{ item.kind === 'renewal' ? 'Letter of renewal intent' : 'Letter of intent' }}</p>
            <a v-if="letter(item)" :href="`${baseURL}${letter(item)!.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View letter</a>
            <span v-else class="text-sm text-muted">Not uploaded</span>
          </div>

          <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

          <div v-if="item.kind === 'application' && (item.evaluation || item.recommendation)" class="mt-4 grid gap-3 sm:grid-cols-2">
            <div v-if="item.evaluation" class="rounded-lg bg-primary/5 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Evaluation</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.evaluation }}</p>
            </div>
            <div v-if="item.recommendation" class="rounded-lg bg-gold-50 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Recommendation</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.recommendation }}</p>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-default pt-4">
            <span class="text-sm font-medium text-highlighted">Update status:</span>
            <USelect
              :model-value="item.status"
              :items="statusOptions(item)"
              class="w-44"
              :disabled="updating === (item.documentId ?? item.id)"
              @update:model-value="(value: unknown) => value && updateStatus(item, String(value))"
            />
            <UButton v-if="item.kind === 'application'" label="Review" icon="i-lucide-clipboard-list" color="primary" variant="subtle" size="sm" @click="openReview(item)" />
            <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(item)" />
          </div>
        </UCard>
      </template>
    </div>

    <UModal v-model:open="reviewOpen" class="max-w-2xl" title="Review application" description="Record your evaluation, recommendation and next status for this application.">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveReview">
          <UFormField label="Status" required>
            <USelect v-model="reviewForm.status" :items="APPLICATION_STATUS_OPTIONS" />
          </UFormField>
          <UFormField label="Evaluation" description="Assessment of the application against the property's requirements.">
            <UTextarea v-model="reviewForm.evaluation" :rows="3" placeholder="e.g. Applicant's business plan is viable; financial capacity is adequate." />
          </UFormField>
          <UFormField label="Recommendation">
            <UTextarea v-model="reviewForm.recommendation" :rows="2" placeholder="e.g. Recommend approval pending background check." />
          </UFormField>
          <UAlert v-if="reviewError" color="error" icon="i-lucide-circle-alert" :description="reviewError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="reviewSaving" @click="reviewOpen = false" />
            <UButton type="submit" :loading="reviewSaving">Save review</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <StatusHistoryModal
      v-if="historyTarget"
      v-model:open="historyOpen"
      :entity-type="historyTarget.type"
      :entity-id="historyTarget.id"
      :entity-label="historyTarget.label"
    />
  </main>
</template>
