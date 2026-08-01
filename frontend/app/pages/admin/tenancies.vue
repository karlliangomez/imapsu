<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type Tenancy = {
  id: number | string
  documentId?: string
  startDate: string
  endDate?: string
  status: 'Active' | 'Ended' | 'Terminated'
  createdAt?: string
  user?: { id: number; username?: string; email?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type ListResponse<T> = { data: T[] }
type DirectoryUser = { id: number; username: string; email: string; role?: { type?: string } | null }

useHead({ title: 'Manage tenancies | iMapSU' })

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

const { data: userData } = await useFetch<DirectoryUser[]>('/api/user-directory', { baseURL, headers })
const { data: propertyData } = await useFetch<ListResponse<{ documentId: string; name: string; propertyCode: string; building: string }>>('/api/properties', {
  baseURL,
  headers,
  query: { 'pagination[pageSize]': 200 }
})

const tenancies = computed(() => data.value?.data ?? [])
const userOptions = computed(() => (userData.value ?? []).map(user => ({ label: `${user.username} (${user.email})`, value: String(user.id) })))
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

const formOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({
  user: '',
  propertySpace: '',
  startDate: '',
  endDate: '',
  status: 'Active' as 'Active' | 'Ended' | 'Terminated'
})

const openCreate = () => {
  Object.assign(form, { user: '', propertySpace: '', startDate: '', endDate: '', status: 'Active' })
  formError.value = ''
  formOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.user || !form.propertySpace || !form.startDate) {
    formError.value = 'Please choose a user, a property space and a start date.'
    return
  }
  saving.value = true
  try {
    await $api('/api/tenancies', {
      method: 'POST',
      body: {
        data: {
          user: Number(form.user),
          propertySpace: form.propertySpace,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          status: form.status
        }
      }
    })
    toast.add({ title: 'Tenancy created', color: 'success', icon: 'i-lucide-check-circle' })
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="mb-2 text-sm font-medium text-primary">Management</p>
        <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Tenancies</h1>
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
        </dl>
      </UCard>
    </div>

    <UModal v-model:open="formOpen" title="Create tenancy" description="Assign a vacant space to a user.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="User" required>
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

          <UFormField label="Status">
            <USelect v-model="form.status" :items="[{ label: 'Active', value: 'Active' }, { label: 'Ended', value: 'Ended' }, { label: 'Terminated', value: 'Terminated' }]" />
          </UFormField>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">Create tenancy</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
