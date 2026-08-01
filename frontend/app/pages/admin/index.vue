<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type CountResponse<T> = { data: T[]; meta?: { pagination?: { total?: number } } }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Management | iMapSU' })

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data: propertyData } = await useFetch<CountResponse<{ id: number }>>('/api/properties', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
})
const { data: tenancyData } = await useFetch<CountResponse<{ id: number }>>('/api/tenancies', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
})
const { data: billData } = await useFetch<CountResponse<{ id: number }>>('/api/bills', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
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
const { data: announcementData } = await useFetch<CountResponse<{ id: number }>>('/api/announcements', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 1, 'pagination[withCount]': true }
})

const total = (data: unknown) => {
  const response = data as CountResponse<{ id: number }> | undefined
  return response?.meta?.pagination?.total ?? response?.data?.length ?? 0
}

const cards = computed(() => [
  { label: 'Property spaces', value: total(propertyData.value), icon: 'i-lucide-building-2', to: '/admin/properties' },
  { label: 'Tenancies', value: total(tenancyData.value), icon: 'i-lucide-key-round', to: '/admin/tenancies' },
  { label: 'Bills', value: total(billData.value), icon: 'i-lucide-receipt', to: '/admin/bills' },
  { label: 'Rental applications', value: total(applicationData.value), icon: 'i-lucide-file-text', to: '/admin/applications' },
  { label: 'Users', value: userData.value?.length ?? 0, icon: 'i-lucide-users', to: '/admin/users' },
  { label: 'Announcements', value: total(announcementData.value), icon: 'i-lucide-megaphone', to: '/admin/announcements' }
])
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8">
      <p class="mb-2 text-sm font-medium text-primary">Management</p>
      <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Dashboard</h1>
      <p class="mt-2 max-w-xl text-muted">
        {{ auth.isAdmin.value ? 'Full administrative access to the iMapSU property system.' : 'Office of Auxiliary Services view of the iMapSU property system.' }}
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="card in cards" :key="card.to" :to="card.to" class="group rounded-xl border border-default bg-default p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
        <UIcon :name="card.icon" class="mb-3 size-5 text-primary" />
        <p class="text-3xl font-bold tracking-tight text-highlighted">{{ card.value }}</p>
        <p class="mt-1 flex items-center gap-1 text-sm text-muted">
          {{ card.label }}
          <UIcon name="i-lucide-arrow-right" class="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </p>
      </NuxtLink>
    </div>

    <div class="mt-10 grid gap-4 sm:grid-cols-2">
      <UCard>
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
  </main>
</template>
