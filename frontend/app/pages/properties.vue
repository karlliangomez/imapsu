<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

type PropertySpace = {
  id: string | number
  documentId?: string
  propertyCode: string
  name: string
  building: string
  floor?: string
  description?: string
  area?: number | string
  space_status: 'Vacant' | 'Occupied'
  monthlyRent?: number | string
}

type Feedback = {
  id: number | string
  documentId?: string
  tenantName?: string
  rating: number
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string } | null
}

type ActiveTenant = { propertyDocumentId: string; tenantName: string | null }

type PropertyResponse = { data: PropertySpace[] }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Properties | iMapSU Property Management' })

const config = useRuntimeConfig()
const auth = useAuth()
const headers = { Authorization: `Bearer ${auth.token.value}` }
const { data, status, error, refresh } = await useFetch<PropertyResponse>('/api/properties', {
  baseURL: config.public.strapiUrl,
  headers
})

const { data: tenantData } = await useFetch<ListResponse<ActiveTenant>>('/api/properties/active-tenants', {
  baseURL: config.public.strapiUrl,
  headers
})

const feedbackUrl = computed(() => (auth.isStudent.value ? '/api/feedbacks' : null))
const { data: feedbackData, refresh: refreshFeedback } = await useFetch<ListResponse<Feedback>>(feedbackUrl, {
  baseURL: config.public.strapiUrl,
  headers,
  query: {
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

const properties = computed(() => data.value?.data ?? [])
const vacantCount = computed(() => properties.value.filter(property => property.space_status === 'Vacant').length)

const activeTenantByProperty = computed(() => new Map((tenantData.value?.data ?? []).map(entry => [entry.propertyDocumentId, entry.tenantName])))

const feedbacksForCurrentTenant = computed(() => {
  const map = new Map<string, Feedback[]>()
  for (const feedback of feedbackData.value?.data ?? []) {
    const propertyId = feedback.propertySpace?.documentId
    const tenantName = activeTenantByProperty.value.get(propertyId ?? '')
    if (!propertyId || !tenantName || feedback.tenantName !== tenantName) continue
    const list = map.get(propertyId) ?? []
    list.push(feedback)
    map.set(propertyId, list)
  }
  return map
})

type Card = PropertySpace & {
  tenantName: string | null
  feedback: { count: number; avg: number; latest: Feedback } | null
}

const cards = computed<Card[]>(() => properties.value.map(property => {
  const tenantName = activeTenantByProperty.value.get(property.documentId ?? '') ?? null
  const list = feedbacksForCurrentTenant.value.get(property.documentId ?? '')
  const feedback = list?.length
    ? {
        count: list.length,
        avg: list.reduce((sum, item) => sum + item.rating, 0) / list.length,
        latest: list[0]
      }
    : null
  return { ...property, tenantName, feedback }
}))

const refreshAll = async () => {
  await Promise.all([refresh(), refreshFeedback()])
}

const formatCurrency = (amount?: number | string) => {
  if (amount == null || amount === '') return 'Not set'

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(Number(amount))
}

const formatArea = (area?: number | string) => area == null || area === '' ? 'Not set' : `${area} sqm`
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Property portfolio</p>
        <h1 class="imapsu-page-heading">Properties</h1>
        <p class="mt-2 max-w-xl text-muted">Browse the property spaces currently recorded in the iMapSU system.</p>
      </div>

      <div v-if="status === 'success'" class="flex gap-3">
        <UCard class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Total spaces</p><p class="text-xl font-semibold text-highlighted">{{ properties.length }}</p>
        </UCard>
        <UCard class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Vacant</p><p class="text-xl font-semibold text-secondary">{{ vacantCount }}</p>
        </UCard>
        <div class="flex items-center">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
          <UButton v-if="auth.isOas.value" to="/admin/properties" label="Manage" icon="i-lucide-settings" color="neutral" variant="subtle" />
        </div>
      </div>
    </div>

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="index in 6" :key="index" class="h-64 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load property spaces" :description="error.message" />

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-building-2" title="No property spaces found" description="Property spaces will appear here once they are added to iMapSU." />

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="card in cards" :key="card.documentId ?? card.id" :ui="{ header: 'p-5', body: 'p-5 pt-0' }">
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-mono text-xs text-muted">{{ card.propertyCode }}</p>
              <h2 class="mt-1 truncate text-lg font-semibold text-highlighted">{{ card.name }}</h2>
            </div>
            <UBadge :color="card.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ card.space_status }}</UBadge>
          </div>
        </template>

        <dl class="space-y-4 text-sm">
          <div>
            <dt class="mb-1 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-map-pin" /> Location</dt>
            <dd class="font-medium text-highlighted">{{ card.building }}<span v-if="card.floor"> · {{ card.floor }}</span></dd>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><dt class="mb-1 text-xs text-muted">Area</dt><dd class="font-medium text-highlighted">{{ formatArea(card.area) }}</dd></div>
            <div><dt class="mb-1 text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(card.monthlyRent) }}</dd></div>
          </div>
          <div v-if="card.description"><dt class="mb-1 text-xs text-muted">Description</dt><dd class="line-clamp-2 text-toned">{{ card.description }}</dd></div>
        </dl>

        <div v-if="auth.isStudent.value && card.tenantName" class="mt-4 border-t pt-4">
          <p class="mb-2 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-message-square" /> Feedback for {{ card.tenantName }}</p>
          <template v-if="card.feedback">
            <div class="flex items-center gap-2">
              <span class="flex items-center gap-0.5">
                <UIcon
                  v-for="star in 5"
                  :key="star"
                  name="i-lucide-star"
                  class="size-4"
                  :class="star <= Math.round(card.feedback.avg) ? 'text-secondary fill-current' : 'text-toned'"
                />
              </span>
              <span class="text-sm font-semibold text-highlighted">{{ card.feedback.avg.toFixed(1) }}</span>
              <span class="text-xs text-muted">({{ card.feedback.count }})</span>
            </div>
            <p v-if="card.feedback.latest.comment" class="mt-1.5 line-clamp-2 text-sm text-toned">{{ card.feedback.latest.comment }}</p>
          </template>
          <p v-else class="text-sm text-toned">No feedback yet for this tenant.</p>
        </div>

        <div v-if="auth.isAspiringTenant.value && card.space_status === 'Vacant' && card.documentId" class="mt-4">
          <UButton block :to="`/rental-applications?property=${card.documentId}`" label="Apply" icon="i-lucide-file-text" />
        </div>
      </UCard>
    </div>
  </main>
</template>
