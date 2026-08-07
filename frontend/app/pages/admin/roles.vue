<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'Roles & permissions | iMapSU' })

type RoleInfo = {
  type: string
  name: string
  description?: string
  permissions: string[]
}

type PermissionItem = { action: string; label: string }
type CatalogSection = { label: string; permissions: PermissionItem[] }

// Mirrors the backend permission catalog. The admin toggles these curated
// actions; protected essentials (me/updateAccount) are never shown as removable.
const PERMISSION_CATALOG: CatalogSection[] = [
  {
    label: 'Announcements',
    permissions: [
      { action: 'api::announcement.announcement.find', label: 'View announcements' },
      { action: 'api::announcement.announcement.findOne', label: 'View one announcement' },
      { action: 'api::announcement.announcement.create', label: 'Create announcements' },
      { action: 'api::announcement.announcement.update', label: 'Update announcements' },
      { action: 'api::announcement.announcement.delete', label: 'Delete announcements' }
    ]
  },
  {
    label: 'Properties',
    permissions: [
      { action: 'api::property-space.property-space.find', label: 'View properties' },
      { action: 'api::property-space.property-space.findOne', label: 'View one property' },
      { action: 'api::property-space.property-space.create', label: 'Create properties' },
      { action: 'api::property-space.property-space.update', label: 'Update properties' },
      { action: 'api::property-space.property-space.delete', label: 'Delete properties' }
    ]
  },
  {
    label: 'Rental applications',
    permissions: [
      { action: 'api::rental-application.rental-application.find', label: 'View rental applications' },
      { action: 'api::rental-application.rental-application.findOne', label: 'View one rental application' },
      { action: 'api::rental-application.rental-application.create', label: 'Create rental applications' },
      { action: 'api::rental-application.rental-application.update', label: 'Update rental applications' },
      { action: 'api::rental-application.rental-application.delete', label: 'Delete rental applications' }
    ]
  },
  {
    label: 'Tenancies',
    permissions: [
      { action: 'api::tenancy.tenancy.find', label: 'View tenancies' },
      { action: 'api::tenancy.tenancy.findOne', label: 'View one tenancy' },
      { action: 'api::tenancy.tenancy.create', label: 'Create tenancies' },
      { action: 'api::tenancy.tenancy.update', label: 'Update tenancies' },
      { action: 'api::tenancy.tenancy.delete', label: 'Delete tenancies' }
    ]
  },
  {
    label: 'Bills',
    permissions: [
      { action: 'api::bill.bill.find', label: 'View bills' },
      { action: 'api::bill.bill.findOne', label: 'View one bill' },
      { action: 'api::bill.bill.create', label: 'Create bills' },
      { action: 'api::bill.bill.update', label: 'Update bills' },
      { action: 'api::bill.bill.delete', label: 'Delete bills' }
    ]
  },
  {
    label: 'Contract renewals',
    permissions: [
      { action: 'api::renewal-intent.renewal-intent.find', label: 'View contract renewals' },
      { action: 'api::renewal-intent.renewal-intent.findOne', label: 'View one contract renewal' },
      { action: 'api::renewal-intent.renewal-intent.create', label: 'Create contract renewals' },
      { action: 'api::renewal-intent.renewal-intent.update', label: 'Update contract renewals' },
      { action: 'api::renewal-intent.renewal-intent.delete', label: 'Delete contract renewals' }
    ]
  },
  {
    label: 'Maintenance tickets',
    permissions: [
      { action: 'api::maintenance-ticket.maintenance-ticket.find', label: 'View maintenance tickets' },
      { action: 'api::maintenance-ticket.maintenance-ticket.findOne', label: 'View one maintenance ticket' },
      { action: 'api::maintenance-ticket.maintenance-ticket.create', label: 'Create maintenance tickets' },
      { action: 'api::maintenance-ticket.maintenance-ticket.update', label: 'Update maintenance tickets' },
      { action: 'api::maintenance-ticket.maintenance-ticket.delete', label: 'Delete maintenance tickets' },
      { action: 'api::maintenance-ticket.maintenance-ticket.followUp', label: 'Follow up on maintenance tickets' }
    ]
  },
  {
    label: 'Notifications',
    permissions: [
      { action: 'api::notification.notification.find', label: 'View notifications' },
      { action: 'api::notification.notification.unreadCount', label: 'View unread notification count' },
      { action: 'api::notification.notification.markRead', label: 'Mark notifications as read' },
      { action: 'api::notification.notification.markAllRead', label: 'Mark all notifications as read' }
    ]
  },
  {
    label: 'Meter readings',
    permissions: [
      { action: 'api::meter-reading.meter-reading.find', label: 'View meter readings' },
      { action: 'api::meter-reading.meter-reading.findOne', label: 'View one meter reading' },
      { action: 'api::meter-reading.meter-reading.create', label: 'Create meter readings' },
      { action: 'api::meter-reading.meter-reading.update', label: 'Update meter readings' },
      { action: 'api::meter-reading.meter-reading.delete', label: 'Delete meter readings' }
    ]
  },
  {
    label: 'Announcement acknowledgments',
    permissions: [
      { action: 'api::announcement-acknowledgment.announcement-acknowledgment.find', label: 'View acknowledgments' },
      { action: 'api::announcement-acknowledgment.announcement-acknowledgment.findOne', label: 'View one acknowledgment' },
      { action: 'api::announcement-acknowledgment.announcement-acknowledgment.create', label: 'Create acknowledgments' },
      { action: 'api::announcement-acknowledgment.announcement-acknowledgment.update', label: 'Update acknowledgments' },
      { action: 'api::announcement-acknowledgment.announcement-acknowledgment.delete', label: 'Delete acknowledgments' }
    ]
  },
  {
    label: 'Feedback',
    permissions: [
      { action: 'api::feedback.feedback.find', label: 'View feedback' },
      { action: 'api::feedback.feedback.findOne', label: 'View one feedback entry' },
      { action: 'api::feedback.feedback.create', label: 'Submit feedback' },
      { action: 'api::feedback.feedback.update', label: 'Update feedback' }
    ]
  },
  {
    label: 'Campus map',
    permissions: [
      { action: 'api::map-zone.map-zone.find', label: 'View map zones' },
      { action: 'api::map-zone.map-zone.findOne', label: 'View one map zone' },
      { action: 'api::map-zone.map-zone.create', label: 'Create map zones' },
      { action: 'api::map-zone.map-zone.update', label: 'Update map zones' },
      { action: 'api::map-zone.map-zone.delete', label: 'Delete map zones' }
    ]
  },
  {
    label: 'Users',
    permissions: [
      { action: 'plugin::users-permissions.user.find', label: 'View users' },
      { action: 'plugin::users-permissions.user.findOne', label: 'View one user' },
      { action: 'plugin::users-permissions.user.update', label: 'Update users' },
      { action: 'plugin::users-permissions.user.destroy', label: 'Delete users' }
    ]
  },
  {
    label: 'File uploads',
    permissions: [{ action: 'plugin::upload.content-api.upload', label: 'Upload files' }]
  }
]

const PROTECTED_ACTIONS = new Set(['api::auth.auth.me', 'api::auth.auth.updateAccount'])

const CATALOG_ACTIONS = new Set(PERMISSION_CATALOG.flatMap(section => section.permissions.map(permission => permission.action)))

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<RoleInfo[]>('/api/roles', { baseURL, headers })

const roles = computed(() => data.value ?? [])

const selected = ref<Record<string, string[]>>({})

const ADMIN_LOCKED_ACTIONS = new Set([
  'plugin::users-permissions.user.find',
  'plugin::users-permissions.user.findOne',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy'
])

const OAS_LOCKED_ACTIONS = new Set(
  [...CATALOG_ACTIONS].filter(action => action !== 'plugin::users-permissions.user.update' && action !== 'plugin::users-permissions.user.destroy')
)

const syncSelected = () => {
  const next: Record<string, string[]> = {}
  for (const role of roles.value) {
    const base = role.permissions.filter(action => CATALOG_ACTIONS.has(action))
    if (role.type === 'oas') {
      const set = new Set(base)
      for (const action of OAS_LOCKED_ACTIONS) set.add(action)
      next[role.type] = [...set]
    } else {
      next[role.type] = base
    }
  }
  selected.value = next
}

watch(roles, syncSelected, { immediate: true })

const isProtected = (role: RoleInfo, action: string) => PROTECTED_ACTIONS.has(action)
  || (role.type === 'admin' && ADMIN_LOCKED_ACTIONS.has(action))
  || (role.type === 'oas' && OAS_LOCKED_ACTIONS.has(action))

const isChecked = (roleType: string, action: string) => (selected.value[roleType] ?? []).includes(action)

const toggle = (roleType: string, action: string) => {
  const current = new Set(selected.value[roleType] ?? [])
  if (current.has(action)) {
    current.delete(action)
  } else {
    current.add(action)
  }
  selected.value[roleType] = [...current]
}

const saving = ref<string | null>(null)
const saveError = ref('')

const save = async (role: RoleInfo) => {
  saveError.value = ''
  saving.value = role.type
  try {
    await $api(`/api/roles/${role.type}/permissions`, {
      method: 'PUT',
      body: { actions: selected.value[role.type] ?? [] }
    })
    toast.add({ title: 'Permissions updated', description: `${role.name} role saved.`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    saveError.value = getErrorMessage(err)
  } finally {
    saving.value = null
  }
}

const selectedCount = (roleType: string) => (selected.value[roleType] ?? []).length

const roleColor = (type: string) => {
  switch (type) {
    case 'admin':
      return 'primary'
    case 'oas':
      return 'warning'
    case 'current-tenant':
      return 'success'
    case 'aspiring-tenant':
      return 'secondary'
    default:
      return 'neutral'
  }
}

</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">Roles &amp; permissions</h1>
        <p class="mt-2 max-w-xl text-muted">
          Toggle which capabilities each role has. The essentials (sign-in, account update) are always kept on.
        </p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" title="Could not save permissions" :description="saveError" class="mb-6" />

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 3" :key="index" class="h-64 rounded-xl" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load roles" :description="error.message" />

    <div v-else class="space-y-6">
      <UCard v-for="role in roles" :key="role.type">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="grid size-10 place-items-center rounded-lg bg-maroon-100 text-maroon-800">
                <UIcon name="i-lucide-shield" class="size-5" />
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold text-highlighted">{{ role.name }}</h2>
                  <UBadge :color="roleColor(role.type)" variant="subtle">{{ role.type }}</UBadge>
                </div>
                <p class="text-xs text-muted">{{ role.description }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm text-muted">{{ selectedCount(role.type) }} permissions selected</span>
              <UButton icon="i-lucide-save" :loading="saving === role.type" @click="save(role)">Save</UButton>
            </div>
          </div>
        </template>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="section in PERMISSION_CATALOG" :key="section.label">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{{ section.label }}</p>
            <ul class="space-y-1.5">
              <li v-for="permission in section.permissions" :key="permission.action">
                <label
                  class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-primary/5"
                  :class="isProtected(role, permission.action) ? 'cursor-not-allowed opacity-50' : ''"
                >
                  <UCheckbox
                    :model-value="isChecked(role.type, permission.action)"
                    :disabled="isProtected(role, permission.action)"
                    @update:model-value="toggle(role.type, permission.action)"
                  />
                  <span class="text-highlighted">{{ permission.label }}</span>
                </label>
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </div>
  </main>
</template>
