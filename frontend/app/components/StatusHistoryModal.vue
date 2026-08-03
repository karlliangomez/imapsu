<script setup lang="ts">
type StatusHistoryEntry = {
  id: number
  fromStatus?: string | null
  toStatus: string
  changedAt: string
  changedBy?: { id: number; username?: string } | null
}

type EntityType = 'rental-application' | 'maintenance-ticket' | 'bill' | 'tenancy'

const props = defineProps<{
  entityType: EntityType
  entityId: string
  entityLabel?: string
}>()

const open = defineModel<boolean>('open')

const { $api, getErrorMessage } = useStrapi()

const entries = ref<StatusHistoryEntry[]>([])
const loading = ref(false)
const loadError = ref('')

watch(open, (isOpen) => {
  if (isOpen) load()
})

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    entries.value = await $api<StatusHistoryEntry[]>('/api/status-histories', {
      query: { entityType: props.entityType, entityId: props.entityId }
    })
  } catch (err) {
    loadError.value = getErrorMessage(err)
  } finally {
    loading.value = false
  }
}

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''
</script>

<template>
  <UModal v-model:open="open" title="Status history" :description="entityLabel ?? 'Recorded status changes.'">
    <template #body>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="index in 3" :key="index" class="h-12 rounded-lg" />
      </div>

      <UAlert v-else-if="loadError" color="error" icon="i-lucide-circle-alert" :description="loadError" />

      <div v-else-if="entries.length === 0" class="rounded-lg border border-dashed border-default px-4 py-8 text-center text-sm text-muted">
        No status changes recorded yet.
      </div>

      <ol v-else class="relative space-y-4">
        <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-3">
          <span class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-highlighted">
              <span v-if="entry.fromStatus" class="font-medium">{{ entry.fromStatus }}</span>
              <UIcon v-if="entry.fromStatus" name="i-lucide-arrow-right" class="mx-1 size-3.5 align-[-2px] text-muted" />
              <span class="font-semibold">{{ entry.toStatus }}</span>
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ formatDateTime(entry.changedAt) }}
              <template v-if="entry.changedBy?.username"> · {{ entry.changedBy.username }}</template>
            </p>
          </div>
        </li>
      </ol>
    </template>
  </UModal>
</template>
