<script setup lang="ts">
type DirectoryUser = {
  id: number
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  createdAt?: string
  role?: { documentId?: string; name?: string; type?: string } | null
}

type RoleInfo = {
  type: string
  name: string
  description?: string
  permissions: string[]
}

type AuditEntry = {
  id: number
  action: string
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  description?: string | null
  actorUsername?: string | null
  actorRole?: string | null
  createdAt: string
}

type AuditListResponse = { data: AuditEntry[]; meta: { pagination: { total: number } } }

type HealthResponse = {
  uptime: number
  startedAt: string
  memory: { total: number; free: number; used: number }
  disk: { ok: boolean; total?: number; free?: number; used?: number }
  database: { ok: boolean; latency?: number | null; client?: string | null; error?: string }
  logins: { failed24h: number; failed7d: number; failedTotal: number; recentFailed: AuditEntry[]; recentLogins: AuditEntry[] }
  errors: { total: number; recent: AuditEntry[] }
  now: string
}

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data: userData, refresh: refreshUsers, status: usersStatus } = await useFetch<DirectoryUser[]>('/api/user-directory', { baseURL, headers })
const { data: roleData, refresh: refreshRoles } = await useFetch<RoleInfo[]>('/api/roles', { baseURL, headers })
const { data: auditData, refresh: refreshAudits } = await useFetch<AuditListResponse>('/api/audit-logs', {
  baseURL,
  headers,
  query: { sort: 'createdAt:desc', 'pagination[pageSize]': 8 }
})
const { data: healthData, refresh: refreshHealth } = await useFetch<HealthResponse>('/api/system/health', { baseURL, headers })

const refreshing = ref(false)
const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([refreshUsers(), refreshRoles(), refreshAudits(), refreshHealth()])
  refreshing.value = false
}

const users = computed(() => userData.value ?? [])
const userCount = computed(() => users.value.length)
const blockedCount = computed(() => users.value.filter(user => user.blocked).length)
const roleCount = computed(() => roleData.value?.length ?? 0)
const auditCount = computed(() => auditData.value?.meta?.pagination?.total ?? 0)
const recentAudits = computed(() => auditData.value?.data ?? [])

const health = computed(() => healthData.value)

const failedLogins24h = computed(() => health.value?.logins?.failed24h ?? 0)
const recentLogins = computed(() => health.value?.logins?.recentLogins ?? [])
const serverErrors = computed(() => health.value?.errors?.total ?? 0)

const usersByRole = computed(() => {
  const buckets: { type: string; label: string; color: string; count: number }[] = [
    { type: 'student', label: 'Students', color: 'primary', count: 0 },
    { type: 'aspiring-tenant', label: 'Aspiring tenants', color: 'secondary', count: 0 },
    { type: 'current-tenant', label: 'Current tenants', color: 'success', count: 0 },
    { type: 'oas', label: 'OAS', color: 'warning', count: 0 },
    { type: 'admin', label: 'Administrators', color: 'error', count: 0 }
  ]
  for (const user of users.value) {
    const bucket = buckets.find(item => item.type === user.role?.type)
    if (bucket) bucket.count += 1
  }
  return buckets
})

const cards = computed(() => [
  { label: 'Registered users', value: userCount.value, icon: 'i-lucide-users', to: '/admin/users', accent: 'bg-maroon-100 text-maroon-800' },
  { label: 'Managed roles', value: roleCount.value, icon: 'i-lucide-shield-check', to: '/admin/roles', accent: 'bg-gold-100 text-gold-700' },
  { label: 'Audit entries', value: auditCount.value, icon: 'i-lucide-scroll-text', to: '/admin/audit-logs', accent: 'bg-gold-50 text-gold-700' },
  { label: 'Failed logins (24h)', value: failedLogins24h.value, icon: 'i-lucide-shield-alert', to: '/admin/system-monitoring', accent: 'bg-maroon-50 text-maroon-800' }
])

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''

const formatUptime = (seconds?: number) => {
  if (seconds == null) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const formatBytes = (bytes?: number) => {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

const actionLabel = (action: string) => action.replace(/-/g, ' ')
</script>

<template>
  <div>
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">{{ greeting }}, {{ auth.user.value?.username }}</h1>
        <p class="mt-2 max-w-xl text-muted">{{ today }} · Platform overview for system administrators</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="refreshing" @click="refreshAll" />
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink v-for="card in cards" :key="card.to" :to="card.to" class="group rounded-xl border border-default bg-default p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
        <div class="flex items-start justify-between">
          <span class="grid size-10 place-items-center rounded-lg" :class="card.accent">
            <UIcon :name="card.icon" class="size-5" />
          </span>
          <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p class="mt-4 text-3xl font-bold tracking-tight text-highlighted">{{ card.value }}</p>
        <p class="mt-1 text-sm text-muted">{{ card.label }}</p>
      </NuxtLink>
    </div>

    <div class="mt-10 grid gap-4 lg:grid-cols-3">
      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">Users by role</h2>
            <NuxtLink to="/admin/users" class="text-sm font-medium text-primary hover:underline">Manage</NuxtLink>
          </div>
        </template>
        <dl class="space-y-4">
          <div v-for="bucket in usersByRole" :key="bucket.type" class="flex items-center justify-between text-sm">
            <dt class="flex items-center gap-2 text-muted">
              <UBadge :color="bucket.color" variant="subtle">{{ bucket.label }}</UBadge>
            </dt>
            <dd class="font-semibold text-highlighted">{{ bucket.count }}</dd>
          </div>
          <div class="flex items-center justify-between border-t border-default pt-3 text-sm">
            <dt class="flex items-center gap-2 text-muted"><UIcon name="i-lucide-user-x" class="size-4 text-error-500" />Blocked accounts</dt>
            <dd class="font-semibold text-highlighted">{{ blockedCount }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">System health</h2>
            <NuxtLink to="/admin/system-monitoring" class="text-sm font-medium text-primary hover:underline">Monitor</NuxtLink>
          </div>
        </template>
        <dl class="space-y-4">
          <div class="flex items-center justify-between text-sm">
            <dt class="text-muted">Database</dt>
            <dd>
              <span v-if="health?.database?.ok" class="inline-flex items-center gap-1.5 font-medium text-success-600">
                <UIcon name="i-lucide-circle-check" class="size-4" />Connected
                <span class="text-xs text-muted">({{ health?.database?.latency }}ms)</span>
              </span>
              <span v-else class="inline-flex items-center gap-1.5 font-medium text-error-600">
                <UIcon name="i-lucide-circle-alert" class="size-4" />Unavailable
              </span>
            </dd>
          </div>
          <div class="flex items-center justify-between text-sm">
            <dt class="text-muted">Uptime</dt>
            <dd class="font-medium text-highlighted">{{ formatUptime(health?.uptime) }}</dd>
          </div>
          <div class="flex items-center justify-between text-sm">
            <dt class="text-muted">Memory</dt>
            <dd class="font-medium text-highlighted">{{ formatBytes(health?.memory?.used) }} / {{ formatBytes(health?.memory?.total) }}</dd>
          </div>
          <div class="flex items-center justify-between text-sm">
            <dt class="text-muted">Disk free</dt>
            <dd class="font-medium text-highlighted">{{ health?.disk?.ok ? formatBytes(health?.disk?.free) : '—' }}</dd>
          </div>
          <div class="flex items-center justify-between text-sm">
            <dt class="text-muted">Server errors</dt>
            <dd class="font-medium text-highlighted">{{ serverErrors }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">Recent activity</h2>
            <NuxtLink to="/admin/audit-logs" class="text-sm font-medium text-primary hover:underline">View all</NuxtLink>
          </div>
        </template>
        <ul v-if="recentAudits.length" class="divide-y divide-default">
          <li v-for="entry in recentAudits" :key="entry.id" class="px-5 py-3">
            <div class="flex items-center justify-between gap-3">
              <p class="min-w-0 truncate text-sm font-medium capitalize text-highlighted">{{ actionLabel(entry.action) }}</p>
              <span class="shrink-0 text-xs text-muted">{{ formatDate(entry.createdAt) }}</span>
            </div>
            <p class="mt-0.5 truncate text-xs text-muted">{{ entry.description || entry.entityLabel || '—' }}</p>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No activity recorded yet.</p>
      </UCard>
    </div>

    <UCard v-if="recentLogins.length" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-highlighted">Latest staff sign-ins</h2>
          <NuxtLink to="/admin/audit-logs" class="text-sm font-medium text-primary hover:underline">Audit log</NuxtLink>
        </div>
      </template>
      <ul class="divide-y divide-default">
        <li v-for="entry in recentLogins" :key="entry.id" class="flex items-center justify-between gap-3 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-maroon-100 text-maroon-800">
              <UIcon name="i-lucide-user-round-check" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ entry.entityLabel || entry.actorUsername || '—' }}</p>
              <p class="truncate text-xs text-muted">{{ entry.description }}</p>
            </div>
          </div>
          <span class="shrink-0 text-xs text-muted">{{ formatDate(entry.createdAt) }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
