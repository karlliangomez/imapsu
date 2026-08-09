<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'System Settings | iMapSU' })

type SystemSettings = {
  id?: number
  systemName: string
  systemStatus: 'operational' | 'degraded' | 'maintenance'
  maintenanceBanner?: string | null
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireNumber: boolean
  passwordRequireSymbol: boolean
  passwordMaxAgeDays?: number | null
  accountLockoutThreshold: number
  accountLockoutWindowMinutes: number
  accountLockoutDurationMinutes: number
  uploadMaxFileMb: number
  uploadAllowedTypes?: unknown
  notificationEmailEnabled: boolean
  notifyOnApplication: boolean
  notifyOnTicket: boolean
  notifyOnReceipt: boolean
  notifyOnFollowUp: boolean
  backupsEnabled: boolean
  backupScheduleCron: string
  backupRetentionDays: number
}

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<{ data: SystemSettings }>('/api/system-settings', {
  baseURL,
  headers
})

const form = reactive<SystemSettings>({
  systemName: '',
  systemStatus: 'operational',
  maintenanceBanner: '',
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: null,
  accountLockoutThreshold: 5,
  accountLockoutWindowMinutes: 10,
  accountLockoutDurationMinutes: 30,
  uploadMaxFileMb: 10,
  notificationEmailEnabled: true,
  notifyOnApplication: true,
  notifyOnTicket: true,
  notifyOnReceipt: true,
  notifyOnFollowUp: true,
  backupsEnabled: true,
  backupScheduleCron: '0 2 * * *',
  backupRetentionDays: 7
})

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) return
    Object.assign(form, {
      systemName: settings.systemName ?? '',
      systemStatus: settings.systemStatus ?? 'operational',
      maintenanceBanner: settings.maintenanceBanner ?? '',
      passwordMinLength: settings.passwordMinLength ?? 8,
      passwordRequireUppercase: settings.passwordRequireUppercase ?? true,
      passwordRequireNumber: settings.passwordRequireNumber ?? true,
      passwordRequireSymbol: settings.passwordRequireSymbol ?? false,
      passwordMaxAgeDays: settings.passwordMaxAgeDays ?? null,
      accountLockoutThreshold: settings.accountLockoutThreshold ?? 5,
      accountLockoutWindowMinutes: settings.accountLockoutWindowMinutes ?? 10,
      accountLockoutDurationMinutes: settings.accountLockoutDurationMinutes ?? 30,
      uploadMaxFileMb: settings.uploadMaxFileMb ?? 10,
      notificationEmailEnabled: settings.notificationEmailEnabled ?? true,
      notifyOnApplication: settings.notifyOnApplication ?? true,
      notifyOnTicket: settings.notifyOnTicket ?? true,
      notifyOnReceipt: settings.notifyOnReceipt ?? true,
      notifyOnFollowUp: settings.notifyOnFollowUp ?? true,
      backupsEnabled: settings.backupsEnabled ?? true,
      backupScheduleCron: settings.backupScheduleCron ?? '0 2 * * *',
      backupRetentionDays: settings.backupRetentionDays ?? 7
    })
  },
  { immediate: true, deep: true }
)

const saving = ref(false)

const save = async () => {
  saving.value = true
  try {
    await $api('/api/system-settings', {
      method: 'PUT',
      body: {
        data: {
          ...form,
          passwordMaxAgeDays: form.passwordMaxAgeDays ?? null
        }
      }
    })
    toast.add({ title: 'Settings saved', description: 'System configuration has been updated.', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not save settings', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

const statusOptions = [
  { label: 'Operational', value: 'operational' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Maintenance', value: 'maintenance' }
]
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">System Settings</h1>
        <p class="mt-2 max-w-xl text-muted">
          Configure system-wide behaviour: account policy, notification preferences, upload restrictions and the database backup schedule.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Save changes" icon="i-lucide-save" :loading="saving" @click="save" />
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="index in 4" :key="index" class="h-32 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load system settings" :description="error.message" />

    <form v-else class="space-y-6" @submit.prevent="save">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">General</h2>
          <p class="text-sm text-muted">Identity and status shown across the platform.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField label="System name">
            <UInput v-model="form.systemName" type="text" autocomplete="off" />
          </UFormField>
          <UFormField label="System status">
            <USelect v-model="form.systemStatus" :items="statusOptions" />
          </UFormField>
        </div>
        <UFormField class="mt-4" label="Maintenance banner (shown to all users while in maintenance mode)">
          <UTextarea v-model="form.maintenanceBanner" :rows="2" />
        </UFormField>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Account policy</h2>
          <p class="text-sm text-muted">Requirements applied to new and reset passwords, plus account lockout settings.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="Minimum password length">
            <UInputNumber v-model="form.passwordMinLength" :min="4" :max="32" />
          </UFormField>
          <UFormField label="Maximum password age (days, 0 = never)">
            <UInputNumber v-model="form.passwordMaxAgeDays" :min="0" />
          </UFormField>
          <UFormField label="Failed attempts before lockout">
            <UInputNumber v-model="form.accountLockoutThreshold" :min="0" />
          </UFormField>
          <UFormField label="Lockout window (minutes)">
            <UInputNumber v-model="form.accountLockoutWindowMinutes" :min="1" />
          </UFormField>
          <UFormField label="Lockout duration (minutes)">
            <UInputNumber v-model="form.accountLockoutDurationMinutes" :min="1" />
          </UFormField>
        </div>
        <div class="mt-4 space-y-3">
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require an uppercase letter</p>
              <p class="text-xs text-muted">Passwords must contain at least one A–Z character.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireUppercase" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require a number</p>
              <p class="text-xs text-muted">Passwords must contain at least one digit.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireNumber" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require a symbol</p>
              <p class="text-xs text-muted">Passwords must contain at least one special character such as ! @ # $.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireSymbol" />
          </label>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Notifications</h2>
          <p class="text-sm text-muted">Which OAS-facing notification categories are recorded.</p>
        </template>
        <div class="space-y-3">
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Rental applications</p>
              <p class="text-xs text-muted">Notify the OAS when a rental application is submitted.</p>
            </div>
            <UCheckbox v-model="form.notifyOnApplication" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Maintenance tickets</p>
              <p class="text-xs text-muted">Notify the OAS when a maintenance ticket is filed.</p>
            </div>
            <UCheckbox v-model="form.notifyOnTicket" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Receipt uploads</p>
              <p class="text-xs text-muted">Notify the OAS when a payment receipt is uploaded.</p>
            </div>
            <UCheckbox v-model="form.notifyOnReceipt" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Ticket follow-ups</p>
              <p class="text-xs text-muted">Notify the OAS when a tenant follows up on a ticket.</p>
            </div>
            <UCheckbox v-model="form.notifyOnFollowUp" />
          </label>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">File uploads</h2>
          <p class="text-sm text-muted">Restrictions applied to uploaded documents and images.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField label="Maximum upload size (MB)">
            <UInputNumber v-model="form.uploadMaxFileMb" :min="1" :max="100" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Database backup</h2>
          <p class="text-sm text-muted">Scheduled backup configuration. Changing the schedule takes effect on the next server restart.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField label="Backup schedule (cron)">
            <UInput v-model="form.backupScheduleCron" type="text" placeholder="0 2 * * *" autocomplete="off" />
          </UFormField>
          <UFormField label="Retention (days)">
            <UInputNumber v-model="form.backupRetentionDays" :min="1" />
          </UFormField>
        </div>
        <label class="mt-4 flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
          <div>
            <p class="text-sm font-medium text-highlighted">Enable scheduled backups</p>
            <p class="text-xs text-muted">Create a database dump on the configured schedule and prune old backups.</p>
          </div>
          <UCheckbox v-model="form.backupsEnabled" />
        </label>
      </UCard>

      <div class="flex justify-end">
        <UButton type="submit" icon="i-lucide-save" :loading="saving">Save changes</UButton>
      </div>
    </form>
  </main>
</template>
