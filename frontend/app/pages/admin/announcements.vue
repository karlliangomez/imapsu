<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type Announcement = {
  id: number | string
  documentId?: string
  title: string
  body: string
  audience: 'Everyone' | 'Students' | 'Tenants'
  pinned?: boolean
  publishedAt?: string
  publishAt?: string
  expireAt?: string
  createdAt?: string
}

type ListResponse<T> = { data: T[] }

type Acknowledgment = {
  id: number | string
  documentId?: string
  acknowledgedAt?: string
  user?: { username?: string } | null
  announcement?: { documentId?: string } | null
}

useHead({ title: 'Announcements | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Announcement>>('/api/announcements', {
  baseURL,
  headers,
  query: { sort: 'pinned:desc,publishedAt:desc', 'pagination[pageSize]': 100 }
})

const { data: ackData, refresh: refreshAcks } = await useFetch<ListResponse<Acknowledgment>>('/api/announcement-acknowledgments', {
  baseURL,
  headers,
  query: { 'populate[announcement]': true, 'populate[user]': true, 'pagination[pageSize]': 500 }
})

const announcements = computed(() => data.value?.data ?? [])
const acknowledgments = computed(() => ackData.value?.data ?? [])

const ackCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const ack of acknowledgments.value) {
    const key = ack.announcement?.documentId
    if (key) counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
})

const ackFor = (item: Announcement) => {
  const key = String(item.documentId ?? item.id)
  return acknowledgments.value.filter(ack => ack.announcement?.documentId === key)
}

const ackCountFor = (item: Announcement) => ackCounts.value[String(item.documentId ?? item.id)] ?? 0

const refreshAll = async () => {
  await Promise.all([refresh(), refreshAcks()])
}

const ackModalOpen = ref(false)
const ackTarget = ref<Announcement | null>(null)

const ackOpenFor = (item: Announcement) => {
  ackTarget.value = item
  ackModalOpen.value = true
}

const formOpen = ref(false)
const editing = ref<Announcement | null>(null)
const saving = ref(false)
const formError = ref('')
const form = reactive({ title: '', body: '', audience: 'Everyone', pinned: false, publishAt: '', expireAt: '' })

const toLocalInput = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const toIsoOrNull = (local?: string) => local ? new Date(local).toISOString() : null

const openCreate = () => {
  editing.value = null
  Object.assign(form, { title: '', body: '', audience: 'Everyone', pinned: false, publishAt: '', expireAt: '' })
  formError.value = ''
  formOpen.value = true
}

const openEdit = (item: Announcement) => {
  editing.value = item
  Object.assign(form, {
    title: item.title,
    body: item.body,
    audience: item.audience ?? 'Everyone',
    pinned: item.pinned ?? false,
    publishAt: toLocalInput(item.publishAt),
    expireAt: toLocalInput(item.expireAt),
  })
  formError.value = ''
  formOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.title.trim()) {
    formError.value = 'Please enter a title.'
    return
  }
  if (!form.body.trim()) {
    formError.value = 'Please enter the announcement body.'
    return
  }

  saving.value = true
  try {
    const body = {
      data: {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        pinned: form.pinned,
        publishAt: toIsoOrNull(form.publishAt),
        expireAt: toIsoOrNull(form.expireAt),
      }
    }
    if (editing.value) {
      await $api(`/api/announcements/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Announcement updated', color: 'success', icon: 'i-lucide-check-circle' })
    } else {
      await $api('/api/announcements', { method: 'POST', body })
      toast.add({ title: 'Announcement created', description: 'It is now visible to its audience.', color: 'success', icon: 'i-lucide-check-circle' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (item: Announcement) => {
  if (!confirm(`Delete the announcement \u201c${item.title}\u201d?`)) return
  try {
    await $api(`/api/announcements/${item.documentId ?? item.id}`, { method: 'DELETE' })
    toast.add({ title: 'Announcement deleted', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete announcement', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const togglingPin = ref<string | null>(null)

const togglePin = async (item: Announcement) => {
  const key = String(item.documentId ?? item.id)
  if (togglingPin.value) return
  togglingPin.value = key
  try {
    await $api(`/api/announcements/${key}`, {
      method: 'PUT',
      body: { data: { pinned: !item.pinned } }
    })
    toast.add({ title: item.pinned ? 'Announcement unpinned' : 'Announcement pinned', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update announcement', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    togglingPin.value = null
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

const isScheduled = (item: Announcement) => !!item.publishAt && new Date(item.publishAt).getTime() > Date.now()
const isExpired = (item: Announcement) => !!item.expireAt && new Date(item.expireAt).getTime() <= Date.now()

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Announcements</h1>
        <p class="mt-2 max-w-xl text-muted">Publish announcements for students, tenants, or everyone.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
        <UButton label="New announcement" icon="i-lucide-plus" @click="openCreate" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-32 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load announcements" :description="error.message" />

    <UEmpty v-else-if="announcements.length === 0" icon="i-lucide-bell-off" title="No announcements yet" description="Create an announcement to get started." />

    <div v-else class="space-y-4">
      <UCard v-for="item in announcements" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-highlighted">{{ item.title }}</h2>
            <p class="mt-1 text-xs text-muted">Published {{ formatDate(item.publishedAt ?? item.createdAt) }}</p>
            <p v-if="isScheduled(item)" class="mt-1 text-xs font-medium text-warning-500">Publishes {{ formatDateTime(item.publishAt) }}</p>
            <p v-if="item.expireAt" class="mt-1 text-xs text-muted">Expires {{ formatDateTime(item.expireAt) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge v-if="isExpired(item)" color="error" variant="subtle" icon="i-lucide-circle-off">Expired</UBadge>
            <UBadge v-else-if="isScheduled(item)" color="warning" variant="subtle" icon="i-lucide-calendar-clock">Scheduled</UBadge>
            <UBadge v-if="item.pinned" color="primary" variant="subtle" icon="i-lucide-pin">Pinned</UBadge>
            <UBadge :color="audienceColor(item.audience)" variant="subtle">{{ item.audience }}</UBadge>
            <UButton :icon="item.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'" :label="item.pinned ? 'Unpin' : 'Pin'" color="neutral" variant="ghost" size="sm" :loading="togglingPin === String(item.documentId ?? item.id)" @click="togglePin(item)" />
            <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(item)" />
            <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(item)" />
          </div>
        </div>
        <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-toned">{{ item.body }}</p>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
          <p class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-badge-check" class="size-4 text-success-500" />
            {{ ackCountFor(item) }} acknowledgment{{ ackCountFor(item) === 1 ? '' : 's' }}
          </p>
          <UButton v-if="ackFor(item).length" size="xs" color="neutral" variant="subtle" icon="i-lucide-users" @click="ackOpenFor(item)">
            View acknowledgments
          </UButton>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="ackModalOpen" :title="ackTarget ? `Acknowledged by ${ackCountFor(ackTarget)}` : 'Acknowledgments'" description="Users who have acknowledged this announcement.">
      <template #body>
        <ul v-if="ackTarget && ackFor(ackTarget).length" class="divide-y divide-default">
          <li v-for="ack in ackFor(ackTarget)" :key="ack.documentId ?? ack.id" class="flex items-center justify-between gap-3 py-2.5">
            <span class="flex items-center gap-2 text-sm font-medium text-highlighted">
              <UIcon name="i-lucide-user" class="size-4 text-muted" />
              {{ ack.user?.username ?? 'Unknown user' }}
            </span>
            <span class="text-xs text-muted">{{ formatDate(ack.acknowledgedAt) }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">No acknowledgments recorded yet.</p>
      </template>
    </UModal>

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="editing ? 'Edit announcement' : 'New announcement'" description="Publish an announcement to your chosen audience.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Title" required>
            <UInput v-model="form.title" placeholder="e.g. Midterm maintenance shutdown" />
          </UFormField>

          <UFormField label="Body" required>
            <UTextarea v-model="form.body" :rows="5" placeholder="Write the announcement\u2026" />
          </UFormField>

          <UFormField label="Audience" required>
            <USelect v-model="form.audience" :items="[{ label: 'Everyone', value: 'Everyone' }, { label: 'Students', value: 'Students' }, { label: 'Tenants', value: 'Tenants' }]" />
          </UFormField>

          <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2.5">
            <div>
              <p class="text-sm font-medium text-highlighted">Pin to top</p>
              <p class="text-xs text-muted">Keeps this announcement above all others in every list.</p>
            </div>
            <USwitch v-model="form.pinned" />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Publish date" description="Leave empty to publish immediately. Future dates are scheduled.">
              <UInput v-model="form.publishAt" type="datetime-local" />
            </UFormField>

            <UFormField label="Expiry date" description="The announcement automatically hides from its audience after this date.">
              <UInput v-model="form.expireAt" type="datetime-local" />
            </UFormField>
          </div>

          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Publish announcement' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
