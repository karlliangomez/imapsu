<script setup lang="ts">
import { BUILDING_NAMES } from '~/utils/buildings'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type UploadedFile = { id: number; url?: string; name?: string }

type PropertySpace = {
  id: number | string
  documentId?: string
  propertyCode: string
  name: string
  building: string
  campus?: string
  floor?: string
  description?: string
  area?: number | string
  rentalClassification?: string
  businessName?: string
  photos?: UploadedFile[] | null
  productsServices?: string
  operatingDetails?: string
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
    'populate[photos]': true,
    'populate[tenancies][filters][status][$eq]': 'Active',
    'populate[tenancies][populate][user]': true
  }
})

const properties = computed(() => data.value?.data ?? [])

const buildingOptions = computed(() => {
  const known = new Set(BUILDING_NAMES)
  const legacy = properties.value.map((p) => p.building).filter((b): b is string => Boolean(b) && !known.has(b))
  return [...BUILDING_NAMES, ...legacy]
})

const CAMPUS_OPTIONS = ['Main Campus']
const campusOptions = computed(() => {
  const known = new Set(CAMPUS_OPTIONS)
  const existing = properties.value.map((p) => p.campus).filter((c): c is string => Boolean(c) && !known.has(c))
  return [...CAMPUS_OPTIONS, ...existing]
})

const CLASSIFICATION_OPTIONS = [
  { label: 'Food and Beverage', value: 'Food and Beverage' },
  { label: 'Retail', value: 'Retail' },
  { label: 'Services', value: 'Services' },
  { label: 'Office', value: 'Office' },
  { label: 'Storage', value: 'Storage' },
  { label: 'Other', value: 'Other' }
]

const filterSearch = ref('')
const filterCampus = ref('all')
const filterClassification = ref('all')
const filterStatus = ref('all')
const page = ref(1)
const pageSize = ref(9)

watch(pageSize, () => {
  page.value = 1
})

const filteredProperties = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  const list = properties.value.filter(property => {
    if (filterCampus.value !== 'all' && (property.campus ?? '') !== filterCampus.value) return false
    if (filterClassification.value !== 'all' && (property.rentalClassification ?? 'Other') !== filterClassification.value) return false
    if (filterStatus.value !== 'all' && property.space_status !== filterStatus.value) return false
    if (query) {
      const haystack = [property.name, property.propertyCode, property.businessName, property.building, property.campus].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
  return list
})

const filterCount = computed(() => {
  let count = 0
  if (filterCampus.value !== 'all') count++
  if (filterClassification.value !== 'all') count++
  if (filterStatus.value !== 'all') count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterSearch.value = ''
  filterCampus.value = 'all'
  filterClassification.value = 'all'
  filterStatus.value = 'all'
  page.value = 1
}

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProperties.value.length / pageSize.value)))

watch(filteredProperties, () => {
  if (page.value > totalPages.value) page.value = totalPages.value
})

const pagedProperties = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredProperties.value.slice(start, start + pageSize.value)
})

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
const photoUploading = ref(false)
const photoDrafts = ref<UploadedFile[]>([])

const form = reactive({
  propertyCode: '',
  name: '',
  building: '',
  campus: '',
  floor: '',
  description: '',
  area: '',
  monthlyRent: '',
  rentalClassification: 'Other',
  space_status: 'Vacant' as 'Vacant' | 'Occupied'
})

const resetForm = (property: PropertySpace | null) => {
  editing.value = property
  photoDrafts.value = property?.photos?.filter(photo => photo?.id != null) ?? []
  Object.assign(form, {
    propertyCode: property?.propertyCode ?? '',
    name: property?.name ?? '',
    building: property?.building ?? '',
    campus: property?.campus ?? '',
    floor: property?.floor ?? '',
    description: property?.description ?? '',
    area: property?.area != null ? String(property.area) : '',
    monthlyRent: property?.monthlyRent != null ? String(property.monthlyRent) : '',
    rentalClassification: property?.rentalClassification ?? 'Other',
    space_status: property?.space_status ?? 'Vacant'
  })
  formError.value = ''
}

const openCreate = () => {
  resetForm(null)
  formOpen.value = true
}

const openEdit = (property: PropertySpace) => {
  resetForm(property)
  formOpen.value = true
}

const onPhotosSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  photoUploading.value = true
  formError.value = ''
  try {
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    const uploaded = await $api<UploadedFile[]>('/api/upload', {
      method: 'POST',
      body: formData
    })
    photoDrafts.value.push(...(uploaded ?? []).filter(photo => photo?.id != null))
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    photoUploading.value = false
  }
}

const removePhoto = (photo: UploadedFile) => {
  photoDrafts.value = photoDrafts.value.filter(item => item.id !== photo.id)
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
        campus: form.campus?.trim() || undefined,
        floor: form.floor || undefined,
        description: form.description || undefined,
        area: form.area !== '' ? Number(form.area) : undefined,
        monthlyRent: form.monthlyRent !== '' ? Number(form.monthlyRent) : undefined,
        rentalClassification: form.rentalClassification,
        photos: photoDrafts.value.map(photo => photo.id),
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
      <USkeleton v-for="index in 6" :key="index" class="h-56 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load property spaces" :description="error.message" />

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-building-2" title="No property spaces" description="Add your first property space to get started." />

    <div v-else>
      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Name, code, business…" icon="i-lucide-search" />
          </UFormField>
          <UFormField label="Campus">
            <USelect v-model="filterCampus" :items="[{ label: 'All campuses', value: 'all' }, ...campusOptions.map(campus => ({ label: campus, value: campus }))]" />
          </UFormField>
          <UFormField label="Classification">
            <USelect v-model="filterClassification" :items="[{ label: 'All classifications', value: 'all' }, ...CLASSIFICATION_OPTIONS]" />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="[{ label: 'All statuses', value: 'all' }, { label: 'Vacant', value: 'Vacant' }, { label: 'Occupied', value: 'Occupied' }]" />
          </UFormField>
          <UFormField label="Result per page">
            <USelect v-model="pageSize" :items="[{ label: '9', value: 9 }, { label: '18', value: 18 }, { label: '36', value: 36 }]" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ pagedProperties.length }} of {{ filteredProperties.length }} property spaces</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredProperties.length === 0" icon="i-lucide-filter" title="No matching property spaces" description="No property spaces match the current filters." />

      <template v-else>
        <div class="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <UCard v-for="property in pagedProperties" :key="property.documentId ?? property.id" :ui="{ header: 'p-5', body: 'p-5 pt-0' }">
            <template #header>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-mono text-xs text-muted">{{ property.propertyCode }}</p>
                  <h2 class="mt-1 truncate text-lg font-semibold text-highlighted">{{ property.name }}</h2>
                  <p v-if="property.businessName" class="truncate text-sm text-primary">{{ property.businessName }}</p>
                </div>
                <UBadge :color="property.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ property.space_status }}</UBadge>
              </div>
            </template>

            <div v-if="property.photos?.length" class="mb-4 flex gap-2 overflow-x-auto">
              <img
                v-for="photo in property.photos"
                :key="photo.id"
                :src="`${baseURL}${photo.url}`"
                :alt="photo.name || property.name"
                class="h-24 w-24 shrink-0 rounded-lg object-cover"
              />
            </div>

            <dl class="space-y-3 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Location</dt>
                <dd class="font-medium text-highlighted">
                  {{ [property.building, property.campus].filter(Boolean).join(' · ') }}<span v-if="property.floor"> · {{ property.floor }}</span>
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Classification</dt>
                <dd class="font-medium text-highlighted">{{ property.rentalClassification ?? 'Other' }}</dd>
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

            <p v-if="property.productsServices" class="mt-4 rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-toned">
              <span class="font-semibold text-highlighted">Products / services: </span>{{ property.productsServices }}
            </p>

            <div class="mt-4 flex gap-2 border-t border-default pt-4">
              <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(property)" />
              <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(property)" />
            </div>
          </UCard>
        </div>

        <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-4">
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :disabled="page <= 1" @click="page--" />
          <p class="text-sm text-muted">Page {{ page }} of {{ totalPages }}</p>
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :disabled="page >= totalPages" @click="page++" />
        </div>
      </template>
    </div>

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="editing ? 'Edit property space' : 'Add property space'" description="Manage a rentable space on campus.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Property code" required>
              <UInput v-model="form.propertyCode" placeholder="e.g. B1-101" />
            </UFormField>
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="e.g. Stall 101" />
            </UFormField>
            <UFormField label="Classification">
              <USelect v-model="form.rentalClassification" :items="CLASSIFICATION_OPTIONS" />
            </UFormField>
            <UFormField label="Building" required>
              <USelect v-model="form.building" :items="buildingOptions" placeholder="Select the campus building" />
            </UFormField>
            <UFormField label="Campus">
              <USelect v-model="form.campus" :items="campusOptions" placeholder="Select the campus" />
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
            <UFormField label="Status">
              <USelect v-model="form.space_status" :items="[{ label: 'Vacant', value: 'Vacant' }, { label: 'Occupied', value: 'Occupied' }]" />
            </UFormField>
          </div>

          <UFormField label="Photos" description="Space photos shown on the campus map and property directory.">
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': photoUploading }">
                <UIcon :name="photoUploading ? 'i-lucide-loader-2' : 'i-lucide-image-plus'" class="size-4" :class="{ 'animate-spin': photoUploading }" />
                {{ photoUploading ? 'Uploading…' : 'Upload photos' }}
                <input type="file" accept="image/*" multiple class="sr-only" :disabled="photoUploading" @change="onPhotosSelected" />
              </label>
              <div v-if="photoDrafts.length" class="flex flex-wrap gap-2">
                <div v-for="photo in photoDrafts" :key="photo.id" class="group relative">
                  <img :src="`${baseURL}${photo.url}`" :alt="photo.name || 'Photo'" class="h-20 w-20 rounded-lg object-cover" />
                  <button type="button" class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted shadow hover:text-error" @click="removePhoto(photo)">
                    <UIcon name="i-lucide-x" class="size-3" />
                  </button>
                </div>
              </div>
            </div>
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
