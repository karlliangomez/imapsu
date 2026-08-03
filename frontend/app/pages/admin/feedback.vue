<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type Feedback = {
  id: number | string
  documentId?: string
  tenantName?: string
  rating: number
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
  author?: { id: number; username?: string; email?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Student feedback | iMapSU' })

const auth = useAuth()
const { baseURL } = useStrapi()
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

const filterRating = ref<'All' | number>('All')
const filterSearch = ref('')

const filteredFeedbacks = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return feedbacks.value.filter(item => {
    if (filterRating.value !== 'All' && item.rating !== filterRating.value) return false
    if (query) {
      const haystack = [
        item.author?.username,
        item.author?.email,
        item.tenantName,
        item.propertySpace?.name,
        item.propertySpace?.propertyCode,
        item.comment
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
  return result
})

const filterCount = computed(() => {
  let count = 0
  if (filterRating.value !== 'All') count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterRating.value = 'All'
  filterSearch.value = ''
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Student feedback</h1>
        <p class="mt-2 max-w-xl text-muted">Review what students are saying about stall tenants. Feedback is read-only and cannot be edited or removed.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load feedback" :description="error.message" />

    <UEmpty v-else-if="feedbacks.length === 0" icon="i-lucide-message-square" title="No feedback yet" description="Feedback submitted by students will appear here." />

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <UButton size="sm" variant="ghost" :color="filterRating === 'All' ? 'primary' : 'neutral'" @click="filterRating = 'All'">
          All <span class="text-xs opacity-80">{{ counts.All }}</span>
        </UButton>
        <UButton v-for="star in 5" :key="star" size="sm" variant="ghost" :color="filterRating === star ? 'primary' : 'neutral'" @click="filterRating = star">
          <UIcon name="i-lucide-star" class="size-3.5" />
          {{ star }}
          <span class="text-xs opacity-80">{{ counts[star] }}</span>
        </UButton>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="Rating">
            <USelect
              v-model="filterRating"
              :items="[
                { label: 'All ratings', value: 'All' },
                ...([5, 4, 3, 2, 1].map(star => ({ label: `${star} stars`, value: star })))
              ]"
            />
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
            <div class="flex items-center gap-1">
              <UIcon
                v-for="star in 5"
                :key="star"
                :name="star <= item.rating ? 'i-lucide-star' : 'i-lucide-star-outline'"
                class="size-4"
                :class="star <= item.rating ? 'text-secondary' : 'text-muted'"
              />
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
