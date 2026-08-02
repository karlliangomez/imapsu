<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type MaintenanceTicket = {
  id: number | string
  documentId?: string
  category: 'Plumbing' | 'Electrical' | 'Structural' | 'Internet' | 'Other'
  description: string
  status: 'Pending' | 'In Progress' | 'Completed'
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type Tenancy = {
  id: number | string
  documentId?: string
  status: 'Active' | 'Ended' | 'Terminated'
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}
type ListResponse<T> = { data: T[] }

const CATEGORIES = ['Plumbing', 'Electrical', 'Structural', 'Internet', 'Other']

useHead({ title: 'Maintenance | iMapSU' })

const auth = useAuth()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<MaintenanceTicket>>('/api/maintenance-tickets', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
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
const description = ref('')
const submitting = ref(false)
const errorMessage = ref('')

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
    await $api('/api/maintenance-tickets', {
      method: 'POST',
      body: {
        propertySpace: selectedProperty.value,
        category: category.value,
        description: description.value.trim()
      }
    })
    category.value = 'Plumbing'
    description.value = ''
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
      <UCard class="lg:col-span-2">
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

          <UFormField label="Description" name="description" required>
            <UTextarea v-model="description" placeholder="Describe the issue and where in the space it isâ€¦" :rows="4" :disabled="submitting" />
          </UFormField>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :description="errorMessage" />

          <UButton type="submit" block :loading="submitting">Submit ticket</UButton>
        </form>
      </UCard>

      <div class="lg:col-span-3">
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
              <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
            </div>

            <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.description }}</p>

            <p v-if="item.propertySpace" class="mt-3 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ item.propertySpace.name }}
              <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
            </p>
          </UCard>
        </div>
      </div>
    </div>
  </main>
</template>
