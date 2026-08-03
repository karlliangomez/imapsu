<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type PropertySpace = {
  id: number | string
  documentId?: string
  propertyCode: string
  name: string
  building: string
  floor?: string
  description?: string
  area?: number | string
  space_status: 'Vacant' | 'Occupied'
  monthlyRent?: number | string
  tenancies?: { documentId?: string; status?: string; user?: { username?: string; email?: string } | null }[] | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Manage properties | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<PropertySpace>>('/api/property-spaces', {
  baseURL,
  headers,
  query: {
    sort: 'building:asc',
    'pagination[pageSize]': 200,
    'populate[tenancies][filters][status][$eq]': 'Active',
    'populate[tenancies][populate][user]': true
  }
})

const properties = computed(() => data.value?.data ?? [])

const tenantOf = (property: PropertySpace) => {
  const active = property.tenancies?.find(tenancy => tenancy.status === 'Active')
  return active?.user?.username || active?.user?.email || null
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))

const formOpen = ref(false)
const editing = ref<PropertySpace | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  propertyCode: '',
  name: '',
  building: '',
  floor: '',
  description: '',
  area: '',
  monthlyRent: '',
  space_status: 'Vacant' as 'Vacant' | 'Occupied'
})

const openCreate = () => {
  editing.value = null
  Object.assign(form, { propertyCode: '', name: '', building: '', floor: '', description: '', area: '', monthlyRent: '', space_status: 'Vacant' })
  formError.value = ''
  formOpen.value = true
}

const openEdit = (property: PropertySpace) => {
  editing.value = property
  Object.assign(form, {
    propertyCode: property.propertyCode ?? '',
    name: property.name ?? '',
    building: property.building ?? '',
    floor: property.floor ?? '',
    description: property.description ?? '',
    area: property.area != null ? String(property.area) : '',
    monthlyRent: property.monthlyRent != null ? String(property.monthlyRent) : '',
    space_status: property.space_status ?? 'Vacant'
  })
  formError.value = ''
  formOpen.value = true
}

const save = async () => {
  saving.value = true
  formError.value = ''
  try {
    const body = {
      data: {
        propertyCode: form.propertyCode,
        name: form.name,
        building: form.building,
        floor: form.floor || undefined,
        description: form.description || undefined,
        area: form.area !== '' ? Number(form.area) : undefined,
        monthlyRent: form.monthlyRent !== '' ? Number(form.monthlyRent) : undefined,
        space_status: form.space_status
      }
    }
    if (editing.value) {
      await $api(`/api/property-spaces/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Property updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      await $api('/api/property-spaces', { method: 'POST', body })
      toast.add({ title: 'Property created', color: 'success', icon: 'i-lucide-check-circle' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (property: PropertySpace) => {
  if (!confirm(`Delete "${property.name}" (${property.propertyCode})? This cannot be undone.`)) return
  try {
    await $api(`/api/property-spaces/${property.documentId ?? property.id}`, { method: 'DELETE' })
    toast.add({ title: 'Property deleted', description: property.name, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete property', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Property spaces</h1>
        <p class="mt-2 max-w-xl text-muted">Create, edit and remove property spaces. Only Administrators and OAS can manage these.</p>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Add property space" icon="i-lucide-plus" @click="openCreate" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="index in 6" :key="index" class="h-48 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load property spaces" :description="error.message" />

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-building-2" title="No property spaces" description="Add your first property space to get started." />

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

        <dl class="space-y-3 text-sm">
          <div class="flex items-center justify-between">
            <dt class="text-xs text-muted">Location</dt>
            <dd class="font-medium text-highlighted">{{ property.building }}<span v-if="property.floor"> · {{ property.floor }}</span></dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-xs text-muted">Area</dt>
            <dd class="font-medium text-highlighted">{{ property.area != null ? `${property.area} sqm` : '—' }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-xs text-muted">Monthly rent</dt>
            <dd class="font-semibold text-primary">{{ formatCurrency(property.monthlyRent) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-xs text-muted">Tenant</dt>
            <dd class="truncate font-medium text-highlighted">
              <span v-if="tenantOf(property)" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-user" class="size-3.5 text-primary" />
                {{ tenantOf(property) }}
              </span>
              <span v-else class="text-muted">Vacant</span>
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex gap-2 border-t border-default pt-4">
          <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(property)" />
          <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(property)" />
        </div>
      </UCard>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? 'Edit property space' : 'Add property space'" description="Manage a rentable space on campus.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Property code" required>
              <UInput v-model="form.propertyCode" placeholder="e.g. B1-101" />
            </UFormField>
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="e.g. Stall 101" />
            </UFormField>
            <UFormField label="Building" required>
              <UInput v-model="form.building" placeholder="e.g. Student Center" />
            </UFormField>
            <UFormField label="Floor">
              <UInput v-model="form.floor" placeholder="e.g. 2" />
            </UFormField>
            <UFormField label="Area (sqm)">
              <UInput v-model="form.area" type="number" min="0" step="0.01" />
            </UFormField>
            <UFormField label="Monthly rent (PHP)">
              <UInput v-model="form.monthlyRent" type="number" min="0" />
            </UFormField>
          </div>

          <UFormField label="Status">
            <USelect v-model="form.space_status" :items="[{ label: 'Vacant', value: 'Vacant' }, { label: 'Occupied', value: 'Occupied' }]" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="form.description" :rows="3" />
          </UFormField>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Create property' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
