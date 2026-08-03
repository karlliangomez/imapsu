<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  dueDate?: string
  status: 'Unpaid' | 'Paid'
  paidAt?: string
  orNumber?: string
  createdAt?: string
  receipt?: { id: number; url?: string; name?: string } | null
  tenancy?: {
    documentId?: string
    propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Bills | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Bill>>('/api/bills', {
  baseURL,
  headers,
  query: {
    'populate[tenancy][populate][propertySpace]': true,
    'populate[receipt]': true,
    sort: 'period:desc',
    'pagination[pageSize]': 100
  }
})

const bills = computed(() => data.value?.data ?? [])
const totalOutstanding = computed(() =>
  bills.value
    .filter(bill => bill.status === 'Unpaid')
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
)

const uploadingKeys = reactive<Record<string, boolean>>({})
const submittingKeys = reactive<Record<string, boolean>>({})
const removingKeys = reactive<Record<string, boolean>>({})
const selectedFiles = reactive<Record<string, File>>({})
const uploadError = ref('')
const submitError = ref('')

const billKey = (bill: Bill) => String(bill.documentId ?? bill.id)
const isUploading = (bill: Bill) => uploadingKeys[billKey(bill)] === true
const isSubmitting = (bill: Bill) => submittingKeys[billKey(bill)] === true
const isRemoving = (bill: Bill) => removingKeys[billKey(bill)] === true

const orNumberDraft = reactive<Record<string, string>>({})
const orValue = (bill: Bill) => (orNumberDraft[billKey(bill)] ?? '').trim()

watch(bills, (list) => {
  for (const bill of list) {
    const key = billKey(bill)
    if (bill.orNumber && orNumberDraft[key] == null) {
      orNumberDraft[key] = bill.orNumber
    }
  }
}, { immediate: true })

const onReceiptSelected = (bill: Bill, event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadReceipt(bill, file, input)
}

const uploadReceipt = async (bill: Bill, file: File, input?: HTMLInputElement) => {
  const key = billKey(bill)
  uploadingKeys[key] = true
  uploadError.value = ''
  submitError.value = ''
  selectedFiles[key] = file
  try {
    const form = new FormData()
    form.append('files', file)
    const uploaded = await $api<{ id: number; url?: string }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Upload failed')

    const updated = await $api<{ data: Bill }>(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { receipt: fileId } }
    })
    const detected = updated?.data?.orNumber
    toast.add({
      title: 'Receipt attached',
      description: detected
        ? `OR number detected: ${detected}. Review it, then submit.`
        : 'No OR number detected. Enter it below, then submit.',
      color: 'success',
      icon: 'i-lucide-file-check'
    })
    await refresh()
  } catch (err) {
    uploadError.value = getErrorMessage(err)
  } finally {
    uploadingKeys[key] = false
    delete selectedFiles[key]
    if (input) input.value = ''
  }
}

const submitPayment = async (bill: Bill) => {
  const key = billKey(bill)
  const value = orValue(bill)
  if (!value) return
  submittingKeys[key] = true
  submitError.value = ''
  try {
    await $api(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { orNumber: value } }
    })
    toast.add({
      title: 'Payment submitted',
      description: 'The bill is now marked as paid and sent to management for review.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    await refresh()
  } catch (err) {
    submitError.value = getErrorMessage(err)
  } finally {
    submittingKeys[key] = false
  }
}

const removeReceipt = async (bill: Bill) => {
  const key = billKey(bill)
  removingKeys[key] = true
  submitError.value = ''
  try {
    await $api(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { receipt: null } }
    })
    delete orNumberDraft[key]
    toast.add({
      title: 'Receipt removed',
      description: 'The uploaded receipt has been removed from this bill.',
      color: 'neutral',
      icon: 'i-lucide-trash-2'
    })
    await refresh()
  } catch (err) {
    submitError.value = getErrorMessage(err)
  } finally {
    removingKeys[key] = false
  }
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
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
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Current tenant</p>
        <h1 class="imapsu-page-heading">Bills</h1>
        <p class="mt-2 max-w-xl text-muted">Attach your payment receipt — the OR number is detected automatically — then review it and submit to mark the bill as paid.</p>
      </div>

      <div v-if="status === 'success'" class="flex gap-3">
        <UCard class="min-w-32 border-t-4 border-t-maroon-700" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Bills</p><p class="text-xl font-semibold text-primary">{{ bills.length }}</p>
        </UCard>
        <UCard class="min-w-32 border-t-4 border-t-gold-500" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Outstanding</p><p class="text-xl font-semibold text-error">{{ formatCurrency(totalOutstanding) }}</p>
        </UCard>
        <div class="flex items-center">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        </div>
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load bills" :description="error.message" />

    <UEmpty v-else-if="bills.length === 0" icon="i-lucide-receipt" title="No bills yet" description="Bills for your tenancy will appear here once issued." />

    <div v-else class="space-y-4">
      <UCard v-for="bill in bills" :key="bill.documentId ?? bill.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
            <p v-if="bill.tenancy?.propertySpace" class="mt-1 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ bill.tenancy.propertySpace.name }}
              <span class="font-mono">({{ bill.tenancy.propertySpace.propertyCode }})</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="isOverdue(bill)" color="error" variant="solid">Overdue</UBadge>
            <UBadge :color="bill.status === 'Paid' ? 'success' : 'secondary'" variant="subtle">{{ bill.status }}</UBadge>
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><dt class="text-xs text-muted">Amount</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</dd></div>
          <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || '—' }}</dd></div>
          <div v-if="bill.status === 'Paid'">
            <dt class="text-xs text-muted">Paid on</dt>
            <dd class="font-medium text-highlighted">{{ formatDateTime(bill.paidAt) || '—' }}</dd>
          </div>
          <div v-if="bill.receipt">
            <dt class="text-xs text-muted">OR No.</dt>
            <dd class="font-semibold font-mono text-highlighted">{{ bill.orNumber || '—' }}</dd>
          </div>
          <div v-if="bill.receipt">
            <dt class="text-xs text-muted">Receipt</dt>
            <dd><a :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View receipt</a></dd>
          </div>
        </dl>

        <div v-if="bill.status === 'Unpaid'" class="mt-5 border-t border-default pt-4">
          <p class="mb-3 text-xs text-muted">Payment</p>

          <template v-if="!bill.receipt">
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': isUploading(bill) }">
                <UIcon :name="isUploading(bill) ? 'i-lucide-loader-2' : 'i-lucide-upload'" class="size-4" :class="{ 'animate-spin': isUploading(bill) }" />
                {{ isUploading(bill) ? 'Uploading…' : 'Choose receipt' }}
                <input type="file" accept="image/*,.pdf" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
              </label>
              <span v-if="selectedFiles[billKey(bill)]" class="max-w-64 truncate text-sm text-muted">{{ selectedFiles[billKey(bill)].name }}</span>
              <span v-else-if="isUploading(bill)" class="text-sm text-muted">Reading OR number from the receipt…</span>
            </div>
            <p v-if="uploadError" class="mt-2 text-xs text-error">{{ uploadError }}</p>
          </template>

          <template v-else>
            <div class="flex flex-wrap items-center gap-3">
              <a :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <UIcon name="i-lucide-file-text" class="size-4" /> {{ bill.receipt.name || 'Receipt attached' }}
              </a>
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary" :class="{ 'pointer-events-none opacity-60': isUploading(bill) }">
                <UIcon name="i-lucide-repeat" class="size-3.5" /> Replace
                <input type="file" accept="image/*,.pdf" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
              </label>
              <UButton
                icon="i-lucide-trash-2"
                label="Remove file"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="isRemoving(bill)"
                :disabled="isUploading(bill)"
                @click="removeReceipt(bill)"
              />
            </div>
            <div class="mt-3 flex flex-wrap items-end gap-3">
              <UFormField label="OR Number" description="Auto-filled from the receipt. Check it matches and submit." class="min-w-56">
                <UInput v-model="orNumberDraft[billKey(bill)]" placeholder="e.g. 8823109" :disabled="isSubmitting(bill)" @keyup.enter="submitPayment(bill)" />
              </UFormField>
              <UButton :loading="isSubmitting(bill)" :disabled="!orValue(bill)" icon="i-lucide-send" @click="submitPayment(bill)">Submit payment</UButton>
            </div>
            <p v-if="submitError" class="mt-2 text-xs text-error">{{ submitError }}</p>
          </template>
        </div>
      </UCard>
    </div>
  </main>
</template>
