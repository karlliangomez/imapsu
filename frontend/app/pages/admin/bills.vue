<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  electricMeterPrevious?: number | string
  electricMeterCurrent?: number | string
  electricRate?: number | string
  electricCharge?: number | string
  waterMeterPrevious?: number | string
  waterMeterCurrent?: number | string
  waterRate?: number | string
  waterCharge?: number | string
  additionalCharges?: number | string
  dueDate?: string
  status: 'Unpaid' | 'Paid'
  paidAt?: string
  orNumber?: string
  receipt?: { id: number; url?: string } | null
  tenancy?: {
    documentId?: string
    monthlyRent?: number | string
    user?: { id: number; username?: string } | null
    propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
  } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Manage bills | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Bill>>('/api/bills', {
  baseURL,
  headers,
  query: {
    'populate[tenancy][populate][propertySpace]': true,
    'populate[tenancy][populate][user]': true,
    'populate[receipt]': true,
    sort: 'period:desc',
    'pagination[pageSize]': 200
  }
})

const { data: tenancyData } = await useFetch<ListResponse<{ documentId: string; status: string; monthlyRent?: number | string; user?: { username?: string } | null; propertySpace?: { name?: string; propertyCode?: string } | null }>>('/api/tenancies', {
  baseURL,
  headers,
  query: { 'populate[user]': true, 'populate[propertySpace]': true, 'pagination[pageSize]': 200 }
})

const bills = computed(() => data.value?.data ?? [])
const tenancyOptions = computed(() => (tenancyData.value?.data ?? []).map(tenancy => ({
  label: `${tenancy.propertySpace?.name ?? 'Property'} â€” ${tenancy.user?.username ?? 'No user'}`,
  value: tenancy.documentId
})))
const filterTenancyOptions = computed(() => [{ label: 'All tenants', value: 'all' }, ...tenancyOptions.value])

const filterTenancy = ref('all')
const filterStatus = ref('All')
const filterPeriod = ref('')
const filterSearch = ref('')

const filteredBills = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return bills.value.filter(bill => {
    if (filterTenancy.value !== 'all' && bill.tenancy?.documentId !== filterTenancy.value) return false
    if (filterStatus.value !== 'All' && bill.status !== filterStatus.value) return false
    if (filterPeriod.value.trim() && !(bill.period ?? '').toLowerCase().includes(filterPeriod.value.trim().toLowerCase())) return false
    if (query) {
      const haystack = [bill.period, bill.orNumber, bill.tenancy?.propertySpace?.name, bill.tenancy?.propertySpace?.propertyCode, bill.tenancy?.user?.username].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const filterCount = computed(() => {
  let count = 0
  if (filterTenancy.value !== 'all') count++
  if (filterStatus.value !== 'All') count++
  if (filterPeriod.value.trim()) count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterTenancy.value = 'all'
  filterStatus.value = 'All'
  filterPeriod.value = ''
  filterSearch.value = ''
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? 'â€”'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Paid' || !bill.dueDate) return false
  const due = new Date(bill.dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const billRent = (bill: Bill) => {
  const stored = bill.tenancy?.monthlyRent
  if (stored != null && stored !== '') return Number(stored)
  const electric = Number(bill.electricCharge ?? 0)
  const water = Number(bill.waterCharge ?? 0)
  const additional = Number(bill.additionalCharges ?? 0)
  const derived = Number(bill.amount) - electric - water - additional
  return derived > 0 ? derived : 0
}

const formOpen = ref(false)
const editing = ref<Bill | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  tenancy: '',
  period: '',
  orNumber: '',
  electricPrevious: '',
  electricCurrent: '',
  electricRate: '',
  waterPrevious: '',
  waterCurrent: '',
  waterRate: '',
  additionalCharges: '',
  dueDate: '',
  status: 'Unpaid' as 'Unpaid' | 'Paid'
})

const openCreate = () => {
  editing.value = null
  Object.assign(form, {
    tenancy: '',
    period: '',
    orNumber: '',
    electricPrevious: '',
    electricCurrent: '',
    electricRate: '',
    waterPrevious: '',
    waterCurrent: '',
    waterRate: '',
    additionalCharges: '',
    dueDate: '',
    status: 'Unpaid'
  })
  formError.value = ''
  formOpen.value = true
}

const openEdit = (bill: Bill) => {
  editing.value = bill
  Object.assign(form, {
    tenancy: bill.tenancy?.documentId ?? '',
    period: bill.period ?? '',
    orNumber: bill.orNumber ?? '',
    electricPrevious: bill.electricMeterPrevious != null ? String(bill.electricMeterPrevious) : '',
    electricCurrent: bill.electricMeterCurrent != null ? String(bill.electricMeterCurrent) : '',
    electricRate: bill.electricRate != null ? String(bill.electricRate) : '',
    waterPrevious: bill.waterMeterPrevious != null ? String(bill.waterMeterPrevious) : '',
    waterCurrent: bill.waterMeterCurrent != null ? String(bill.waterMeterCurrent) : '',
    waterRate: bill.waterRate != null ? String(bill.waterRate) : '',
    additionalCharges: bill.additionalCharges != null ? String(bill.additionalCharges) : '',
    dueDate: bill.dueDate ?? '',
    status: bill.status ?? 'Unpaid'
  })
  formError.value = ''
  formOpen.value = true
}

const selectedTenancy = computed(() =>
  (tenancyData.value?.data ?? []).find(tenancy => tenancy.documentId === form.tenancy) ?? null
)

const rentCharge = computed(() => {
  const rent = selectedTenancy.value?.monthlyRent
  return rent == null || rent === '' ? 0 : Number(rent)
})

const usage = (previous: string, current: string) => {
  const prev = Number(previous)
  const curr = Number(current)
  if (!previous || !current || curr < prev) return 0
  return curr - prev
}

const electricUsage = computed(() => usage(form.electricPrevious, form.electricCurrent))
const waterUsage = computed(() => usage(form.waterPrevious, form.waterCurrent))
const electricCharge = computed(() => electricUsage.value * (Number(form.electricRate) || 0))
const waterCharge = computed(() => waterUsage.value * (Number(form.waterRate) || 0))
const additionalChargesNum = computed(() => Number(form.additionalCharges) || 0)
const totalAmount = computed(() => rentCharge.value + electricCharge.value + waterCharge.value + additionalChargesNum.value)

const save = async () => {
  formError.value = ''
  if (!form.tenancy) {
    formError.value = 'Please choose a tenancy.'
    return
  }
  saving.value = true
  try {
    const body = {
      data: {
        tenancy: form.tenancy,
        period: form.period || undefined,
        orNumber: form.orNumber?.trim() || undefined,
        amount: Number(totalAmount.value.toFixed(2)),
        electricMeterPrevious: form.electricPrevious === '' ? undefined : Number(form.electricPrevious),
        electricMeterCurrent: form.electricCurrent === '' ? undefined : Number(form.electricCurrent),
        electricRate: form.electricRate === '' ? undefined : Number(form.electricRate),
        electricCharge: electricCharge.value === 0 ? undefined : Number(electricCharge.value.toFixed(2)),
        waterMeterPrevious: form.waterPrevious === '' ? undefined : Number(form.waterPrevious),
        waterMeterCurrent: form.waterCurrent === '' ? undefined : Number(form.waterCurrent),
        waterRate: form.waterRate === '' ? undefined : Number(form.waterRate),
        waterCharge: waterCharge.value === 0 ? undefined : Number(waterCharge.value.toFixed(2)),
        additionalCharges: additionalChargesNum.value === 0 ? undefined : Number(additionalChargesNum.value.toFixed(2)),
        dueDate: form.dueDate || undefined,
        status: form.status
      }
    }
    if (editing.value) {
      await $api(`/api/bills/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Bill updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      await $api('/api/bills', { method: 'POST', body })
      toast.add({ title: 'Bill issued', color: 'success', icon: 'i-lucide-check-circle' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (bill: Bill) => {
  if (!confirm(`Delete this ${formatCurrency(bill.amount)} bill${bill.period ? ` for ${bill.period}` : ''}?`)) return
  try {
    await $api(`/api/bills/${bill.documentId ?? bill.id}`, { method: 'DELETE' })
    toast.add({ title: 'Bill deleted', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete bill', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Bills</h1>
        <p class="mt-2 max-w-xl text-muted">Issue bills against tenancies and track payment receipts.</p>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Issue bill" icon="i-lucide-plus" @click="openCreate" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load bills" :description="error.message" />

    <UEmpty v-else-if="bills.length === 0" icon="i-lucide-receipt" title="No bills yet" description="Issue your first bill to get started." />

    <div v-else class="space-y-4">
      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Tenant">
            <USelect v-model="filterTenancy" :items="filterTenancyOptions" searchable />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="[{ label: 'All statuses', value: 'All' }, { label: 'Unpaid', value: 'Unpaid' }, { label: 'Paid', value: 'Paid' }]" />
          </UFormField>
          <UFormField label="Period">
            <UInput v-model="filterPeriod" placeholder="e.g. 2026-08" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Tenant, space, codeâ€¦" icon="i-lucide-search" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ filteredBills.length }} of {{ bills.length }} bills</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredBills.length === 0" icon="i-lucide-filter" title="No matching bills" description="No bills match the current filters." />
      <template v-else>
        <UCard v-for="bill in filteredBills" :key="bill.documentId ?? bill.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
            <p v-if="bill.tenancy" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span v-if="bill.tenancy.propertySpace">{{ bill.tenancy.propertySpace.name }} <span class="font-mono">({{ bill.tenancy.propertySpace.propertyCode }})</span></span>
              <span v-if="bill.tenancy.user" class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ bill.tenancy.user.username }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="isOverdue(bill)" color="error" variant="solid">Overdue</UBadge>
            <UBadge :color="bill.status === 'Paid' ? 'success' : 'secondary'" variant="subtle">{{ bill.status }}</UBadge>
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Total</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</dd></div>
          <div><dt class="text-xs text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(billRent(bill)) }}</dd></div>
          <div><dt class="text-xs text-muted">Electric</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.electricCharge) }}</dd></div>
          <div><dt class="text-xs text-muted">Water</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.waterCharge) }}</dd></div>
          <div><dt class="text-xs text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.additionalCharges) }}</dd></div>
          <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || 'â€”' }}</dd></div>
          <div v-if="bill.status === 'Paid'"><dt class="text-xs text-muted">Paid on</dt><dd class="font-medium text-highlighted">{{ formatDateTime(bill.paidAt) || 'â€”' }}</dd></div>
          <div>
            <dt class="text-xs text-muted">OR No.</dt>
            <dd class="font-mono font-medium text-highlighted">{{ bill.orNumber || 'â€”' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Receipt</dt>
            <dd>
              <a v-if="bill.receipt" :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View</a>
              <span v-else class="text-muted">â€”</span>
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex gap-2 border-t border-default pt-4">
          <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(bill)" />
          <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(bill)" />
        </div>
      </UCard>
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? 'Edit bill' : 'Issue bill'" description="Create or update a bill for a tenancy.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Tenancy" required>
            <USelect v-model="form.tenancy" :items="tenancyOptions" placeholder="Select a tenancy" searchable />
          </UFormField>

          <UFormField label="Billing period">
            <UInput v-model="form.period" placeholder="e.g. 2026-08" />
          </UFormField>

          <UFormField label="OR Number" description="Official Receipt number extracted from the tenant's uploaded receipt (or entered manually).">
            <UInput v-model="form.orNumber" placeholder="e.g. 8823109" />
          </UFormField>

          <div class="rounded-lg border border-default p-4">
            <p class="text-xs font-medium text-muted">Electricity</p>
            <div class="mt-3 grid gap-4 sm:grid-cols-3">
              <UFormField label="Previous reading">
                <UInput v-model="form.electricPrevious" type="number" min="0" step="0.001" placeholder="e.g. 1000" />
              </UFormField>
              <UFormField label="Current reading">
                <UInput v-model="form.electricCurrent" type="number" min="0" step="0.001" placeholder="e.g. 1045" />
              </UFormField>
              <UFormField label="Rate (PHP/unit)">
                <UInput v-model="form.electricRate" type="number" min="0" step="0.01" placeholder="e.g. 35" />
              </UFormField>
            </div>
            <UAlert v-if="form.electricPrevious && form.electricCurrent && Number(form.electricCurrent) < Number(form.electricPrevious)" color="warning" icon="i-lucide-triangle-alert" title="Electric readings out of order" description="Current reading is lower than the previous reading. Electric usage will be treated as 0." />
          </div>

          <div class="rounded-lg border border-default p-4">
            <p class="text-xs font-medium text-muted">Water</p>
            <div class="mt-3 grid gap-4 sm:grid-cols-3">
              <UFormField label="Previous reading">
                <UInput v-model="form.waterPrevious" type="number" min="0" step="0.001" placeholder="e.g. 500" />
              </UFormField>
              <UFormField label="Current reading">
                <UInput v-model="form.waterCurrent" type="number" min="0" step="0.001" placeholder="e.g. 512" />
              </UFormField>
              <UFormField label="Rate (PHP/unit)">
                <UInput v-model="form.waterRate" type="number" min="0" step="0.01" placeholder="e.g. 25" />
              </UFormField>
            </div>
            <UAlert v-if="form.waterPrevious && form.waterCurrent && Number(form.waterCurrent) < Number(form.waterPrevious)" color="warning" icon="i-lucide-triangle-alert" title="Water readings out of order" description="Current reading is lower than the previous reading. Water usage will be treated as 0." />
          </div>

          <UFormField label="Additional charges (PHP)" description="Maintenance and other fees.">
            <UInput v-model="form.additionalCharges" type="number" min="0" step="0.01" placeholder="e.g. 150" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Due date">
              <UInput v-model="form.dueDate" type="date" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="[{ label: 'Unpaid', value: 'Unpaid' }, { label: 'Paid', value: 'Paid' }]" />
            </UFormField>
          </div>

          <div class="rounded-lg border border-default p-4">
            <p class="text-xs font-medium text-muted">Summary</p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between"><dt class="text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(rentCharge) }}</dd></div>
              <div class="flex items-center justify-between"><dt class="text-muted">Electric ({{ electricUsage }} units Ã— {{ formatCurrency(Number(form.electricRate) || 0) }})</dt><dd class="font-medium text-highlighted">{{ formatCurrency(electricCharge) }}</dd></div>
              <div class="flex items-center justify-between"><dt class="text-muted">Water ({{ waterUsage }} units Ã— {{ formatCurrency(Number(form.waterRate) || 0) }})</dt><dd class="font-medium text-highlighted">{{ formatCurrency(waterCharge) }}</dd></div>
              <div class="flex items-center justify-between"><dt class="text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(additionalChargesNum) }}</dd></div>
              <div class="flex items-center justify-between border-t border-default pt-2"><dt class="font-medium text-highlighted">Total</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(totalAmount) }}</dd></div>
            </dl>
          </div>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Issue bill' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
