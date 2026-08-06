<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['field-personnel', 'oas', 'admin']
})

type MeterReading = {
  id: number | string
  documentId?: string
  electricMeterReading?: number | string
  waterMeterReading?: number | string
  readingDate: string
  notes?: string
  createdAt?: string
  tenancy?: {
    documentId?: string
    user?: { username?: string } | null
    propertySpace?: { name?: string; propertyCode?: string; building?: string } | null
  } | null
  recordedBy?: { id: number; username?: string } | null
}

type Tenancy = {
  documentId?: string
  status: string
  user?: { username?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Meter readings | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data: tenancyData } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: { 'populate[user]': true, 'populate[propertySpace]': true, 'pagination[pageSize]': 200 }
})

const { data, status, error, refresh } = await useFetch<ListResponse<MeterReading>>('/api/meter-readings', {
  baseURL,
  headers,
  query: {
    'populate[tenancy][populate][propertySpace]': true,
    'populate[tenancy][populate][user]': true,
    'populate[recordedBy]': true,
    sort: 'readingDate:desc',
    'pagination[pageSize]': 100
  }
})

const readings = computed(() => data.value?.data ?? [])

const activeTenancies = computed(() => (tenancyData.value?.data ?? []).filter(tenancy => tenancy.status === 'Active'))

const tenancyOptions = computed(() => activeTenancies.value.map(tenancy => ({
  label: `${tenancy.propertySpace?.name ?? 'Property'} (${tenancy.propertySpace?.propertyCode ?? '—'}) — ${tenancy.user?.username ?? 'No user'}`,
  value: tenancy.documentId!
})))

const tenancyLabel = (reading: MeterReading) => {
  const space = reading.tenancy?.propertySpace
  const user = reading.tenancy?.user
  if (space && user) return `${space.name} (${space.propertyCode}) — ${user.username}`
  return 'Tenancy'
}

const form = reactive({
  tenancy: '',
  readingDate: new Date().toISOString().slice(0, 10),
  electricMeterReading: '',
  waterMeterReading: '',
  notes: ''
})

const submitting = ref(false)
const formError = ref('')
const editing = ref<MeterReading | null>(null)

const clearForm = () => {
  Object.assign(form, {
    tenancy: '',
    readingDate: new Date().toISOString().slice(0, 10),
    electricMeterReading: '',
    waterMeterReading: '',
    notes: ''
  })
}

const openEdit = (reading: MeterReading) => {
  editing.value = reading
  Object.assign(form, {
    tenancy: reading.tenancy?.documentId ?? '',
    readingDate: reading.readingDate ?? new Date().toISOString().slice(0, 10),
    electricMeterReading: reading.electricMeterReading != null ? String(reading.electricMeterReading) : '',
    waterMeterReading: reading.waterMeterReading != null ? String(reading.waterMeterReading) : '',
    notes: reading.notes ?? ''
  })
  formError.value = ''
}

const cancelEdit = () => {
  editing.value = null
  clearForm()
  formError.value = ''
}

const save = async () => {
  formError.value = ''
  if (!form.tenancy) {
    formError.value = 'Please choose a tenancy.'
    return
  }
  if (!form.electricMeterReading && !form.waterMeterReading) {
    formError.value = 'Provide at least one meter reading (electric or water).'
    return
  }
  submitting.value = true
  try {
    const body = {
      data: {
        tenancy: form.tenancy,
        readingDate: form.readingDate,
        electricMeterReading: form.electricMeterReading === '' ? undefined : Number(form.electricMeterReading),
        waterMeterReading: form.waterMeterReading === '' ? undefined : Number(form.waterMeterReading),
        notes: form.notes?.trim() || undefined
      }
    }
    if (editing.value) {
      await $api(`/api/meter-readings/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Meter reading updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      await $api('/api/meter-readings', { method: 'POST', body })
      toast.add({ title: 'Meter reading recorded', color: 'success', icon: 'i-lucide-check-circle' })
    }
    cancelEdit()
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const remove = async (reading: MeterReading) => {
  const label = reading.tenancy?.propertySpace?.name ?? reading.readingDate ?? 'this reading'
  if (!confirm(`Delete the meter reading for ${label}?`)) return
  try {
    await $api(`/api/meter-readings/${reading.documentId ?? reading.id}`, { method: 'DELETE' })
    toast.add({ title: 'Meter reading deleted', color: 'success', icon: 'i-lucide-check-circle' })
    if (editing.value?.documentId === (reading.documentId ?? reading.id)) cancelEdit()
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete meter reading', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const formatDate = (value?: string) => value
  ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const isMine = (reading: MeterReading) => reading.recordedBy?.id === auth.user.value?.id
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Field personnel</p>
        <h1 class="imapsu-page-heading">Meter readings</h1>
        <p class="mt-2 max-w-xl text-muted">Record electric and water readings against active tenancies. Readings feed the next billing cycle.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">{{ editing ? 'Edit reading' : 'Record reading' }}</h2>
        </template>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Tenancy" required>
            <USelect v-model="form.tenancy" :items="tenancyOptions" placeholder="Select an active tenancy" searchable />
            <p v-if="activeTenancies.length === 0" class="mt-1 text-xs text-muted">No active tenancies found.</p>
          </UFormField>

          <UFormField label="Reading date" required>
            <UInput v-model="form.readingDate" type="date" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Electric (kWh)">
              <UInput v-model="form.electricMeterReading" type="number" min="0" step="0.001" placeholder="e.g. 1045" />
            </UFormField>
            <UFormField label="Water (m³)">
              <UInput v-model="form.waterMeterReading" type="number" min="0" step="0.001" placeholder="e.g. 512" />
            </UFormField>
          </div>

          <UFormField label="Notes">
            <UTextarea v-model="form.notes" :rows="2" placeholder="Anything unusual about the meters…" />
          </UFormField>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex gap-2">
            <UButton type="submit" block :loading="submitting" :disabled="activeTenancies.length === 0">
              {{ editing ? 'Save changes' : 'Record reading' }}
            </UButton>
            <UButton v-if="editing" label="Cancel" color="neutral" variant="ghost" :disabled="submitting" @click="cancelEdit" />
          </div>
        </form>
      </UCard>

      <div class="lg:col-span-3">
        <div v-if="status === 'pending'" class="space-y-4">
          <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-lg" />
        </div>

        <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load readings" :description="error.message" />

        <UEmpty v-else-if="readings.length === 0" icon="i-lucide-gauge" title="No meter readings" description="Readings you record will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="reading in readings" :key="reading.documentId ?? reading.id" :ui="{ body: 'p-5' }">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ tenancyLabel(reading) }}</p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span class="flex items-center gap-1"><UIcon name="i-lucide-calendar" class="size-3.5" />{{ formatDate(reading.readingDate) }}</span>
                  <span class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ reading.recordedBy?.username ?? 'Field personnel' }}</span>
                  <span class="flex items-center gap-1"><UIcon name="i-lucide-clock" class="size-3.5" />{{ formatDateTime(reading.createdAt) }}</span>
                </p>
              </div>
              <UBadge v-if="isMine(reading)" color="primary" variant="subtle">Recorded by you</UBadge>
              <div v-if="auth.isStaff.value" class="flex gap-2">
                <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(reading)" />
                <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(reading)" />
              </div>
            </div>

            <dl class="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div class="rounded-lg bg-muted/20 px-3 py-2">
                <dt class="flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-zap" class="size-3.5" />Electric</dt>
                <dd class="mt-0.5 font-semibold text-highlighted">{{ reading.electricMeterReading != null ? `${reading.electricMeterReading} kWh` : '—' }}</dd>
              </div>
              <div class="rounded-lg bg-muted/20 px-3 py-2">
                <dt class="flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-droplets" class="size-3.5" />Water</dt>
                <dd class="mt-0.5 font-semibold text-highlighted">{{ reading.waterMeterReading != null ? `${reading.waterMeterReading} m³` : '—' }}</dd>
              </div>
            </dl>

            <p v-if="reading.notes" class="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-sm text-toned">{{ reading.notes }}</p>
          </UCard>
        </div>
      </div>
    </div>
  </main>
</template>
