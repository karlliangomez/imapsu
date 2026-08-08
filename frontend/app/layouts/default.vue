<script setup lang="ts">
const auth = useAuth()
const colorMode = useColorMode()
const route = useRoute()
const { $api, getErrorMessage } = useStrapi()
const toast = useToast()

const isDark = computed(() => colorMode.value === 'dark')
const isStandalonePage = computed(() => ['/login', '/register'].includes(route.path))
const isMapPage = computed(() => route.path === '/campus-map')
const drawerOpen = ref(false)

const accountOpen = useState('account-settings-open', () => false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const savingPassword = ref(false)
const passwordError = ref('')

const openAccountSettings = () => {
  drawerOpen.value = false
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showCurrentPassword.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
  passwordError.value = ''
  accountOpen.value = true
}

const savePassword = async () => {
  passwordError.value = ''
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = 'All fields are required.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New passwords do not match.'
    return
  }
  const check = checkPasswordStrength(newPassword.value)
  if (!check.ok) {
    passwordError.value = `Password must contain ${check.missing.join(', ')}.`
    return
  }
  savingPassword.value = true
  try {
    await $api('/api/auth/account', {
      method: 'PUT',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    toast.add({ title: 'Password updated', color: 'success', icon: 'i-lucide-check-circle' })
    accountOpen.value = false
  } catch (err) {
    passwordError.value = getErrorMessage(err)
  } finally {
    savingPassword.value = false
  }
}

const sidebarCollapsed = ref(false)
onMounted(() => {
  sidebarCollapsed.value = localStorage.getItem('imapsu-sidebar-collapsed') === '1'
})
watch(sidebarCollapsed, (value) => {
  if (import.meta.client) localStorage.setItem('imapsu-sidebar-collapsed', value ? '1' : '0')
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function closeDrawer() {
  drawerOpen.value = false
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const userItems = computed(() => {
  const items: Record<string, unknown>[] = [
    {
      type: 'label',
      label: auth.displayName.value,
      avatar: {
        src: auth.avatarUrl.value ?? undefined,
        text: (auth.displayName.value ?? '?').charAt(0).toUpperCase()
      }
    },
    {
      label: 'Account settings',
      icon: 'i-lucide-settings',
      onSelect: openAccountSettings
    },
    {
      label: 'My account',
      icon: 'i-lucide-user',
      onSelect: () => navigateTo('/account')
    }
  ]

  items.push({ type: 'separator' })
  items.push({
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: () => {
      auth.logout()
      navigateTo('/')
    }
  })

  return [items]
})
</script>

<template>
  <div class="imapsu-page-bg min-h-screen">
    <div class="flex items-stretch">
      <aside
        v-if="!isStandalonePage && !isMapPage"
        class="sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-maroon-950 bg-gradient-to-b from-maroon-800 to-maroon-900 transition-[width] duration-200 ease-in-out lg:flex"
        :class="sidebarCollapsed ? 'w-16' : 'w-64'"
      >
        <div class="flex items-center justify-between gap-2 border-b border-maroon-950/60 px-3 py-4">
          <div class="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <BrandLogo size="size-11" />
            <div v-if="!sidebarCollapsed" class="min-w-0">
              <p class="truncate font-semibold tracking-tight text-white">iMapSU</p>
              <p class="truncate text-xs text-maroon-200">Campus property management</p>
            </div>
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-lg text-maroon-100 transition-colors hover:bg-white/10 hover:text-white"
            :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="toggleSidebar"
          >
            <UIcon :name="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-4" />
          </button>
        </div>

        <div class="imapsu-scrollbar-maroon flex-1 overflow-y-auto px-3 py-4">
          <NavContent :collapsed="sidebarCollapsed" />
        </div>

        <div v-if="auth.isAuthenticated.value" class="border-t border-maroon-950/60 px-3 py-3">
          <div v-if="!sidebarCollapsed" class="space-y-3">
            <div class="flex items-center gap-3">
              <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="sm" />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">{{ auth.displayName.value }}</p>
                <p v-if="auth.user.value?.email" class="truncate text-xs text-maroon-200">{{ auth.user.value.email }}</p>
              </div>
            </div>
            <UButton block variant="subtle" color="error" icon="i-lucide-log-out" label="Sign out" @click="auth.logout(); navigateTo('/')" />
          </div>
          <div v-else class="flex flex-col items-center gap-3">
            <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="sm" :title="auth.displayName.value" />
            <UButton square variant="ghost" color="error" icon="i-lucide-log-out" aria-label="Sign out" :title="'Sign out'" class="text-maroon-100 hover:bg-white/10 hover:text-white" @click="auth.logout(); navigateTo('/')" />
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <header v-if="!isStandalonePage" class="sticky top-0 z-40 border-b border-default bg-default/85 backdrop-blur">
          <div class="imapsu-brand-bar h-1" />
          <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div class="flex items-center gap-2">
              <UButton v-if="!isStandalonePage" :class="isMapPage ? '' : 'lg:hidden'" color="neutral" variant="ghost" square icon="i-lucide-menu" :aria-label="'Open navigation'" @click="drawerOpen = true" />
              <NuxtLink to="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
                <BrandLogo size="size-10" />
                <span class="text-primary dark:text-secondary">iMapSU</span>
              </NuxtLink>
            </div>

            <div class="flex items-center gap-2">
              <UButton color="neutral" variant="ghost" square :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleColorMode" />
              <NotificationBell />
              <template v-if="auth.isAuthenticated.value">
                <UDropdownMenu :items="userItems">
                  <UButton color="neutral" variant="ghost" :label="auth.user.value?.username" trailing-icon="i-lucide-chevron-down" />
                </UDropdownMenu>
              </template>
              <template v-else>
                <UButton to="/login" color="neutral" variant="ghost" label="Sign in" />
                <UButton to="/register" label="Get started" />
              </template>
            </div>
          </div>
        </header>

        <main class="min-w-0">
          <slot />
        </main>
      </div>
    </div>

    <UDrawer v-if="!isStandalonePage" v-model:open="drawerOpen" direction="left" :ui="{ content: 'w-80 max-w-[85vw] bg-gradient-to-b from-maroon-800 to-maroon-900 bg-maroon-800! ring-maroon-950!', handle: '!bg-gold-400' }">
      <template #header>
        <div class="flex items-center gap-2.5">
          <BrandLogo size="size-11" />
          <div>
            <p class="font-semibold tracking-tight text-white">iMapSU</p>
            <p class="text-xs text-gold-200">Campus property management</p>
          </div>
        </div>
      </template>

      <template #body>
        <div class="imapsu-scrollbar-maroon -mx-3 px-3">
          <NavContent :on-navigate="closeDrawer" />
        </div>
      </template>

      <template #footer>
        <div v-if="auth.isAuthenticated.value" class="space-y-3">
          <div class="flex items-center gap-3">
            <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="sm" />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-white">{{ auth.displayName.value }}</p>
              <p v-if="auth.user.value?.email" class="truncate text-xs text-maroon-200">{{ auth.user.value.email }}</p>
            </div>
          </div>
          <UButton block variant="subtle" color="error" icon="i-lucide-log-out" label="Sign out" @click="closeDrawer; auth.logout(); navigateTo('/')" />
        </div>
      </template>
    </UDrawer>

    <UModal v-model:open="accountOpen" class="max-w-xl" title="Account settings" description="Update your password. Username and email are managed by an administrator.">
      <template #body>
        <form class="space-y-4" @submit.prevent="savePassword">
          <div class="rounded-lg border border-default bg-muted/20 px-4 py-3 text-sm">
            <p class="font-medium text-highlighted">{{ auth.user.value?.username }}</p>
            <p class="text-muted">{{ auth.user.value?.email }}</p>
          </div>

          <UFormField label="Current password" name="currentPassword" required>
            <UInput v-model="currentPassword" :type="showCurrentPassword ? 'text' : 'password'" autocomplete="current-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showCurrentPassword ? 'Hide password' : 'Show password'" @click="showCurrentPassword = !showCurrentPassword">
                  <UIcon :name="showCurrentPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="New password" name="newPassword" required>
              <UInput v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" autocomplete="new-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
                <template #trailing>
                  <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showNewPassword ? 'Hide password' : 'Show password'" @click="showNewPassword = !showNewPassword">
                    <UIcon :name="showNewPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                  </button>
                </template>
              </UInput>
            </UFormField>
            <UFormField label="Confirm new password" name="confirmPassword" required>
              <UInput v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" autocomplete="new-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
                <template #trailing>
                  <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                    <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                  </button>
                </template>
              </UInput>
            </UFormField>
          </div>

          <UAlert v-if="passwordError" color="error" icon="i-lucide-circle-alert" :description="passwordError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="savingPassword" @click="accountOpen = false" />
            <UButton type="submit" :loading="savingPassword">Update password</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
