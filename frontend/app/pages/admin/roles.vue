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

// Mirrors the backend permission catalog. The admin toggles these curated
// actions; protected essentials (me/updateAccount) are never shown as removable.
const PERMISSION_CATALOG = [
  {
    label: 'Announcements',
    actions: [
      'api::announcement.announcement.find',
      'api::announcement.announcement.findOne',
      'api::announcement.announcement.create',
      'api::announcement.announcement.update',
      'api::announcement.announcement.delete'
    ]
  },
  {
    label: 'Properties',
    actions: [
      'api::property-space.property-space.find',
      'api::property-space.property-space.findOne',
      'api::property-space.property-space.create',
      'api::property-space.property-space.update',
      'api::property-space.property-space.delete'
    ]
  },
  {
    label: 'Rental applications',
    actions: [
      'api::rental-application.rental-application.find',
      'api::rental-application.rental-application.findOne',
      'api::rental-application.rental-application.create',
      'api::rental-application.rental-application.update',
      'api::rental-application.rental-application.delete'
    ]
  },
  {
    label: 'Tenancies',
    actions: [
      'api::tenancy.tenancy.find',
      'api::tenancy.tenancy.findOne',
      'api::tenancy.tenancy.create',
      'api::tenancy.tenancy.update',
      'api::tenancy.tenancy.delete'
    ]
  },
  {
    label: 'Bills',
    actions: [
      'api::bill.bill.find',
      'api::bill.bill.findOne',
      'api::bill.bill.create',
      'api::bill.bill.update',
      'api::bill.bill.delete'
    ]
  },
  {
    label: 'Contract renewals',
    actions: [
      'api::renewal-intent.renewal-intent.find',
      'api::renewal-intent.renewal-intent.findOne',
      'api::renewal-intent.renewal-intent.create',
      'api::renewal-intent.renewal-intent.update',
      'api::renewal-intent.renewal-intent.delete'
    ]
  },
  {
    label: 'Maintenance tickets',
    actions: [
      'api::maintenance-ticket.maintenance-ticket.find',
      'api::maintenance-ticket.maintenance-ticket.findOne',
      'api::maintenance-ticket.maintenance-ticket.create',
      'api::maintenance-ticket.maintenance-ticket.update',
      'api::maintenance-ticket.maintenance-ticket.delete'
    ]
  },
  {
    label: 'Feedback',
    actions: [
      'api::feedback.feedback.find',
      'api::feedback.feedback.findOne',
      'api::feedback.feedback.create'
    ]
  },
  {
    label: 'Users',
    actions: [
      'plugin::users-permissions.user.find',
      'plugin::users-permissions.user.findOne',
      'plugin::users-permissions.user.update',
      'plugin::users-permissions.user.destroy'
    ]
  },
  {
    label: 'File uploads',
    actions: ['plugin::upload.content-api.upload']
  }
]

const PROTECTED_ACTIONS = new Set(['api::auth.auth.me', 'api::auth.auth.updateAccount'])

const CATALOG_ACTIONS = new Set(PERMISSION_CATALOG.flatMap(section => section.actions))

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<RoleInfo[]>('/api/roles', { baseURL, headers })

const roles = computed(() => data.value ?? [])

const selected = ref<Record<string, string[]>>({})

const syncSelected = () => {
  const next: Record<string, string[]> = {}
  for (const role of roles.value) {
    next[role.type] = role.permissions.filter(action => CATALOG_ACTIONS.has(action))
  }
  selected.value = next
}

watch(roles, syncSelected, { immediate: true })

const ADMIN_LOCKED_ACTIONS = new Set([
  'plugin::users-permissions.user.find',
  'plugin::users-permissions.user.findOne',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.user.destroy'
])

const isProtected = (role: RoleInfo, action: string) => PROTECTED_ACTIONS.has(action) || (role.type === 'admin' && ADMIN_LOCKED_ACTIONS.has(action))

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

const actionLabel = (action: string) => {
  const [, , name] = action.split('.')
  const parts = name ? name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)) : [action]
  return parts.join(' ')
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">Roles &amp; permissions</h1>
        <p class="mt-2 max-w-xl text-muted">
          Toggle which content-API actions each role may perform. The essentials (sign-in, account update) are always kept on.
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
              <span class="text-sm text-muted">{{ selectedCount(role.type) }} actions selected</span>
              <UButton icon="i-lucide-save" :loading="saving === role.type" @click="save(role)">Save</UButton>
            </div>
          </div>
        </template>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="section in PERMISSION_CATALOG" :key="section.label">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{{ section.label }}</p>
            <ul class="space-y-1.5">
              <li v-for="action in section.actions" :key="action">
                <label
                  class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-primary/5"
                  :class="isProtected(role, action) ? 'cursor-not-allowed opacity-50' : ''"
                >
                  <UCheckbox
                    :model-value="isChecked(role.type, action)"
                    :disabled="isProtected(role, action)"
                    @update:model-value="toggle(role.type, action)"
                  />
                  <span class="text-highlighted">{{ actionLabel(action) }}</span>
                </label>
              </li>
            </ul>
          </div>
        </div>
      </UCard>
    </div>
  </main>
</template>
