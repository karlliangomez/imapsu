<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'Database backups | iMapSU' })

type BackupMeta = {
  name: string
  size: number
  createdAt: string
}

type BackupSettings = {
  enabled: boolean
  scheduleCron: string
  retentionDays: number
  backupDir: string
}

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<{ backups: BackupMeta[] }>('/api/system/backups', {
  baseURL,
  headers
})

const { data: settingsData, refresh: refreshSettings } = await useFetch<BackupSettings>('/api/system/backups/settings', {
  baseURL,
  headers
})

const backups = computed(() => data.value?.backups ?? [])
const settings = computed(() => settingsData.value)

const creating = ref(false)
const deleting = ref<string | null>(null)
const restoring = ref(false)
const restoreFile = ref<File | null>(null)
const restoreInput = ref<HTMLInputElement | null>(null)

const createBackup = async () => {
  creating.value = true
  try {
    const result = await $api<{ backup: BackupMeta }>('/api/system/backups', { method: 'POST' })
    toast.add({ title: 'Backup created', description: result.backup.name, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not create backup', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    creating.value = false
  }
}

const removeBackup = async (backup: BackupMeta) => {
  if (!confirm(`Delete backup "${backup.name}"? This cannot be undone.`)) return
  deleting.value = backup.name
  try {
    await $api(`/api/system/backups/${backup.name}`, { method: 'DELETE' })
    toast.add({ title: 'Backup deleted', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete backup', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = null
  }
}

const onFilePicked = (event: Event) => {
  const input = event.target as HTMLInputElement
  restoreFile.value = input.files?.[0] ?? null
}

const restoreBackup = async () => {
  if (!restoreFile.value) return
  if (!confirm(`Restore the database from "${restoreFile.value.name}"?\n\nThis will REPLACE all current data with the contents of the backup. This cannot be undone.`)) return

  restoring.value = true
  try {
    const result = await $api<{ ok: boolean }>('/api/system/backups/restore', {
      method: 'POST',
      body: restoreFile.value,
      headers: { 'Content-Type': 'application/octet-stream' }
    })
    toast.add({ title: 'Database restored', description: result.ok ? 'Backup applied successfully.' : 'Restore completed.', color: 'success', icon: 'i-lucide-check-circle' })
    restoreFile.value = null
    if (restoreInput.value) restoreInput.value.value = ''
  } catch (err) {
    toast.add({ title: 'Restore failed', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    restoring.value = false
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">Database backups</h1>
        <p class="mt-2 max-w-xl text-muted">
          Create on-demand database backups, download dumps, and restore the database from an uploaded backup file.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Back up now" icon="i-lucide-database-backup" :loading="creating" @click="createBackup" />
      </div>
    </div>

    <div class="mb-8 grid gap-4 sm:grid-cols-3">
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <span class="i-lucide-clock text-lg"></span>
          </span>
          <div>
            <p class="text-xs text-muted">Schedule</p>
            <p class="font-medium text-highlighted">{{ settings?.scheduleCron ?? '—' }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <span class="i-lucide-calendar-check text-lg"></span>
          </span>
          <div>
            <p class="text-xs text-muted">Retention</p>
            <p class="font-medium text-highlighted">{{ settings ? `${settings.retentionDays} days` : '—' }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <span class="i-lucide-power text-lg"></span>
          </span>
          <div>
            <p class="text-xs text-muted">Scheduled backups</p>
            <p class="font-medium text-highlighted">{{ settings?.enabled ? 'Enabled' : 'Disabled' }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">Restore database</h2>
        <p class="text-sm text-muted">Upload a .dump file created by this tool (or an equivalent PostgreSQL custom-format dump).</p>
      </template>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref="restoreInput" type="file" accept=".dump,application/octet-stream" class="block w-full max-w-sm text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary" @change="onFilePicked" />
        <UButton
          label="Restore database"
          icon="i-lucide-upload-cloud"
          color="warning"
          :disabled="!restoreFile"
          :loading="restoring"
          @click="restoreBackup"
        />
      </div>
      <UAlert v-if="restoreFile" class="mt-4" color="warning" icon="i-lucide-triangle-alert" title="Destructive operation" :description="`Restoring from ${restoreFile.name} will replace all current data.`" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-highlighted">Backup files</h2>
          <span class="text-sm text-muted">{{ backups.length }} stored</span>
        </div>
      </template>

      <div v-if="status === 'pending'" class="space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-12 rounded-lg" />
      </div>

      <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load backups" :description="error.message" />

      <UEmpty v-else-if="backups.length === 0" icon="i-lucide-database" title="No backups yet" description="Create your first backup with “Back up now”." />

      <ul v-else class="divide-y divide-default">
        <li v-for="backup in backups" :key="backup.name" class="flex items-center gap-4 px-5 py-3">
          <span class="i-lucide-file-archive text-lg text-muted"></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ backup.name }}</p>
            <p class="text-xs text-muted">{{ formatDate(backup.createdAt) }} · {{ formatSize(backup.size) }}</p>
          </div>
          <UButton
            square
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="sm"
            :loading="deleting === backup.name"
            :aria-label="'Delete backup'"
            @click="removeBackup(backup)"
          />
        </li>
      </ul>
    </UCard>
  </main>
</template>
