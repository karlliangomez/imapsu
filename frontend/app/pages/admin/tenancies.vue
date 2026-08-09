<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type Tenancy = {
  id: number | string
  documentId?: string
  startDate: string
  endDate?: string
  status: 'Active' | 'Ended' | 'Terminated'
  monthlyRent?: number | string
  createdAt?: string
  user?: { id: number; username?: string; email?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; businessName?: string; productsServices?: string; operatingDetails?: string } | null
}

type ListResponse<T> = { data: T[] }
type DirectoryUser = { id: number; username: string; email: string; role?: { type?: string } | null }

useHead({ title: 'Manage Tenancies | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[user]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

const { data: userData, refresh: refreshUsers } = await useFetch<DirectoryUser[]>('/api/user-directory', { baseURL, headers })
const { data: propertyData } = await useFetch<ListResponse<{ documentId: string; name: string; propertyCode: string; building: string }>>('/api/properties', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 200 }
})

const tenancies = computed(() => data.value?.data ?? [])
const TENANT_ROLE_TYPES = ['aspiring-tenant', 'current-tenant']
const userOptions = computed(() => (userData.value ?? [])
  .filter(user => TENANT_ROLE_TYPES.includes(user.role?.type ?? ''))
  .map(user => ({ label: `${user.username} (${user.email})`, value: String(user.id) })))
const propertyOptions = computed(() => (propertyData.value?.data ?? []).map(property => ({ label: `${property.name} (${property.propertyCode})`, value: property.documentId })))

const statusColor = (status: Tenancy['status']) => {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Terminated':
      return 'error'
    default:
      return 'neutral'
  }
}

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : ''

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formOpen = ref(false)
const editing = ref<Tenancy | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  accountMode: 'existing' as 'existing' | 'new',
  user: '',
  newUsername: '',
  newEmail: '',
  newPassword: '',
  propertySpace: '',
  startDate: '',
  endDate: '',
  status: 'Active' as 'Active' | 'Ended' | 'Terminated',
  monthlyRent: '',
  businessName: '',
  productsServices: '',
  operatingDetails: ''
})

const openCreate = () => {
  editing.value = null
  Object.assign(form, {
    accountMode: 'existing',
    user: '',
    newUsername: '',
    newEmail: '',
    newPassword: '',
    propertySpace: '',
    startDate: '',
    endDate: '',
    status: 'Active',
    monthlyRent: '',
    businessName: '',
    productsServices: '',
    operatingDetails: ''
  })
  formError.value = ''
  formOpen.value = true
}

const openEdit = (tenancy: Tenancy) => {
  editing.value = tenancy
  Object.assign(form, {
    accountMode: 'existing',
    user: tenancy.user?.id != null ? String(tenancy.user.id) : '',
    newUsername: '',
    newEmail: '',
    newPassword: '',
    propertySpace: tenancy.propertySpace?.documentId ?? '',
    startDate: tenancy.startDate ?? '',
    endDate: tenancy.endDate ?? '',
    status: tenancy.status ?? 'Active',
    monthlyRent: tenancy.monthlyRent != null ? String(tenancy.monthlyRent) : '',
    businessName: tenancy.propertySpace?.businessName ?? '',
    productsServices: tenancy.propertySpace?.productsServices ?? '',
    operatingDetails: tenancy.propertySpace?.operatingDetails ?? ''
  })
  formError.value = ''
  formOpen.value = true
}

const createUser = async () => {
  if (!form.newUsername.trim() || form.newUsername.trim().length < 3) {
    throw new Error('Username must be at least 3 characters long')
  }
  if (!form.newEmail.trim() || !form.newEmail.includes('@')) {
    throw new Error('Please provide a valid email address')
  }
  if (!form.newPassword || form.newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long')
  }
  const created = await $api<{ id: number }>('/api/auth/create-user', {
    method: 'POST',
    body: {
      username: form.newUsername.trim(),
      email: form.newEmail.trim(),
      password: form.newPassword,
      role: 'current-tenant'
    }
  })
  await refreshUsers()
  return created.id
}

const save = async () => {
  formError.value = ''
  if (form.accountMode === 'new' && (!form.newUsername || !form.newEmail || !form.newPassword)) {
    formError.value = 'Please fill in the new account details.'
    return
  }
  if (form.accountMode === 'existing' && !form.user) {
    formError.value = 'Please choose a user or create a new account.'
    return
  }
  if (!form.propertySpace || !form.startDate) {
    formError.value = 'Please choose a property space and a start date.'
    return
  }
  saving.value = true
  try {
    let userId: number
    if (form.accountMode === 'new') {
      userId = await createUser()
    } else {
      userId = Number(form.user)
    }
    const body = {
      data: {
        user: userId,
        propertySpace: form.propertySpace,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        status: form.status,
        monthlyRent: form.monthlyRent === '' ? undefined : Number(form.monthlyRent),
        businessName: form.businessName.trim() || undefined,
        productsServices: form.productsServices.trim() || undefined,
        operatingDetails: form.operatingDetails.trim() || undefined
      }
    }
    if (editing.value) {
      await $api(`/api/tenancies/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Tenancy updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      await $api('/api/tenancies', { method: 'POST', body })
      toast.add({ title: 'Tenancy created', color: 'success', icon: 'i-lucide-check-circle' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (tenancy: Tenancy) => {
  const label = tenancy.propertySpace?.name ?? tenancy.user?.username ?? 'this tenancy'
  if (!confirm(`Delete the tenancy for ${label}?`)) return
  try {
    await $api(`/api/tenancies/${tenancy.documentId ?? tenancy.id}`, { method: 'DELETE' })
    toast.add({ title: 'Tenancy deleted', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete tenancy', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'tenancy'; id: string; label: string } | null>(null)

const openHistory = (tenancy: Tenancy) => {
  historyTarget.value = {
    type: 'tenancy',
    id: String(tenancy.documentId ?? tenancy.id),
    label: tenancy.propertySpace?.name ?? 'Tenancy'
  }
  historyOpen.value = true
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Tenancies</h1>
        <p class="mt-2 max-w-xl text-muted">Review contracts and assign a tenancy to a user. Creating a tenancy also marks the space as occupied.</p>
      </div>
      <div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Create tenancy" icon="i-lucide-plus" @click="openCreate" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 3" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load tenancies" :description="error.message" />

    <UEmpty v-else-if="tenancies.length === 0" icon="i-lucide-key-round" title="No tenancies yet" description="Create your first tenancy to get started." />

    <div v-else class="space-y-4">
      <UCard v-for="tenancy in tenancies" :key="tenancy.documentId ?? tenancy.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-medium text-highlighted">{{ tenancy.propertySpace?.name ?? 'Property' }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span v-if="tenancy.propertySpace" class="font-mono">{{ tenancy.propertySpace.propertyCode }}</span>
              <span v-if="tenancy.propertySpace?.building" class="flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3.5" />{{ tenancy.propertySpace.building }}</span>
              <span v-if="tenancy.user" class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ tenancy.user.username }}</span>
            </p>
          </div>
          <UBadge :color="statusColor(tenancy.status)" variant="subtle">{{ tenancy.status }}</UBadge>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Start date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.startDate) }}</dd></div>
          <div><dt class="text-xs text-muted">End date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.endDate) || '—' }}</dd></div>
          <div><dt class="text-xs text-muted">Monthly rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(tenancy.monthlyRent) }}</dd></div>
        </dl>

        <div class="mt-4 flex gap-2 border-t border-default pt-4">
          <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(tenancy)" />
          <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(tenancy)" />
          <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(tenancy)" />
        </div>
      </UCard>
    </div>

    <StatusHistoryModal
      v-if="historyTarget"
      v-model:open="historyOpen"
      :entity-type="historyTarget.type"
      :entity-id="historyTarget.id"
      :entity-label="historyTarget.label"
    />

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="editing ? 'Edit tenancy' : 'Create tenancy'" description="Assign a vacant space to a user.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <template v-if="!editing">
            <UFormField label="Tenant account">
              <URadioGroup v-model="form.accountMode" variant="table" orientation="horizontal" :items="[
                { label: 'Choose existing user', value: 'existing' },
                { label: 'Create new account', value: 'new' }
              ]" />
            </UFormField>

            <template v-if="form.accountMode === 'existing'">
              <UFormField label="User" required>
                <USelect v-model="form.user" :items="userOptions" placeholder="Select a user" searchable />
              </UFormField>
            </template>

            <template v-else>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Username" required>
                  <UInput v-model="form.newUsername" placeholder="e.g. jdoe" autocomplete="off" />
                </UFormField>
                <UFormField label="Email" required>
                  <UInput v-model="form.newEmail" type="email" placeholder="name@example.com" autocomplete="off" />
                </UFormField>
              </div>
              <UFormField label="Temporary password" required description="The tenant can change this after signing in.">
                <UInput v-model="form.newPassword" type="password" autocomplete="new-password" />
              </UFormField>
            </template>
          </template>

          <UFormField v-else label="User" description="Reassigning the tenancy to another user is allowed.">
            <USelect v-model="form.user" :items="userOptions" placeholder="Select a user" searchable />
          </UFormField>

          <UFormField label="Property space" required>
            <USelect v-model="form.propertySpace" :items="propertyOptions" placeholder="Select a property space" searchable />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Start date" required>
              <UInput v-model="form.startDate" type="date" />
            </UFormField>
            <UFormField label="End date">
              <UInput v-model="form.endDate" type="date" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Monthly rent (PHP)" description="Agreed rent per month for this tenancy.">
              <UInput v-model="form.monthlyRent" type="number" min="0" step="0.01" placeholder="e.g. 7000" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="[{ label: 'Active', value: 'Active' }, { label: 'Ended', value: 'Ended' }, { label: 'Terminated', value: 'Terminated' }]" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Business name" description="The tenant business occupying the space (e.g. Brew & Bloom).">
              <UInput v-model="form.businessName" placeholder="e.g. Brew & Bloom" />
            </UFormField>
          </div>

          <UFormField label="Products / services" description="What the tenant sells or offers.">
            <UTextarea v-model="form.productsServices" :rows="2" />
          </UFormField>

          <UFormField label="Operating details" description="Hours, contact, special notes.">
            <UTextarea v-model="form.operatingDetails" :rows="2" />
          </UFormField>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Create tenancy' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
