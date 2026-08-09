<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
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

useHead({ title: 'Manage Users | iMapSU' })

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
const saving = ref(false)
const editOpen = ref(false)
const editUser = ref<DirectoryUser | null>(null)
const editUsername = ref('')
const editEmail = ref('')
const editError = ref('')

const openEdit = (user: DirectoryUser) => {
  editUser.value = user
  editUsername.value = user.username
  editEmail.value = user.email
  editError.value = ''
  editOpen.value = true
}

const saveEdit = async () => {
  if (!editUser.value) return
  editError.value = ''
  if (!editUsername.value.trim() || !editEmail.value.trim()) {
    editError.value = 'Username and email are required.'
    return
  }
  saving.value = true
  try {
    await $api(`/api/auth/user/${editUser.value.id}`, {
      method: 'PUT',
      body: { username: editUsername.value, email: editEmail.value }
    })
    toast.add({ title: 'User updated', description: editUsername.value, color: 'success', icon: 'i-lucide-check-circle' })
    editOpen.value = false
    await refresh()
  } catch (err) {
    editError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const changeRole = async (user: DirectoryUser, type: string) => {
  if (!ROLE_DOC_IDS[type]) return
  updating.value = user.id
  try {
    await $api(`/api/auth/user/${user.id}`, {
      method: 'PUT',
      body: { role: type }
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
    await $api(`/api/auth/user/${user.id}`, { method: 'DELETE' })
    toast.add({ title: 'User deleted', description: user.username, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not delete user', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const createOpen = ref(false)
const createUsername = ref('')
const createEmail = ref('')
const createPassword = ref('')
const createRole = ref('student')
const createError = ref('')
const creating = ref(false)

const openCreate = () => {
  createUsername.value = ''
  createEmail.value = ''
  createPassword.value = ''
  createRole.value = 'student'
  createError.value = ''
  createOpen.value = true
}

const createUser = async () => {
  createError.value = ''
  if (!createUsername.value.trim() || !createEmail.value.trim() || !createPassword.value) {
    createError.value = 'Username, email and password are required.'
    return
  }
  creating.value = true
  try {
    await $api('/api/auth/create-user', {
      method: 'POST',
      body: {
        username: createUsername.value,
        email: createEmail.value,
        password: createPassword.value,
        role: createRole.value
      }
    })
    toast.add({ title: 'Account created', description: createUsername.value, color: 'success', icon: 'i-lucide-check-circle' })
    createOpen.value = false
    await refresh()
  } catch (err) {
    createError.value = getErrorMessage(err)
  } finally {
    creating.value = false
  }
}

const resetOpen = ref(false)
const resetUser = ref<DirectoryUser | null>(null)
const resetPassword = ref('')
const resetError = ref('')
const resetting = ref(false)

const openReset = (user: DirectoryUser) => {
  resetUser.value = user
  resetPassword.value = ''
  resetError.value = ''
  resetOpen.value = true
}

const submitReset = async () => {
  if (!resetUser.value) return
  resetError.value = ''
  if (!resetPassword.value) {
    resetError.value = 'Please provide a new password.'
    return
  }
  resetting.value = true
  try {
    await $api(`/api/auth/user/${resetUser.value.id}/reset-password`, {
      method: 'POST',
      body: { password: resetPassword.value }
    })
    toast.add({ title: 'Password reset', description: resetUser.value.username, color: 'success', icon: 'i-lucide-check-circle' })
    resetOpen.value = false
  } catch (err) {
    resetError.value = getErrorMessage(err)
  } finally {
    resetting.value = false
  }
}

const toggling = ref<number | null>(null)

const toggleActive = async (user: DirectoryUser) => {
  const next = user.blocked ? 'activate' : 'deactivate'
  if (!confirm(`Are you sure you want to ${next} "${user.username}"?`)) return
  toggling.value = user.id
  try {
    await $api(`/api/auth/user/${user.id}/${next}`, { method: 'POST' })
    toast.add({
      title: next === 'activate' ? 'Account activated' : 'Account deactivated',
      description: user.username,
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Could not update account', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    toggling.value = null
  }
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Administration</p>
        <h1 class="imapsu-page-heading">Users</h1>
        <p class="mt-2 max-w-xl text-muted">
          Create, inspect and manage accounts. Administrators can change roles, reset passwords, and activate or deactivate accounts.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton v-if="auth.isAdmin.value" label="Create user" icon="i-lucide-user-plus" @click="openCreate" />
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
      </div>
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
                <UBadge v-if="user.blocked" color="error" variant="subtle" class="ml-1">Deactivated</UBadge>
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
              label="Edit"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openEdit(user)"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              label="Reset password"
              icon="i-lucide-key-round"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openReset(user)"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              :label="user.blocked ? 'Activate' : 'Deactivate'"
              :icon="user.blocked ? 'i-lucide-circle-check' : 'i-lucide-circle-slash'"
              :color="user.blocked ? 'success' : 'warning'"
              variant="ghost"
              size="sm"
              :loading="toggling === user.id"
              @click="toggleActive(user)"
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

    <UModal v-model:open="createOpen" class="max-w-2xl" title="Create account" description="Provision a new account. New passwords must satisfy the configured password policy.">
      <template #body>
        <form class="space-y-4" @submit.prevent="createUser">
          <UFormField label="Username" required>
            <UInput v-model="createUsername" type="text" autocomplete="off" :disabled="creating" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput v-model="createEmail" type="email" autocomplete="off" :disabled="creating" />
          </UFormField>

          <UFormField label="Password" required>
            <UInput v-model="createPassword" type="password" autocomplete="new-password" :disabled="creating" />
          </UFormField>

          <UFormField label="Role" required>
            <USelect v-model="createRole" :items="ROLE_OPTIONS" :disabled="creating" />
          </UFormField>

          <UAlert v-if="createError" color="error" icon="i-lucide-circle-alert" :description="createError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="creating" @click="createOpen = false" />
            <UButton type="submit" :loading="creating">Create account</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="resetOpen" class="max-w-xl" title="Reset password" :description="resetUser ? `Set a new password for ${resetUser.username}.` : ''">
      <template #body>
        <form class="space-y-4" @submit.prevent="submitReset">
          <UFormField label="New password" required>
            <UInput v-model="resetPassword" type="password" autocomplete="new-password" :disabled="resetting" />
          </UFormField>

          <UAlert v-if="resetError" color="error" icon="i-lucide-circle-alert" :description="resetError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="resetting" @click="resetOpen = false" />
            <UButton type="submit" :loading="resetting">Reset password</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="editOpen" class="max-w-2xl" title="Edit user" :description="editUser ? `Update ${editUser.username}'s account details.` : ''">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveEdit">
          <UFormField label="Username" required>
            <UInput v-model="editUsername" type="text" autocomplete="off" :disabled="saving" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput v-model="editEmail" type="email" autocomplete="off" :disabled="saving" />
          </UFormField>

          <UAlert v-if="editError" color="error" icon="i-lucide-circle-alert" :description="editError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="editOpen = false" />
            <UButton type="submit" :loading="saving">Save changes</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
