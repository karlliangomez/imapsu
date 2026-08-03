<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type DirectoryUser = {
  id: number
  documentId?: string
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  createdAt?: string
  role?: { documentId?: string; name?: string; type?: string } | null
}

useHead({ title: 'Manage users | iMapSU' })

const ROLE_DOC_IDS: Record<string, string> = {
  student: 'lfabw04fhi1fe91oh0heewup',
  'aspiring-tenant': 'y3b72vs2uj2bc0792pwjzdy4',
  'current-tenant': 'p0qt6v81dq4lzt614uqti8lp',
  oas: 'mtovgm1t97h0mr65bs9j9enq',
  admin: 'pi0zscur9v46kb1fe88fksoc'
}

const ROLE_OPTIONS = [
  { label: 'Student', value: 'student' },
  { label: 'Aspiring Tenant', value: 'aspiring-tenant' },
  { label: 'Current Tenant', value: 'current-tenant' },
  { label: 'OAS', value: 'oas' },
  { label: 'Administrator', value: 'admin' }
]

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<DirectoryUser[]>('/api/user-directory', {
  baseURL,
  headers
})

const users = computed(() => data.value ?? [])

const isSelf = (user: DirectoryUser) => user.id === auth.user.value?.id

const roleLabel = (type?: string) => ROLE_OPTIONS.find(option => option.value === type)?.label ?? type ?? '—'

const roleColor = (type?: string) => {
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

const updating = ref<number | null>(null)

const changeRole = async (user: DirectoryUser, type: string) => {
  if (!ROLE_DOC_IDS[type]) return
  updating.value = user.id
  try {
    await $api(`/api/users/${user.id}`, {
      method: 'PUT',
      body: { role: ROLE_DOC_IDS[type] }
    })
    toast.add({ title: 'Role updated', description: `${user.username} is now ${roleLabel(type)}.`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update role', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    updating.value = null
  }
}

const remove = async (user: DirectoryUser) => {
  if (!confirm(`Delete user "${user.username}" (${user.email})? This cannot be undone.`)) return
  try {
    await $api(`/api/users/${user.id}`, { method: 'DELETE' })
    toast.add({ title: 'User deleted', description: user.username, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete user', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Management</p>
        <h1 class="imapsu-page-heading">Users</h1>
        <p class="mt-2 max-w-xl text-muted">
          {{ auth.isAdmin.value ? 'Assign roles and remove accounts. Role changes are limited to Administrators.' : 'Read-only directory of registered users.' }}
        </p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div v-if="status === 'pending'" class="space-y-3">
      <USkeleton v-for="index in 8" :key="index" class="h-16 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load users" :description="error.message" />

    <UEmpty v-else-if="users.length === 0" icon="i-lucide-users" title="No users found" description="Registered users will appear here." />

    <div v-else class="space-y-3">
      <UCard v-for="user in users" :key="user.id" :ui="{ body: 'p-4' }">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="imapsu-brand-tile grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold">{{ user.username.charAt(0).toUpperCase() }}</span>
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">
                {{ user.username }}
                <span v-if="isSelf(user)" class="ml-1 text-xs text-muted">(you)</span>
              </p>
              <p class="truncate text-sm text-muted">{{ user.email }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <UBadge :color="roleColor(user.role?.type)" variant="subtle">{{ roleLabel(user.role?.type) }}</UBadge>

            <USelect
              v-if="auth.isAdmin.value"
              :model-value="user.role?.type"
              :items="ROLE_OPTIONS"
              :disabled="updating === user.id || isSelf(user)"
              class="w-44"
              @update:model-value="(value: unknown) => value && changeRole(user, String(value))"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              label="Delete"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              @click="remove(user)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </main>
</template>
