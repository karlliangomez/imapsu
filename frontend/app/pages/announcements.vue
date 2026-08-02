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

type AnnouncementResponse = { data: Announcement[] }

useHead({ title: 'Announcements | iMapSU' })

const { baseURL } = useStrapi()
const { data, status, error, refresh } = await useFetch<AnnouncementResponse>('/api/announcements', {
  baseURL,
  query: {
    sort: 'publishedAt:desc',
    'pagination[pageSize]': 50
  }
})

const announcements = computed(() => data.value?.data ?? [])

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
        <p class="mt-2 max-w-xl text-muted">Latest updates from the iMapSU administration.</p>
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
          <UBadge :color="audienceColor(announcement.audience)" variant="subtle">{{ announcement.audience }}</UBadge>
        </div>
        <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-toned">{{ announcement.body }}</p>
      </UCard>
    </div>
  </main>
</template>
