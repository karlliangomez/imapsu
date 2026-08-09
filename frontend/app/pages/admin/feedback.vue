<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type Feedback = {
  id: number | string
  documentId?: string
  tenantName?: string
  category?: string
  staffAction?: string
  rating: number
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
  author?: { id: number; username?: string; email?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Student Feedback | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Feedback>>('/api/feedbacks', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[author]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 200
  }
})

const feedbacks = computed(() => data.value?.data ?? [])

const CATEGORY_OPTIONS = [
  { label: 'Product', value: 'Product' },
  { label: 'Service', value: 'Service' },
  { label: 'Cleanliness', value: 'Cleanliness' },
  { label: 'Environment', value: 'Environment' },
  { label: 'Staff', value: 'Staff' },
  { label: 'Other', value: 'Other' }
]

const filterRating = ref<'All' | number>('All')
const filterCategory = ref('All')
const filterUnaddressed = ref(false)
const filterSearch = ref('')

const filteredFeedbacks = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return feedbacks.value.filter(item => {
    if (filterRating.value !== 'All' && item.rating !== filterRating.value) return false
    if (filterCategory.value !== 'All' && (item.category ?? 'Other') !== filterCategory.value) return false
    if (filterUnaddressed.value && item.staffAction) return false
    if (query) {
      const haystack = [
        item.author?.username,
        item.author?.email,
        item.tenantName,
        item.propertySpace?.name,
        item.propertySpace?.propertyCode,
        item.comment,
        item.staffAction
      ].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const counts = computed(() => {
  const result: Record<string, number> = { All: feedbacks.value.length }
  for (let star = 5; star >= 1; star--) {
    result[star] = feedbacks.value.filter(item => item.rating === star).length
  }
  for (const option of CATEGORY_OPTIONS) {
    result[option.value] = feedbacks.value.filter(item => (item.category ?? 'Other') === option.value).length
  }
  result.unaddressed = feedbacks.value.filter(item => !item.staffAction).length
  return result
})

const filterCount = computed(() => {
  let count = 0
  if (filterRating.value !== 'All') count++
  if (filterCategory.value !== 'All') count++
  if (filterUnaddressed.value) count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterRating.value = 'All'
  filterCategory.value = 'All'
  filterUnaddressed.value = false
  filterSearch.value = ''
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const recurringConcerns = computed(() => {
  const groups: { label: string; count: number; average: number }[] = []
  for (const option of CATEGORY_OPTIONS) {
    const items = feedbacks.value.filter(item => (item.category ?? 'Other') === option.value)
    if (items.length === 0) continue
    const average = items.reduce((sum, item) => sum + item.rating, 0) / items.length
    groups.push({ label: option.value, count: items.length, average: Number(average.toFixed(1)) })
  }
  return groups.sort((a, b) => b.count - a.count)
})

const actionDrafts = reactive<Record<string, string>>({})
const actionSaving = ref<string | null>(null)
const actionError = ref('')

const draftFor = (item: Feedback) => {
  const key = String(item.documentId ?? item.id)
  if (actionDrafts[key] == null) actionDrafts[key] = item.staffAction ?? ''
  return actionDrafts[key]
}

const saveAction = async (item: Feedback) => {
  const key = String(item.documentId ?? item.id)
  actionSaving.value = key
  actionError.value = ''
  try {
    await $api(`/api/feedbacks/${key}`, {
      method: 'PUT',
      body: {
        data: {
          category: item.category ?? 'Other',
          staffAction: draftFor(item)?.trim() || undefined
        }
      }
    })
    toast.add({ title: 'Feedback action recorded', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    actionError.value = getErrorMessage(err)
  } finally {
    actionSaving.value = null
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Student Feedback</h1>
        <p class="mt-2 max-w-xl text-muted">Review what students are saying about stall tenants, spot recurring concerns, and record the action taken. Original feedback is immutable.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load feedback" :description="error.message" />

    <UEmpty v-else-if="feedbacks.length === 0" icon="i-lucide-message-square" title="No feedback yet" description="Feedback submitted by students will appear here." />

    <div v-else class="space-y-4">
      <div v-if="recurringConcerns.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="concern in recurringConcerns" :key="concern.label" :ui="{ body: 'p-4' }">
          <div class="flex items-center justify-between">
            <p class="font-medium text-highlighted">{{ concern.label }}</p>
            <UBadge color="secondary" variant="subtle">{{ concern.count }}×</UBadge>
          </div>
          <div class="mt-2 flex items-center justify-between text-sm">
            <span class="text-muted">Avg. rating</span>
            <span class="font-semibold text-highlighted">{{ concern.average }}<span class="text-xs text-muted"> / 5</span></span>
          </div>
        </UCard>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton size="sm" variant="ghost" :color="filterRating === 'All' ? 'primary' : 'neutral'" @click="filterRating = 'All'">
          All <span class="text-xs opacity-80">{{ counts.All }}</span>
        </UButton>
        <UButton v-for="star in 5" :key="star" size="sm" variant="ghost" :color="filterRating === star ? 'primary' : 'neutral'" @click="filterRating = star">
          <UIcon name="i-lucide-star" class="size-3.5" />
          {{ star }}
          <span class="text-xs opacity-80">{{ counts[star] }}</span>
        </UButton>
        <UButton size="sm" variant="ghost" :color="filterUnaddressed ? 'primary' : 'neutral'" @click="filterUnaddressed = !filterUnaddressed">
          <UIcon name="i-lucide-circle-alert" class="size-3.5" />
          Unaddressed
          <span class="text-xs opacity-80">{{ counts.unaddressed }}</span>
        </UButton>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Rating">
            <USelect
              v-model="filterRating"
              :items="[
                { label: 'All ratings', value: 'All' },
                ...([5, 4, 3, 2, 1].map(star => ({ label: `${star} stars`, value: star })))
              ]"
            />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="filterCategory" :items="[{ label: 'All categories', value: 'All' }, ...CATEGORY_OPTIONS]" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Student, tenant, space, comment…" icon="i-lucide-search" />
          </UFormField>
          <div class="flex items-end justify-end">
            <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
          </div>
        </div>
      </UCard>

      <UEmpty v-if="filteredFeedbacks.length === 0" icon="i-lucide-filter" title="No matching feedback" description="No feedback matches the current filters." />
      <div v-else class="space-y-4">
        <UCard v-for="item in filteredFeedbacks" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-1">
                <UIcon
                  v-for="star in 5"
                  :key="star"
                  name="i-lucide-star"
                  class="size-4"
                  :class="star <= item.rating ? 'text-secondary fill-current' : 'text-toned'"
                />
              </div>
              <UBadge color="neutral" variant="subtle">{{ item.category ?? 'Other' }}</UBadge>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span v-if="item.propertySpace" class="flex items-center gap-1">
                <UIcon name="i-lucide-building-2" class="size-3.5" />
                {{ item.propertySpace.name }}
                <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
              </span>
              <span v-if="item.tenantName" class="flex items-center gap-1">
                <UIcon name="i-lucide-user" class="size-3.5" />
                Tenant: {{ item.tenantName }}
              </span>
            </div>
          </div>

          <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.comment || 'No comment left.' }}</p>

          <div class="mt-4 rounded-lg border border-default p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">Staff action</p>
            <div class="mt-2 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
              <UTextarea :model-value="draftFor(item)" :rows="2" placeholder="What action was taken in response to this feedback?" @update:model-value="(value: string) => { actionDrafts[String(item.documentId ?? item.id)] = value }" />
              <UButton :loading="actionSaving === String(item.documentId ?? item.id)" icon="i-lucide-save" @click="saveAction(item)">Save action</UButton>
            </div>
            <p v-if="actionError" class="mt-2 text-xs text-error">{{ actionError }}</p>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
            <p class="flex items-center gap-1.5 text-xs text-muted">
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-graduation-cap" class="size-3.5" />
                {{ item.author?.username ?? item.author?.email ?? 'Unknown student' }}
              </span>
              <span>· {{ formatDate(item.createdAt) }}</span>
            </p>
          </div>
        </UCard>
      </div>
    </div>
  </main>
</template>
