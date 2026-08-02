<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
  message?: string
  createdAt?: string
  letterOfIntent?: { id: number; url?: string; name?: string } | null
  user?: { id: number; username?: string; email?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Review applications | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<RentalApplication>>('/api/rental-applications', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'populate[user]': true,
    'populate[letterOfIntent]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

const applications = computed(() => data.value?.data ?? [])

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Cancelled', value: 'Cancelled' }
]

const statusColor = (status: RentalApplication['status']) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Rejected':
      return 'error'
    case 'Cancelled':
      return 'neutral'
    default:
      return 'secondary'
  }
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const updating = ref<number | string | null>(null)

const updateStatus = async (item: RentalApplication, statusValue: string) => {
  if (statusValue === item.status) return
  updating.value = item.documentId ?? item.id
  try {
    await $api(`/api/rental-applications/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: { data: { status: statusValue } }
    })
    toast.add({ title: `Application ${statusValue}`, color: statusValue === 'Approved' ? 'success' : 'neutral', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update application', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    updating.value = null
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Rental applications</h1>
        <p class="mt-2 max-w-xl text-muted">Review applications, inspect letters of intent and update their status.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load applications" :description="error.message" />

    <UEmpty v-else-if="applications.length === 0" icon="i-lucide-file-text" title="No applications" description="Applications from aspiring tenants will appear here." />

    <div v-else class="space-y-4">
      <UCard v-for="item in applications" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ item.propertySpace?.name ?? 'Property removed' }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span v-if="item.propertySpace" class="font-mono">{{ item.propertySpace.propertyCode }}</span>
              <span v-if="item.user" class="flex items-center gap-1"><UIcon name="i-lucide-user" class="size-3.5" />{{ item.user.username }} Â· {{ item.user.email }}</span>
              <span>Submitted {{ formatDate(item.createdAt) }}</span>
            </p>
          </div>
          <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
        </div>

        <div class="mt-4 border-t border-default pt-4">
          <p class="mb-2 text-xs font-medium text-muted">Letter of intent</p>
          <a v-if="item.letterOfIntent" :href="`${baseURL}${item.letterOfIntent.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View letter of intent</a>
          <span v-else class="text-sm text-muted">Not uploaded</span>
        </div>

        <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

        <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-default pt-4">
          <span class="text-sm font-medium text-highlighted">Update status:</span>
          <USelect
            :model-value="item.status"
            :items="STATUS_OPTIONS"
            class="w-40"
            :disabled="updating === (item.documentId ?? item.id)"
            @update:model-value="(value: unknown) => value && updateStatus(item, String(value))"
          />
        </div>
      </UCard>
    </div>
  </main>
</template>
