<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'Audit Logs | iMapSU' })

type AuditEntry = {
  id: number
  documentId?: string
  action: string
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  description?: string | null
  actorId?: number | null
  actorUsername?: string | null
  actorRole?: string | null
  createdAt: string
}

type AuditListResponse = { data: AuditEntry[]; meta: { pagination: { total: number } } }

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'account-created',
  'account-updated',
  'account-activated',
  'account-deactivated',
  'account-deleted',
  'password-reset',
  'role-changed',
  'permissions-updated',
  'settings-updated',
  'backup-created',
  'backup-restored',
  'backup-deleted',
  'login-success',
  'login-failed',
  'system-error'
]

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<AuditListResponse>('/api/audit-logs', {
  baseURL,
  headers,
  query: { sort: 'createdAt:desc', 'pagination[pageSize]': 100 }
})

const entries = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta?.pagination?.total ?? entries.value.length)

const actionFilter = ref<string>('all')
const search = ref('')

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return entries.value.filter(entry => {
    if (actionFilter.value !== 'all' && entry.action !== actionFilter.value) return false
    if (!term) return true
    const haystack = [entry.description, entry.entityLabel, entry.actorUsername, entry.entityType]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })
})

const actionColor = (action: string) => {
  if (action === 'system-error' || action === 'login-failed') return 'error'
  if (action === 'login-success' || action === 'account-activated') return 'success'
  if (action === 'deleted' || action === 'account-deleted' || action === 'account-deactivated') return 'warning'
  return 'neutral'
}

const actionLabel = (action: string) => action.replace(/-/g, ' ')

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">Audit Logs</h1>
        <p class="mt-2 max-w-xl text-muted">
          A record of administrative actions, account changes, sign-ins and server errors. Entries are written server-side and cannot be edited or deleted.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
      </div>
    </div>

    <div class="mb-5 flex flex-col gap-3 sm:flex-row">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search description, entity or actor…" class="w-full sm:max-w-sm" />
      <USelect v-model="actionFilter" :items="[{ label: 'All actions', value: 'all' }, ...ACTIONS.map(action => ({ label: actionLabel(action), value: action }))]" class="w-full sm:w-56" />
    </div>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="index in 8" :key="index" class="h-14 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load audit logs" :description="error.message" />

    <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-scroll-text" title="No entries found" description="Try adjusting the filters above." />

    <UCard v-else :ui="{ body: 'p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-highlighted">Recent entries</h2>
          <span class="text-sm text-muted">{{ filtered.length }} of {{ total }} shown</span>
        </div>
      </template>
      <ul class="divide-y divide-default">
        <li v-for="entry in filtered" :key="entry.id" class="flex items-center gap-4 px-5 py-3">
          <UBadge :color="actionColor(entry.action)" variant="subtle" class="w-36 shrink-0 justify-center capitalize">{{ actionLabel(entry.action) }}</UBadge>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-highlighted">{{ entry.description || '—' }}</p>
            <p class="mt-0.5 truncate text-xs text-muted">
              <span v-if="entry.entityLabel">{{ entry.entityLabel }}</span>
              <span v-if="entry.entityType" class="text-muted/70"> · {{ entry.entityType }}</span>
            </p>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="text-sm text-highlighted">{{ entry.actorUsername || 'system' }}</p>
            <p class="text-xs text-muted">{{ entry.actorRole || '—' }}</p>
          </div>
          <span class="hidden shrink-0 text-xs text-muted md:block">{{ formatDate(entry.createdAt) }}</span>
        </li>
      </ul>
    </UCard>
  </main>
</template>
