<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type Tenancy = {
  id: number | string
  documentId?: string
  startDate: string
  endDate?: string
  status: 'Active' | 'Ended' | 'Terminated'
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; floor?: string; monthlyRent?: number | string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'My tenancy | iMapSU' })

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 10
  }
})

const tenancies = computed(() => data.value?.data ?? [])
const activeTenancy = computed(() => tenancies.value.find(tenancy => tenancy.status === 'Active') ?? tenancies.value[0])

const statusColor = (status: Tenancy['status']) => {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Terminated':
      return 'error'
    default:
      return 'neutral'
  }
}

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : ''

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Current tenant</p>
        <h1 class="imapsu-page-heading">My tenancy</h1>
        <p class="mt-2 max-w-xl text-muted">Details of the tenancy contract attached to your account.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 2" :key="index" class="h-40 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load your tenancy" :description="error.message" />

    <UEmpty v-else-if="tenancies.length === 0" icon="i-lucide-home" title="No tenancy on record" description="Once a tenancy is assigned to your account it will appear here." />

    <div v-else class="space-y-6">
      <UCard v-for="tenancy in tenancies" :key="tenancy.documentId ?? tenancy.id" :ui="{ body: 'p-6' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ tenancy.propertySpace?.name ?? 'Property' }}</p>
            <p v-if="tenancy.propertySpace" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span class="font-mono">{{ tenancy.propertySpace.propertyCode }}</span>
              <span class="flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3.5" />{{ tenancy.propertySpace.building }}<template v-if="tenancy.propertySpace.floor"> · {{ tenancy.propertySpace.floor }}</template></span>
            </p>
          </div>
          <UBadge :color="statusColor(tenancy.status)" variant="subtle">{{ tenancy.status }}</UBadge>
        </div>

        <dl class="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Start date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.startDate) }}</dd></div>
          <div><dt class="text-xs text-muted">End date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.endDate) || '—' }}</dd></div>
          <div class="col-span-2"><dt class="text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(tenancy.propertySpace?.monthlyRent) }}</dd></div>
        </dl>
      </UCard>
    </div>
  </main>
</template>
