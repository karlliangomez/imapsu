<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
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
  status: 'Unpaid' | 'For Verification' | 'Verified' | 'Rejected' | 'Overdue'
  verificationNote?: string
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

type MeterReading = {
  documentId?: string
  electricMeterReading?: number | null
  waterMeterReading?: number | null
  readingDate?: string
}

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
  query: { 'populate[user]': true, 'populate[propertySpace]': true, pagination: { pageSize: 200 } }
})

const bills = computed(() => data.value?.data ?? [])
const tenancyOptions = computed(() => (tenancyData.value?.data ?? []).map(tenancy => ({
  label: `${tenancy.propertySpace?.name ?? 'Property'} — ${tenancy.user?.username ?? 'No user'}`,
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

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'All' },
  { label: 'Unpaid', value: 'Unpaid' },
  { label: 'For Verification', value: 'For Verification' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Overdue', value: 'Overdue' }
]

const isVerified = (bill: Bill) => bill.status === 'Verified'
const isForVerification = (bill: Bill) => bill.status === 'For Verification'

const isOverdue = (bill: Bill) => {
  if (isVerified(bill) || !bill.dueDate) return false
  if (bill.status === 'Overdue') return true
  const due = new Date(bill.dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const outstandingBills = computed(() => bills.value.filter(bill => !isVerified(bill)))
const outstandingTotal = computed(() => outstandingBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))
const verifiedBills = computed(() => bills.value.filter(isVerified))
const collectedTotal = computed(() => verifiedBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))
const overdueBills = computed(() => bills.value.filter(isOverdue))
const overdueTotal = computed(() => overdueBills.value.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0))
const forVerificationBills = computed(() => bills.value.filter(isForVerification))

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const billRent = (bill: Bill) => {
  const stored = bill.tenancy?.monthlyRent
  if (stored != null && stored !== '') return Number(stored)
  const electric = Number(bill.electricCharge ?? 0)
  const water = Number(bill.waterCharge ?? 0)
  const additional = Number(bill.additionalCharges ?? 0)
  const derived = Number(bill.amount) - electric - water - additional
  return derived > 0 ? derived : 0
}

const usage = (previous?: number | string, current?: number | string) => {
  const prev = Number(previous ?? 0)
  const curr = Number(current ?? 0)
  if (previous == null || current == null || previous === '' || current === '' || curr < prev) return 0
  return curr - prev
}

const statusColor = (bill: Bill) => {
  switch (bill.status) {
    case 'Verified': return 'success'
    case 'Rejected':
    case 'Overdue': return 'error'
    case 'For Verification': return 'warning'
    default: return 'secondary'
  }
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
  status: 'Unpaid' as Bill['status'],
  verificationNote: ''
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
    status: 'Unpaid',
    verificationNote: ''
  })
  formError.value = ''
  latestReading.value = null
  previousReading.value = null
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
    status: bill.status ?? 'Unpaid',
    verificationNote: bill.verificationNote ?? ''
  })
  formError.value = ''
  latestReading.value = null
  previousReading.value = null
  formOpen.value = true
}

const selectedTenancy = computed(() =>
  (tenancyData.value?.data ?? []).find(tenancy => tenancy.documentId === form.tenancy) ?? null
)

const latestReading = ref<MeterReading | null>(null)
const previousReading = ref<MeterReading | null>(null)
const loadingReading = ref(false)

// Pre-fill the meter fields from the field personnel readings recorded for the
// selected tenancy (only when the fields are still blank). The latest reading
// becomes "current"; the reading before it becomes "previous" so consumption is
// derived from the reading history. Without a second reading, the previous
// bill's current values are used as the fallback.
const applyLatestReading = async (tenancyDocId: string) => {
  loadingReading.value = true
  latestReading.value = null
  previousReading.value = null
  try {
    const readings = await $api<ListResponse<MeterReading>>('/api/meter-readings', {
      query: {
        'filters[tenancy][documentId][$eq]': tenancyDocId,
        'sort[0]': 'readingDate:desc',
        'pagination[pageSize]': 2,
        'fields[0]': 'electricMeterReading',
        'fields[1]': 'waterMeterReading',
        'fields[2]': 'readingDate'
      }
    })
    const latest = readings.data[0]
    const previous = readings.data[1]
    if (latest) {
      latestReading.value = latest
      if (form.electricCurrent === '' && latest.electricMeterReading != null) form.electricCurrent = String(latest.electricMeterReading)
      if (form.waterCurrent === '' && latest.waterMeterReading != null) form.waterCurrent = String(latest.waterMeterReading)
    }
    if (previous) {
      previousReading.value = previous
      if (form.electricPrevious === '' && previous.electricMeterReading != null) form.electricPrevious = String(previous.electricMeterReading)
      if (form.waterPrevious === '' && previous.waterMeterReading != null) form.waterPrevious = String(previous.waterMeterReading)
    }
    if (!previous) {
      const prior = await $api<ListResponse<Bill>>('/api/bills', {
        query: {
          'filters[tenancy][documentId][$eq]': tenancyDocId,
          'filters[electricMeterCurrent][$notNull]': true,
          'sort[0]': 'createdAt:desc',
          'pagination[pageSize]': 1,
          'fields[0]': 'electricMeterCurrent',
          'fields[1]': 'waterMeterCurrent'
        }
      })
      const priorBill = prior.data[0]
      if (priorBill) {
        if (form.electricPrevious === '' && priorBill.electricMeterCurrent != null) form.electricPrevious = String(priorBill.electricMeterCurrent)
        if (form.waterPrevious === '' && priorBill.waterMeterCurrent != null) form.waterPrevious = String(priorBill.waterMeterCurrent)
      }
    }
  } catch {
    // Reading pre-fill is best-effort; the OAS can always type the values.
  } finally {
    loadingReading.value = false
  }
}

watch(() => form.tenancy, (docId) => {
  if (!docId || editing.value) return
  applyLatestReading(docId)
})

const formatReadingDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const rentCharge = computed(() => {
  const rent = selectedTenancy.value?.monthlyRent
  return rent == null || rent === '' ? 0 : Number(rent)
})

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
        status: form.status,
        verificationNote: form.verificationNote?.trim() || undefined
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

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'bill'; id: string; label: string } | null>(null)

const openHistory = (bill: Bill) => {
  historyTarget.value = {
    type: 'bill',
    id: String(bill.documentId ?? bill.id),
    label: `${bill.period || 'Bill'} — ${bill.tenancy?.propertySpace?.name ?? 'bill'}`
  }
  historyOpen.value = true
}

const workflowBusy = ref<string | null>(null)

const setBillStatus = async (bill: Bill, nextStatus: Bill['status'], extra: Record<string, unknown> = {}) => {
  const key = String(bill.documentId ?? bill.id)
  workflowBusy.value = key
  try {
    await $api(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { status: nextStatus, ...extra } }
    })
    toast.add({
      title: `Bill ${nextStatus === 'Verified' ? 'verified' : nextStatus === 'Rejected' ? 'rejected' : nextStatus === 'Overdue' ? 'marked overdue' : 'reset to Unpaid'}`,
      color: nextStatus === 'Verified' ? 'success' : 'neutral',
      icon: 'i-lucide-check-circle'
    })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update bill', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    workflowBusy.value = null
  }
}

const verifyBill = (bill: Bill) => {
  if (!confirm(`Verify this payment of ${formatCurrency(bill.amount)}${bill.orNumber ? ` (OR ${bill.orNumber})` : ''}?`)) return
  setBillStatus(bill, 'Verified')
}

const rejectOpen = ref(false)
const rejectTarget = ref<Bill | null>(null)
const rejectNote = ref('')
const rejecting = ref(false)
const rejectError = ref('')

const openReject = (bill: Bill) => {
  rejectTarget.value = bill
  rejectNote.value = bill.verificationNote ?? ''
  rejectError.value = ''
  rejectOpen.value = true
}

const confirmReject = async () => {
  if (!rejectTarget.value) return
  rejecting.value = true
  rejectError.value = ''
  const target = rejectTarget.value
  try {
    await setBillStatus(target, 'Rejected', {
      verificationNote: rejectNote.value?.trim() || undefined
    })
    rejectOpen.value = false
  } catch (err) {
    rejectError.value = getErrorMessage(err)
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Bills</h1>
        <p class="mt-2 max-w-xl text-muted">Issue bills, review tenant payment receipts, and verify or reject submitted payments.</p>
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
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <UCard class="border-t-4 border-t-maroon-700" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Outstanding</p>
          <p class="mt-1 text-xl font-semibold text-error">{{ formatCurrency(outstandingTotal) }}</p>
          <p class="text-xs text-muted">{{ outstandingBills.length }} unverified</p>
        </UCard>
        <UCard class="border-t-4 border-t-success-500" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Collected</p>
          <p class="mt-1 text-xl font-semibold text-success-600">{{ formatCurrency(collectedTotal) }}</p>
          <p class="text-xs text-muted">{{ verifiedBills.length }} verified</p>
        </UCard>
        <UCard class="border-t-4 border-t-gold-500" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">For verification</p>
          <p class="mt-1 text-xl font-semibold text-warning">{{ forVerificationBills.length }}</p>
          <p class="text-xs text-muted">receipts to review</p>
        </UCard>
        <UCard class="border-t-4 border-t-error" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Overdue</p>
          <p class="mt-1 text-xl font-semibold text-error">{{ overdueBills.length }}</p>
          <p class="text-xs text-muted">{{ formatCurrency(overdueTotal) }} total</p>
        </UCard>
        <UCard class="border-t-4 border-t-primary" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Bills</p>
          <p class="mt-1 text-xl font-semibold text-highlighted">{{ bills.length }}</p>
          <p class="text-xs text-muted">all periods</p>
        </UCard>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Tenant">
            <USelect v-model="filterTenancy" :items="filterTenancyOptions" searchable />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="STATUS_FILTER_OPTIONS" />
          </UFormField>
          <UFormField label="Period">
            <UInput v-model="filterPeriod" placeholder="e.g. 2026-08" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Tenant, space, code…" icon="i-lucide-search" />
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
            <UBadge :color="statusColor(bill)" variant="subtle">{{ bill.status }}</UBadge>
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Total</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</dd></div>
          <div><dt class="text-xs text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(billRent(bill)) }}</dd></div>
          <div><dt class="text-xs text-muted">Electric</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.electricCharge) }} <span v-if="bill.electricMeterCurrent != null" class="text-xs text-muted">({{ usage(bill.electricMeterPrevious, bill.electricMeterCurrent) }} units)</span></dd></div>
          <div><dt class="text-xs text-muted">Water</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.waterCharge) }} <span v-if="bill.waterMeterCurrent != null" class="text-xs text-muted">({{ usage(bill.waterMeterPrevious, bill.waterMeterCurrent) }} units)</span></dd></div>
          <div><dt class="text-xs text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.additionalCharges) }}</dd></div>
          <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || '—' }}</dd></div>
          <div v-if="bill.status === 'Verified'"><dt class="text-xs text-muted">Verified on</dt><dd class="font-medium text-highlighted">{{ formatDateTime(bill.paidAt) || '—' }}</dd></div>
          <div>
            <dt class="text-xs text-muted">OR No.</dt>
            <dd class="font-mono font-medium text-highlighted">{{ bill.orNumber || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Receipt</dt>
            <dd>
              <a v-if="bill.receipt" :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View</a>
              <span v-else class="text-muted">—</span>
            </dd>
          </div>
          <div v-if="bill.verificationNote" class="col-span-2 sm:col-span-4">
            <dt class="text-xs text-muted">Verification note</dt>
            <dd class="mt-0.5 rounded-lg bg-warning/10 px-3 py-2 text-sm text-toned">{{ bill.verificationNote }}</dd>
          </div>
        </dl>

        <div class="mt-4 flex flex-wrap gap-2 border-t border-default pt-4">
          <template v-if="bill.status === 'For Verification'">
            <UButton label="Verify payment" icon="i-lucide-badge-check" color="success" size="sm" :loading="workflowBusy === String(bill.documentId ?? bill.id)" @click="verifyBill(bill)" />
            <UButton label="Reject" icon="i-lucide-x-circle" color="error" variant="subtle" size="sm" :disabled="workflowBusy === String(bill.documentId ?? bill.id)" @click="openReject(bill)" />
          </template>
          <UButton v-if="(bill.status === 'Unpaid' || bill.status === 'For Verification' || bill.status === 'Rejected') && !isVerified(bill)" label="Mark overdue" icon="i-lucide-alarm-clock" color="neutral" variant="subtle" size="sm" @click="setBillStatus(bill, 'Overdue')" />
          <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(bill)" />
          <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(bill)" />
          <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(bill)" />
        </div>
      </UCard>
      </template>
    </div>

    <UModal v-model:open="rejectOpen" class="max-w-xl" title="Reject payment" description="Reject the submitted payment and optionally record why.">
      <template #body>
        <form class="space-y-4" @submit.prevent="confirmReject">
          <UAlert color="warning" icon="i-lucide-triangle-alert" title="Bill will be marked Rejected" :description="rejectTarget ? `${formatCurrency(rejectTarget.amount)} bill${rejectTarget.period ? ` for ${rejectTarget.period}` : ''} will be moved out of verification.` : ''" />
          <UFormField label="Verification note" description="Reason for rejection, visible to the tenant.">
            <UTextarea v-model="rejectNote" :rows="3" placeholder="e.g. OR number does not match the receipt amount." />
          </UFormField>
          <UAlert v-if="rejectError" color="error" icon="i-lucide-circle-alert" :description="rejectError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="rejecting" @click="rejectOpen = false" />
            <UButton type="submit" color="error" :loading="rejecting">Reject payment</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <StatusHistoryModal
      v-if="historyTarget"
      v-model:open="historyOpen"
      :entity-type="historyTarget.type"
      :entity-id="historyTarget.id"
      :entity-label="historyTarget.label"
    />

    <UModal v-model:open="formOpen" class="max-w-3xl" :title="editing ? 'Edit bill' : 'Issue bill'" description="Create or update a bill for a tenancy.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Tenancy" required>
            <USelect v-model="form.tenancy" :items="tenancyOptions" placeholder="Select a tenancy" searchable />
          </UFormField>

          <div v-if="latestReading" class="space-y-2">
            <UAlert
              color="success"
              icon="i-lucide-gauge"
              title="Readings pre-filled from field recording"
              :description="`Recorded on ${formatReadingDate(latestReading.readingDate)} — electric ${latestReading.electricMeterReading ?? '—'}, water ${latestReading.waterMeterReading ?? '—'}. Adjust before saving if needed.`"
            />
            <UAlert
              v-if="!previousReading && (form.electricPrevious || form.waterPrevious)"
              color="info"
              icon="i-lucide-history"
              title="Previous reading carried over"
              description="Only one reading exists for this tenancy, so the previous meter values were taken from the last issued bill."
            />
          </div>
          <UAlert
            v-else-if="loadingReading"
            color="neutral"
            icon="i-lucide-loader-circle"
            title="Checking for field meter readings…"
          />

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
            <UFormField label="Status" description="Verified sets the verified/paid timestamp; other statuses clear it.">
              <USelect v-model="form.status" :items="[{ label: 'Unpaid', value: 'Unpaid' }, { label: 'For Verification', value: 'For Verification' }, { label: 'Verified', value: 'Verified' }, { label: 'Rejected', value: 'Rejected' }, { label: 'Overdue', value: 'Overdue' }]" />
            </UFormField>
          </div>

          <UFormField label="Verification note" description="Visible to the tenant when a payment is rejected.">
            <UTextarea v-model="form.verificationNote" :rows="2" />
          </UFormField>

          <div class="rounded-lg border border-default p-4">
            <p class="text-xs font-medium text-muted">Summary</p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between"><dt class="text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(rentCharge) }}</dd></div>
              <div class="flex items-center justify-between"><dt class="text-muted">Electric ({{ electricUsage }} units × {{ formatCurrency(Number(form.electricRate) || 0) }})</dt><dd class="font-medium text-highlighted">{{ formatCurrency(electricCharge) }}</dd></div>
              <div class="flex items-center justify-between"><dt class="text-muted">Water ({{ waterUsage }} units × {{ formatCurrency(Number(form.waterRate) || 0) }})</dt><dd class="font-medium text-highlighted">{{ formatCurrency(waterCharge) }}</dd></div>
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
