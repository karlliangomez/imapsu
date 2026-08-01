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
  dueDate?: string
  status: 'Unpaid' | 'Paid'
  receipt?: { id: number; url?: string } | null
  tenancy?: {
    documentId?: string
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

const { data: tenancyData } = await useFetch<ListResponse<{ documentId: string; status: string; user?: { username?: string } | null; propertySpace?: { name?: string; propertyCode?: string } | null }>>('/api/tenancies', {
  baseURL,
  headers,
  query: { 'populate[user]': true, 'populate[propertySpace]': true, 'pagination[pageSize]': 200 }
})

const bills = computed(() => data.value?.data ?? [])
const tenancyOptions = computed(() => (tenancyData.value?.data ?? []).map(tenancy => ({
  label: `${tenancy.propertySpace?.name ?? 'Property'} — ${tenancy.user?.username ?? 'No user'}`,
  value: tenancy.documentId
})))

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Paid' || !bill.dueDate) return false
  const due = new Date(bill.dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const formOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  tenancy: '',
  period: '',
  amount: '',
  dueDate: '',
  status: 'Unpaid' as 'Unpaid' | 'Paid'
})

const openCreate = () => {
  Object.assign(form, { tenancy: '', period: '', amount: '', dueDate: '', status: 'Unpaid' })
  formError.value = ''
  formOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.tenancy || !form.amount) {
    formError.value = 'Please choose a tenancy and enter an amount.'
    return
  }
  saving.value = true
  try {
    await $api('/api/bills', {
      method: 'POST',
      body: {
        data: {
          tenancy: form.tenancy,
          period: form.period || undefined,
          amount: Number(form.amount),
          dueDate: form.dueDate || undefined,
          status: form.status
        }
      }
    })
    toast.add({ title: 'Bill issued', color: 'success', icon: 'i-lucide-check-circle' })
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const markPaid = async (bill: Bill) => {
  try {
    await $api(`/api/bills/${bill.documentId ?? bill.id}`, {
      method: 'PUT',
      body: { data: { status: 'Paid' } }
    })
    toast.add({ title: 'Bill marked as paid', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update bill', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
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
        <p class="mb-2 text-sm font-medium text-primary">Management</p>
        <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Bills</h1>
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
      <UCard v-for="bill in bills" :key="bill.documentId ?? bill.id" :ui="{ body: 'p-5' }">
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
          <div><dt class="text-xs text-muted">Amount</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</dd></div>
          <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || '—' }}</dd></div>
          <div>
            <dt class="text-xs text-muted">Receipt</dt>
            <dd>
              <a v-if="bill.receipt" :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View</a>
              <span v-else class="text-muted">—</span>
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex gap-2 border-t border-default pt-4">
          <UButton v-if="bill.status === 'Unpaid'" label="Mark paid" icon="i-lucide-check-check" color="success" variant="subtle" size="sm" @click="markPaid(bill)" />
          <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(bill)" />
        </div>
      </UCard>
    </div>

    <UModal v-model:open="formOpen" title="Issue bill" description="Create a bill for a tenancy.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Tenancy" required>
            <USelect v-model="form.tenancy" :items="tenancyOptions" placeholder="Select a tenancy" searchable />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Billing period">
              <UInput v-model="form.period" placeholder="e.g. 2026-08" />
            </UFormField>
            <UFormField label="Amount (PHP)" required>
              <UInput v-model="form.amount" type="number" min="0" step="0.01" />
            </UFormField>
            <UFormField label="Due date">
              <UInput v-model="form.dueDate" type="date" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="[{ label: 'Unpaid', value: 'Unpaid' }, { label: 'Paid', value: 'Paid' }]" />
            </UFormField>
          </div>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">Issue bill</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
