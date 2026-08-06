<script setup lang="ts">
type Announcement = {
  id: number | string
  documentId?: string
  title: string
  body: string
  audience: 'Everyone' | 'Students' | 'Tenants'
  publishedAt?: string
  createdAt?: string
}

type Acknowledgment = {
  id: number | string
  documentId?: string
  acknowledgedAt?: string
  announcement?: { documentId?: string } | null
}

type AnnouncementResponse = { data: Announcement[] }

useHead({ title: 'Announcements | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, authHeaders, $api, getErrorMessage } = useStrapi()
const { data, status, error, refresh } = await useFetch<AnnouncementResponse>('/api/announcements', {
  baseURL,
  headers: authHeaders,
  query: {
    sort: 'publishedAt:desc',
    'pagination[pageSize]': 50
  }
})

const announcements = computed(() => data.value?.data ?? [])

const acknowledgedDocIds = ref<Set<string>>(new Set())
const acksLoaded = ref(false)
const acking = ref<string | null>(null)

const loadAcks = async () => {
  if (!auth.token.value) return
  try {
    const response = await $api<{ data: Acknowledgment[] }>('/api/announcement-acknowledgments', {
      query: { 'populate[announcement]': true, 'pagination[pageSize]': 200 }
    })
    acknowledgedDocIds.value = new Set(
      (response?.data ?? [])
        .map(ack => ack.announcement?.documentId)
        .filter((docId): docId is string => Boolean(docId))
    )
  } catch {
    acknowledgedDocIds.value = new Set()
  } finally {
    acksLoaded.value = true
  }
}

await loadAcks()

const isAcknowledged = (announcement: Announcement) =>
  acknowledgedDocIds.value.has(String(announcement.documentId ?? announcement.id))

const acknowledge = async (announcement: Announcement) => {
  const key = String(announcement.documentId ?? announcement.id)
  if (acking.value || isAcknowledged(announcement)) return
  acking.value = key
  try {
    await $api('/api/announcement-acknowledgments', {
      method: 'POST',
      body: { data: { announcement: key } }
    })
    acknowledgedDocIds.value.add(key)
    toast.add({ title: 'Announcement acknowledged', color: 'success', icon: 'i-lucide-check-circle' })
  } catch (err) {
    toast.add({ title: 'Could not acknowledge', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    acking.value = null
  }
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const audienceColor = (audience: Announcement['audience']) => {
  switch (audience) {
    case 'Students':
      return 'secondary'
    case 'Tenants':
      return 'primary'
    default:
      return 'neutral'
  }
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Stay informed</p>
        <h1 class="imapsu-page-heading">Announcements</h1>
        <p class="mt-2 max-w-xl text-muted">Latest updates from the iMapSU administration. Mark notices as acknowledged so the office can track reach.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-32 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load announcements" :description="error.message" />

    <UEmpty v-else-if="announcements.length === 0" icon="i-lucide-bell-off" title="No announcements yet" description="Announcements will appear here once published." />

    <div v-else class="space-y-4">
      <UCard v-for="announcement in announcements" :key="announcement.documentId ?? announcement.id" :ui="{ body: 'p-5' }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-highlighted">{{ announcement.title }}</h2>
            <p class="mt-1 text-xs text-muted">{{ formatDate(announcement.publishedAt ?? announcement.createdAt) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge v-if="auth.isAuthenticated && isAcknowledged(announcement)" color="success" variant="subtle" icon="i-lucide-check-circle-2">Acknowledged</UBadge>
            <UBadge :color="audienceColor(announcement.audience)" variant="subtle">{{ announcement.audience }}</UBadge>
          </div>
        </div>
        <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-toned">{{ announcement.body }}</p>
        <div v-if="auth.isAuthenticated && acksLoaded && !isAcknowledged(announcement)" class="mt-4 flex justify-end border-t border-default pt-4">
          <UButton size="sm" variant="subtle" icon="i-lucide-badge-check" :loading="acking === String(announcement.documentId ?? announcement.id)" @click="acknowledge(announcement)">Mark as acknowledged</UButton>
        </div>
      </UCard>
    </div>
  </main>
</template>
