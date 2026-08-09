<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'System Monitoring | iMapSU' })

type AuditEntry = {
  id: number
  action: string
  entityType?: string | null
  entityLabel?: string | null
  description?: string | null
  actorUsername?: string | null
  actorRole?: string | null
  createdAt: string
}

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

const { data: health, status, error, refresh } = await useFetch<HealthResponse>('/api/system/health', {
  baseURL,
  headers
})

const refreshing = ref(false)
const manualRefresh = async () => {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => { refresh() }, 30000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

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

const memoryPercent = computed(() => {
  const total = health.value?.memory?.total ?? 0
  return total > 0 ? Math.round(((health.value?.memory?.used ?? 0) / total) * 100) : 0
})

const diskPercent = computed(() => {
  const total = health.value?.disk?.total ?? 0
  return total > 0 ? Math.round(((health.value?.disk?.used ?? 0) / total) * 100) : 0
})

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''

const lastChecked = ref(new Date().toLocaleTimeString())
watch(health, () => { lastChecked.value = new Date().toLocaleTimeString() })
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">System Monitoring</h1>
        <p class="mt-2 max-w-xl text-muted">
          Live health of the platform: availability, resource usage, sign-in security and server errors. Refreshes automatically every 30 seconds.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted">Last checked {{ lastChecked }}</span>
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="refreshing || status === 'pending'" @click="manualRefresh" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 3" :key="index" class="h-56 rounded-xl" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load system health" :description="error.message" />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard :ui="{ body: 'p-5' }">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-success-100 text-success-700">
              <UIcon name="i-lucide-server" class="size-5" />
            </span>
            <div>
              <p class="text-xs text-muted">Database</p>
              <p class="flex items-center gap-1.5 font-semibold text-highlighted">
                <UIcon name="i-lucide-circle-check" class="size-4 text-success-600" />
                Connected
              </p>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">Latency {{ health?.database?.latency ?? '—' }} ms · {{ health?.database?.client ?? '—' }}</p>
        </UCard>

        <UCard :ui="{ body: 'p-5' }">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-maroon-100 text-maroon-800">
              <UIcon name="i-lucide-timer" class="size-5" />
            </span>
            <div>
              <p class="text-xs text-muted">Uptime</p>
              <p class="font-semibold text-highlighted">{{ formatUptime(health?.uptime) }}</p>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">Started {{ formatDate(health?.startedAt) }}</p>
        </UCard>

        <UCard :ui="{ body: 'p-5' }">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-gold-100 text-gold-700">
              <UIcon name="i-lucide-shield-alert" class="size-5" />
            </span>
            <div>
              <p class="text-xs text-muted">Failed logins · 24h</p>
              <p class="font-semibold text-highlighted">{{ health?.logins?.failed24h ?? '—' }}</p>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">{{ health?.logins?.failed7d ?? '—' }} in 7 days · {{ health?.logins?.failedTotal ?? '—' }} total</p>
        </UCard>

        <UCard :ui="{ body: 'p-5' }">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-error-100 text-error-700">
              <UIcon name="i-lucide-bug" class="size-5" />
            </span>
            <div>
              <p class="text-xs text-muted">Server errors</p>
              <p class="font-semibold text-highlighted">{{ health?.errors?.total ?? '—' }}</p>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">Recorded in the audit log</p>
        </UCard>
      </div>

      <div class="mt-8 grid gap-4 lg:grid-cols-2">
        <UCard :ui="{ body: 'p-5' }">
          <template #header>
            <h2 class="text-lg font-semibold text-highlighted">Server resources</h2>
          </template>
          <dl class="space-y-5">
            <div>
              <div class="mb-1.5 flex items-center justify-between text-sm">
                <dt class="text-muted">Memory</dt>
                <dd class="font-medium text-highlighted">{{ formatBytes(health?.memory?.used) }} / {{ formatBytes(health?.memory?.total) }}</dd>
              </div>
              <UProgress :value="memoryPercent" color="primary" />
            </div>
            <div>
              <div class="mb-1.5 flex items-center justify-between text-sm">
                <dt class="text-muted">Uploads disk</dt>
                <dd v-if="health?.disk?.ok" class="font-medium text-highlighted">{{ formatBytes(health?.disk?.free) }} free</dd>
                <dd v-else class="font-medium text-muted">Unavailable</dd>
              </div>
              <UProgress :value="diskPercent" color="secondary" />
            </div>
          </dl>
        </UCard>

        <UCard :ui="{ body: 'p-0' }">
          <template #header>
            <h2 class="text-lg font-semibold text-highlighted">Failed sign-ins</h2>
          </template>
          <ul v-if="health?.logins?.recentFailed?.length" class="divide-y divide-default">
            <li v-for="entry in health?.logins?.recentFailed ?? []" :key="entry.id" class="flex items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ entry.entityLabel || entry.actorUsername || '—' }}</p>
                <p class="truncate text-xs text-muted">{{ entry.description }}</p>
              </div>
              <span class="shrink-0 text-xs text-muted">{{ formatDate(entry.createdAt) }}</span>
            </li>
          </ul>
          <p v-else class="px-5 py-6 text-sm text-muted">No failed sign-ins recorded.</p>
        </UCard>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <UCard :ui="{ body: 'p-0' }">
          <template #header>
            <h2 class="text-lg font-semibold text-highlighted">Recent server errors</h2>
          </template>
          <ul v-if="health?.errors?.recent?.length" class="divide-y divide-default">
            <li v-for="entry in health?.errors?.recent ?? []" :key="entry.id" class="px-5 py-3">
              <p class="truncate text-sm font-medium text-highlighted">{{ entry.entityLabel || 'Unknown request' }}</p>
              <p class="mt-0.5 truncate text-xs text-muted">{{ entry.description }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ formatDate(entry.createdAt) }}</p>
            </li>
          </ul>
          <p v-else class="px-5 py-6 text-sm text-muted">No server errors recorded.</p>
        </UCard>

        <UCard :ui="{ body: 'p-0' }">
          <template #header>
            <h2 class="text-lg font-semibold text-highlighted">Staff sign-ins</h2>
          </template>
          <ul v-if="health?.logins?.recentLogins?.length" class="divide-y divide-default">
            <li v-for="entry in health?.logins?.recentLogins ?? []" :key="entry.id" class="flex items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ entry.entityLabel || entry.actorUsername || '—' }}</p>
                <p class="truncate text-xs text-muted">{{ entry.description }}</p>
              </div>
              <span class="shrink-0 text-xs text-muted">{{ formatDate(entry.createdAt) }}</span>
            </li>
          </ul>
          <p v-else class="px-5 py-6 text-sm text-muted">No staff sign-ins recorded.</p>
        </UCard>
      </div>
    </template>
  </main>
</template>
