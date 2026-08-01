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

const uploading = ref(false)
const uploadError = ref('')

const uploadReceipt = async (bill: Bill, file?: File) => {
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    const form = new FormData()
    form.append('files', file)
    const uploaded = await $api<{ id: number; url?: string }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Upload failed')

    await $api(`/api/bills/${bill.documentId ?? bill.id}`, {
      method: 'PUT',
      body: { data: { receipt: fileId } }
    })
    toast.add({ title: 'Receipt uploaded', description: 'Payment receipt attached to this bill.', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    uploadError.value = getErrorMessage(err)
  } finally {
    uploading.value = false
  }
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
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
        <p class="mb-2 text-sm font-medium text-primary">Current tenant</p>
        <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Bills</h1>
        <p class="mt-2 max-w-xl text-muted">View the bills attached to your tenancy and upload a payment receipt.</p>
      </div>

      <div v-if="status === 'success'" class="flex gap-3">
        <UCard class="min-w-32" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Bills</p><p class="text-xl font-semibold text-highlighted">{{ bills.length }}</p>
        </UCard>
        <UCard class="min-w-32" :ui="{ body: 'p-3' }">
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
          <div v-if="bill.receipt">
            <dt class="text-xs text-muted">Receipt</dt>
            <dd><a :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View receipt</a></dd>
          </div>
        </dl>

        <div v-if="bill.status === 'Unpaid'" class="mt-5 border-t border-default pt-4">
          <p class="mb-2 text-xs text-muted">Upload payment receipt</p>
          <UInput type="file" accept="image/*,.pdf" :disabled="uploading" :ui="{ leading: 'none' }" @change="(event: Event) => { const input = event.target as HTMLInputElement; if (input.files?.[0]) uploadReceipt(bill, input.files[0]).then(() => { input.value = '' }) }" />
          <p v-if="uploadError" class="mt-2 text-xs text-error">{{ uploadError }}</p>
        </div>
      </UCard>
    </div>
  </main>
</template>
