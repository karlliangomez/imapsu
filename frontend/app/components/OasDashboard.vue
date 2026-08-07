<script setup lang="ts">
type CountResponse<T> = { data: T[]; meta?: { pagination?: { total?: number } } }
type ListResponse<T> = { data: T[] }

type Tenancy = {
  documentId?: string
  status?: string
  endDate?: string
  monthlyRent?: number | string
  user?: { username?: string } | null
  propertySpace?: { name?: string; propertyCode?: string } | null
}

type Property = {
  id: number | string
  space_status?: 'Vacant' | 'Occupied'
}

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  status?: 'Unpaid' | 'For Verification' | 'Verified' | 'Rejected' | 'Overdue'
  dueDate?: string
  tenancy?: {
    propertySpace?: { name?: string } | null
    user?: { username?: string } | null
  } | null
}

type Announcement = {
  id: number | string
  documentId?: string
  title: string
  body?: string
  audience?: string
  publishedAt?: string
  createdAt?: string
}

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data: propertyData } = await useFetch<ListResponse<Property>>('/api/property-spaces', {
  baseURL,
  headers,
  query: { 'fields[0]': 'space_status', 'pagination[pageSize]': 200 }
})
const { data: tenancyData } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: { 'populate[propertySpace]': true, 'populate[user]': true, 'pagination[pageSize]': 200 }
})
const { data: billData } = await useFetch<ListResponse<Bill>>('/api/bills', {
  baseURL,
  headers,
  query: {
    'populate[tenancy][populate][propertySpace]': true,
    'populate[tenancy][populate][user]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 200
  }
})
const { data: applicationData } = await useFetch<ListResponse<{ status?: string }>>('/api/rental-applications', {
  baseURL,
  headers,
  query: { 'fields[0]': 'status', 'pagination[pageSize]': 200 }
})
const { data: announcementData } = await useFetch<ListResponse<Announcement>>('/api/announcements', {
  baseURL,
  headers,
  query: { sort: 'publishedAt:desc', 'pagination[pageSize]': 5 }
})
const { data: ticketData } = await useFetch<ListResponse<{ status?: string }>>('/api/maintenance-tickets', {
  baseURL,
  headers,
  query: { 'fields[0]': 'status', 'pagination[pageSize]': 200 }
})
const { data: feedbackData } = await useFetch<ListResponse<{ staffAction?: string | null }>>('/api/feedbacks', {
  baseURL,
  headers,
  query: { 'fields[0]': 'staffAction', 'pagination[pageSize]': 200 }
})
const { data: readingData } = await useFetch<CountResponse<{ id: number }>>('/api/meter-readings', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
})

const properties = computed(() => propertyData.value?.data ?? [])
const occupiedSpaces = computed(() => properties.value.filter(property => property.space_status === 'Occupied').length)
const vacantSpaces = computed(() => properties.value.length - occupiedSpaces.value)
const occupancy = computed(() => (properties.value.length > 0 ? Math.round((occupiedSpaces.value / properties.value.length) * 100) : 0))

const tenancies = computed(() => tenancyData.value?.data ?? [])
const activeTenancies = computed(() => tenancies.value.filter(tenancy => tenancy.status === 'Active').length)
const tenancyCount = computed(() => tenancyData.value?.meta?.pagination?.total ?? tenancies.value.length)

const bills = computed(() => billData.value?.data ?? [])
const unverifiedBills = computed(() => bills.value.filter(bill => bill.status !== 'Verified'))
const verifiedBills = computed(() => bills.value.filter(bill => bill.status === 'Verified'))
const outstandingTotal = computed(() => unverifiedBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))
const collectedTotal = computed(() => verifiedBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))

const applications = computed(() => applicationData.value?.data ?? [])
const pendingApplications = computed(() => applications.value.filter(app => app.status === 'Pending' || app.status === 'For Review').length)

const tickets = computed(() => ticketData.value?.data ?? [])
const activeTickets = computed(() => tickets.value.filter(ticket => ticket.status !== 'Completed').length)

const feedbacks = computed(() => feedbackData.value?.data ?? [])
const unreviewedFeedback = computed(() => feedbacks.value.filter(feedback => !feedback.staffAction).length)

const utilitySubmissions = computed(() => readingData.value?.meta?.pagination?.total ?? readingData.value?.data?.length ?? 0)

const announcements = computed(() => announcementData.value?.data ?? [])
const announcementCount = computed(() => announcementData.value?.meta?.pagination?.total ?? announcements.value.length)

const todayDate = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Verified' || !bill.dueDate) return false
  if (bill.status === 'Overdue') return true
  const due = new Date(bill.dueDate + 'T00:00:00')
  return due < todayDate()
}

const overdueBills = computed(() => bills.value.filter(isOverdue))
const overdueAccounts = computed(() => new Set(overdueBills.value.map(bill => bill.tenancy?.user?.username ?? '')).size)
const overdueTotal = computed(() => overdueBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))

const expiringContracts = computed(() => {
  const now = todayDate()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + 30)
  return tenancies.value
    .filter(tenancy => {
      if (tenancy.status !== 'Active' || !tenancy.endDate) return false
      const end = new Date(tenancy.endDate + 'T00:00:00')
      return end >= now && end <= horizon
    })
    .sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime())
})

const cards = computed(() => [
  { label: 'Occupied spaces', value: occupiedSpaces.value, icon: 'i-lucide-building-2', to: '/admin/properties', accent: 'bg-maroon-100 text-maroon-800', sub: `${vacantSpaces.value} vacant` },
  { label: 'Pending applications', value: pendingApplications.value, icon: 'i-lucide-file-text', to: '/admin/applications', accent: 'bg-gold-100 text-gold-700', sub: `${applications.value.length} total` },
  { label: 'Receipts for verification', value: bills.value.filter(bill => bill.status === 'For Verification').length, icon: 'i-lucide-shield-check', to: '/admin/bills', accent: 'bg-gold-50 text-gold-700', sub: 'awaiting review' },
  { label: 'Overdue accounts', value: overdueAccounts.value, icon: 'i-lucide-alert-triangle', to: '/admin/bills', accent: 'bg-maroon-50 text-maroon-700', sub: `${formatCurrency(overdueTotal)} due` },
  { label: 'Active maintenance tickets', value: activeTickets.value, icon: 'i-lucide-wrench', to: '/admin/maintenance', accent: 'bg-maroon-50 text-maroon-800', sub: `${tickets.value.length} total` },
  { label: 'Unreviewed feedback', value: unreviewedFeedback.value, icon: 'i-lucide-message-square', to: '/admin/feedback', accent: 'bg-gold-100 text-gold-700', sub: 'needs action' },
  { label: 'Utility submissions', value: utilitySubmissions.value, icon: 'i-lucide-gauge', to: '/admin/bills', accent: 'bg-maroon-100 text-maroon-800', sub: 'meter readings' },
  { label: 'Tenancies', value: tenancyCount.value, icon: 'i-lucide-key-round', to: '/admin/tenancies', accent: 'bg-gold-50 text-gold-700', sub: `${activeTenancies.value} active` },
  { label: 'Announcements', value: announcementCount.value, icon: 'i-lucide-megaphone', to: '/admin/announcements', accent: 'bg-maroon-50 text-maroon-800', sub: 'published' }
])

const recentBills = computed(() => bills.value.slice(0, 4))
const recentAnnouncements = computed(() => announcements.value.slice(0, 3))

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const statusColor = (status?: string) => {
  switch (status) {
    case 'Verified': return 'success'
    case 'For Verification': return 'warning'
    case 'Rejected': return 'error'
    case 'Overdue': return 'error'
    default: return 'warning'
  }
}

const audienceColor = (audience?: string) => {
  switch (audience) {
    case 'Students': return 'secondary'
    case 'Tenants': return 'primary'
    default: return 'neutral'
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <p class="imapsu-page-eyebrow mb-2">Management</p>
      <h1 class="imapsu-page-heading">{{ greeting }}, {{ auth.user.value?.username }}</h1>
      <p class="mt-2 max-w-xl text-muted">{{ today }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      <NuxtLink v-for="card in cards" :key="card.to + card.label" :to="card.to" class="group rounded-xl border border-default bg-default p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
        <div class="flex items-start justify-between">
          <span class="grid size-10 place-items-center rounded-lg" :class="card.accent">
            <UIcon :name="card.icon" class="size-5" />
          </span>
          <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p class="mt-4 text-3xl font-bold tracking-tight text-highlighted">{{ card.value }}</p>
        <p class="mt-1 text-sm text-muted">{{ card.label }}</p>
        <p v-if="card.sub" class="mt-0.5 text-xs text-muted">{{ card.sub }}</p>
      </NuxtLink>
    </div>

    <div class="mt-10 grid gap-4 lg:grid-cols-3">
      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Operational report</h2>
        </template>
        <dl class="space-y-5">
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-clock" class="size-4 text-gold-600" />Outstanding</dt>
              <dd class="font-semibold text-gold-700">{{ formatCurrency(outstandingTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ unverifiedBills.length }} unverified bill{{ unverifiedBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-badge-check" class="size-4 text-success-500" />Collected</dt>
              <dd class="font-semibold text-success-600">{{ formatCurrency(collectedTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ verifiedBills.length }} verified bill{{ verifiedBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-home" class="size-4 text-primary" />Occupancy</dt>
              <dd class="font-semibold text-highlighted">{{ occupancy }}%</dd>
            </div>
            <UProgress :value="occupancy" class="mt-2" />
            <p class="mt-1 text-xs text-muted">{{ occupiedSpaces }} of {{ properties.length }} spaces occupied</p>
          </div>
        </dl>
      </UCard>

      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">Recent bills</h2>
            <NuxtLink to="/admin/bills" class="text-sm font-medium text-primary hover:underline">View all</NuxtLink>
          </div>
        </template>
        <ul v-if="recentBills.length" class="divide-y divide-default">
          <li v-for="bill in recentBills" :key="bill.documentId ?? bill.id">
            <NuxtLink to="/admin/bills" class="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-primary/5">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
                <p class="truncate text-xs text-muted">{{ bill.tenancy?.propertySpace?.name ?? bill.tenancy?.user?.username ?? '—' }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UBadge v-if="isOverdue(bill)" color="error" variant="solid">Overdue</UBadge>
                <UBadge :color="statusColor(bill.status)" variant="subtle">{{ bill.status }}</UBadge>
                <span class="text-sm font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</span>
              </div>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No bills yet.</p>
      </UCard>

      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">Contracts expiring</h2>
            <NuxtLink to="/admin/tenancies" class="text-sm font-medium text-primary hover:underline">View all</NuxtLink>
          </div>
        </template>
        <ul v-if="expiringContracts.length" class="divide-y divide-default">
          <li v-for="tenancy in expiringContracts.slice(0, 5)" :key="tenancy.documentId">
            <NuxtLink to="/admin/tenancies" class="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-primary/5">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ tenancy.user?.username ?? 'Tenant' }}</p>
                <p class="truncate text-xs text-muted">{{ tenancy.propertySpace?.name ?? 'Space' }}</p>
              </div>
              <span class="shrink-0 text-xs font-medium text-warning">{{ formatDate(tenancy.endDate) }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No contracts expiring within 30 days.</p>
      </UCard>
    </div>

    <UCard class="mt-4">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">Quick actions</h2>
      </template>
      <div class="flex flex-wrap gap-3">
        <UButton to="/admin/properties" icon="i-lucide-plus" label="Add property space" />
        <UButton to="/admin/tenancies" icon="i-lucide-key-round" label="Create tenancy" color="neutral" variant="subtle" />
        <UButton to="/admin/bills" icon="i-lucide-receipt" label="Issue bill" color="neutral" variant="subtle" />
        <UButton to="/admin/announcements" icon="i-lucide-megaphone" label="New announcement" color="neutral" variant="subtle" />
      </div>
    </UCard>
  </div>
</template>
