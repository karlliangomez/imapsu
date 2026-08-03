<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type CountResponse<T> = { data: T[]; meta?: { pagination?: { total?: number } } }
type ListResponse<T> = { data: T[] }

type Tenancy = {
  documentId?: string
  status?: string
  monthlyRent?: number | string
  user?: { username?: string } | null
  propertySpace?: { name?: string; propertyCode?: string } | null
}

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  status?: 'Unpaid' | 'Paid'
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

useHead({ title: 'Management | iMapSU' })

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data: propertyData } = await useFetch<CountResponse<{ id: number }>>('/api/properties', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
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
const { data: applicationData } = await useFetch<CountResponse<{ id: number }>>('/api/rental-applications', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
})
const { data: userData } = await useFetch<{ id: number }[]>('/api/users', {
  baseURL,
  headers
})
const { data: announcementData } = await useFetch<ListResponse<Announcement>>('/api/announcements', {
  baseURL,
  headers,
  query: { sort: 'publishedAt:desc', 'pagination[pageSize]': 5 }
})

const count = (data: CountResponse<{ id: number }> | undefined) =>
  data?.meta?.pagination?.total ?? data?.data?.length ?? 0

const properties = computed(() => count(propertyData.value))
const tenancies = computed(() => tenancyData.value?.data ?? [])
const tenancyCount = computed(() => tenancyData.value?.meta?.pagination?.total ?? tenancies.value.length)
const activeTenancies = computed(() => tenancies.value.filter(tenancy => tenancy.status === 'Active').length)
const occupancy = computed(() => (properties.value > 0 ? Math.round((activeTenancies.value / properties.value) * 100) : 0))

const bills = computed(() => billData.value?.data ?? [])
const unpaidBills = computed(() => bills.value.filter(bill => bill.status !== 'Paid'))
const paidBills = computed(() => bills.value.filter(bill => bill.status === 'Paid'))
const outstandingTotal = computed(() => unpaidBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))
const collectedTotal = computed(() => paidBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))

const applications = computed(() => count(applicationData.value))
const userCount = computed(() => userData.value?.length ?? 0)
const announcements = computed(() => announcementData.value?.data ?? [])
const announcementCount = computed(() => announcementData.value?.meta?.pagination?.total ?? announcements.value.length)

const cards = computed(() => [
  { label: 'Property spaces', value: properties.value, icon: 'i-lucide-building-2', to: '/admin/properties', accent: 'bg-gold-100 text-gold-700' },
  { label: 'Tenancies', value: tenancyCount.value, icon: 'i-lucide-key-round', to: '/admin/tenancies', accent: 'bg-maroon-100 text-maroon-800' },
  { label: 'Bills', value: bills.value.length, icon: 'i-lucide-receipt', to: '/admin/bills', accent: 'bg-gold-50 text-gold-700' },
  { label: 'Rental applications', value: applications.value, icon: 'i-lucide-file-text', to: '/admin/applications', accent: 'bg-maroon-50 text-maroon-800' },
  { label: 'Users', value: userCount.value, icon: 'i-lucide-users', to: '/admin/users', accent: 'bg-gold-100 text-gold-800' },
  { label: 'Announcements', value: announcementCount.value, icon: 'i-lucide-megaphone', to: '/admin/announcements', accent: 'bg-maroon-100 text-maroon-800' }
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

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Paid' || !bill.dueDate) return false
  const due = new Date(bill.dueDate + 'T00:00:00')
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  return due < todayDate
}

const audienceColor = (audience?: string) => {
  switch (audience) {
    case 'Students':
      return 'secondary'
    case 'Tenants':
      return 'primary'
    default:
      return 'neutral'
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8">
      <p class="imapsu-page-eyebrow mb-2">Management</p>
      <h1 class="imapsu-page-heading">{{ greeting }}, {{ auth.user.value?.username }}</h1>
      <p class="mt-2 max-w-xl text-muted">{{ today }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="card in cards" :key="card.to" :to="card.to" class="group rounded-xl border border-default bg-default p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
        <div class="flex items-start justify-between">
          <span class="grid size-10 place-items-center rounded-lg" :class="card.accent">
            <UIcon :name="card.icon" class="size-5" />
          </span>
          <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p class="mt-4 text-3xl font-bold tracking-tight text-highlighted">{{ card.value }}</p>
        <p class="mt-1 text-sm text-muted">{{ card.label }}</p>
      </NuxtLink>
    </div>

    <div class="mt-10 grid gap-4 lg:grid-cols-3">
      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Financial overview</h2>
        </template>
        <dl class="space-y-5">
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-clock" class="size-4 text-gold-600" />Outstanding</dt>
              <dd class="font-semibold text-gold-700">{{ formatCurrency(outstandingTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ unpaidBills.length }} unpaid bill{{ unpaidBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-badge-check" class="size-4 text-success-500" />Collected</dt>
              <dd class="font-semibold text-success-600">{{ formatCurrency(collectedTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ paidBills.length }} paid bill{{ paidBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-home" class="size-4 text-primary" />Occupancy</dt>
              <dd class="font-semibold text-highlighted">{{ occupancy }}%</dd>
            </div>
            <UProgress :value="occupancy" class="mt-2" />
            <p class="mt-1 text-xs text-muted">{{ activeTenancies }} of {{ properties }} spaces occupied</p>
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
                <UBadge :color="bill.status === 'Paid' ? 'success' : 'warning'" variant="subtle">{{ bill.status }}</UBadge>
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
            <h2 class="text-lg font-semibold text-highlighted">Recent announcements</h2>
            <NuxtLink to="/admin/announcements" class="text-sm font-medium text-primary hover:underline">View all</NuxtLink>
          </div>
        </template>
        <ul v-if="recentAnnouncements.length" class="divide-y divide-default">
          <li v-for="item in recentAnnouncements" :key="item.documentId ?? item.id">
            <NuxtLink to="/admin/announcements" class="block px-5 py-3 transition-colors hover:bg-primary/5">
              <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
              <p class="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span>{{ formatDate(item.publishedAt ?? item.createdAt) }}</span>
                <UBadge :color="audienceColor(item.audience)" variant="subtle">{{ item.audience }}</UBadge>
              </p>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No announcements yet.</p>
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
  </main>
</template>
