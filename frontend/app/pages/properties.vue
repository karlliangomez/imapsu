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

type PropertyResponse = { data: PropertySpace[] }

useHead({ title: 'Properties | iMapSU Property Management' })

const config = useRuntimeConfig()
const auth = useAuth()
const headers = { Authorization: `Bearer ${auth.token.value}` }
const { data, status, error, refresh } = await useFetch<PropertyResponse>('/api/properties', {
  baseURL: config.public.strapiUrl,
  headers
})

const properties = computed(() => data.value?.data ?? [])
const vacantCount = computed(() => properties.value.filter(property => property.space_status === 'Vacant').length)

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
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
          <UButton v-if="auth.isStaff.value" to="/admin/properties" label="Manage" icon="i-lucide-settings" color="neutral" variant="subtle" />
        </div>
      </div>
    </div>

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="index in 6" :key="index" class="h-64 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load property spaces" :description="error.message" />

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-building-2" title="No property spaces found" description="Property spaces will appear here once they are added to iMapSU." />

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="property in properties" :key="property.documentId ?? property.id" :ui="{ header: 'p-5', body: 'p-5 pt-0' }">
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-mono text-xs text-muted">{{ property.propertyCode }}</p>
              <h2 class="mt-1 truncate text-lg font-semibold text-highlighted">{{ property.name }}</h2>
            </div>
            <UBadge :color="property.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ property.space_status }}</UBadge>
          </div>
        </template>

        <dl class="space-y-4 text-sm">
          <div>
            <dt class="mb-1 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-map-pin" /> Location</dt>
            <dd class="font-medium text-highlighted">{{ property.building }}<span v-if="property.floor"> · {{ property.floor }}</span></dd>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><dt class="mb-1 text-xs text-muted">Area</dt><dd class="font-medium text-highlighted">{{ formatArea(property.area) }}</dd></div>
            <div><dt class="mb-1 text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(property.monthlyRent) }}</dd></div>
          </div>
          <div v-if="property.description"><dt class="mb-1 text-xs text-muted">Description</dt><dd class="line-clamp-2 text-toned">{{ property.description }}</dd></div>
        </dl>

        <div v-if="auth.isAspiringTenant.value && property.space_status === 'Vacant' && property.documentId" class="mt-4">
          <UButton block :to="`/rental-applications?property=${property.documentId}`" label="Apply" icon="i-lucide-file-text" />
        </div>
      </UCard>
    </div>
  </main>
</template>
