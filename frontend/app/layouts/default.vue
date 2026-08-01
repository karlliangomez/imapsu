<script setup lang="ts">
const auth = useAuth()
const colorMode = useColorMode()

const isDark = computed(() => colorMode.value === 'dark')
const drawerOpen = ref(false)

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function closeDrawer() {
  drawerOpen.value = false
}

type NavLink = { label: string; icon: string; to: string }

const generalLinks: NavLink[] = [
  { label: 'Home', icon: 'i-lucide-home', to: '/' },
  { label: 'Announcements', icon: 'i-lucide-megaphone', to: '/announcements' }
]

const roleLinks = computed<{ label: string; links: NavLink[] }[]>(() => {
  const sections: { label: string; links: NavLink[] }[] = []

  if (auth.isAuthenticated.value) {
    sections.push({
      label: 'Explore',
      links: [{ label: 'Properties', icon: 'i-lucide-building-2', to: '/properties' }]
    })
  }

  if (auth.isStudent.value) {
    sections.push({
      label: 'Student',
      links: [{ label: 'Feedback', icon: 'i-lucide-message-square', to: '/feedback' }]
    })
  }

  if (auth.isAspiringTenant.value) {
    sections.push({
      label: 'Aspiring tenant',
      links: [{ label: 'Rental applications', icon: 'i-lucide-file-text', to: '/rental-applications' }]
    })
  }

  if (auth.isCurrentTenant.value) {
    sections.push({
      label: 'Current tenant',
      links: [
        { label: 'My tenancy', icon: 'i-lucide-home', to: '/tenancy' },
        { label: 'Bills', icon: 'i-lucide-receipt', to: '/bills' },
        { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/maintenance' }
      ]
    })
  }

  if (auth.isStaff.value) {
    sections.push({
      label: 'Management',
      links: [
        { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
        { label: 'Announcements', icon: 'i-lucide-megaphone', to: '/admin/announcements' },
        { label: 'Properties', icon: 'i-lucide-building-2', to: '/admin/properties' },
        { label: 'Rental applications', icon: 'i-lucide-file-text', to: '/admin/applications' },
        { label: 'Tenancies', icon: 'i-lucide-key-round', to: '/admin/tenancies' },
        { label: 'Bills', icon: 'i-lucide-receipt', to: '/admin/bills' },
        { label: 'Users', icon: 'i-lucide-users', to: '/admin/users' }
      ]
    })
  }

  return sections
})

const userItems = computed(() => {
  const items: Record<string, unknown>[] = [
    {
      label: 'Account',
      icon: 'i-lucide-user',
      onSelect: () => navigateTo('/account')
    }
  ]

  if (auth.isStaff.value) {
    items.push({
      label: 'Management',
      icon: 'i-lucide-layout-dashboard',
      onSelect: () => navigateTo('/admin')
    })
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: () => {
      auth.logout()
      navigateTo('/')
    }
  })

  return [
    {
      label: auth.user.value?.username ?? 'Account',
      avatar: {
        label: (auth.user.value?.username ?? '?').charAt(0).toUpperCase()
      },
      items
    }
  ]
})
</script>

<template>
  <div class="min-h-screen bg-muted/30">
    <header class="sticky top-0 z-40 border-b border-default bg-default/85 backdrop-blur">
      <div class="imapsu-brand-bar h-1" />
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="ghost" square icon="i-lucide-menu" :aria-label="'Open navigation'" @click="drawerOpen = true" />
          <NuxtLink to="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
            <span class="imapsu-brand-tile grid size-8 place-items-center rounded-lg shadow-sm">
              <UIcon name="i-lucide-map" class="size-4" />
            </span>
            <span class="text-primary dark:text-secondary">iMapSU</span>
          </NuxtLink>
        </div>

        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="ghost" square :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleColorMode" />
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

    <UDrawer v-model:open="drawerOpen" direction="left" :ui="{ content: 'w-80 max-w-[85vw]' }">
      <template #header>
        <div class="flex items-center gap-2.5">
          <span class="imapsu-brand-tile grid size-9 place-items-center rounded-lg shadow-sm">
            <UIcon name="i-lucide-map" class="size-5" />
          </span>
          <div>
            <p class="font-semibold tracking-tight text-highlighted">iMapSU</p>
            <p class="text-xs text-muted">Campus property management</p>
          </div>
        </div>
      </template>

      <template #body>
        <div class="space-y-6">
          <div>
            <p class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">General</p>
            <div class="space-y-0.5">
              <NuxtLink v-for="link in generalLinks" :key="link.to" :to="link.to" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-toned transition-colors hover:bg-muted/60 hover:text-highlighted" :class="$route.path === link.to && 'bg-muted/60 text-highlighted'" @click="closeDrawer">
                <UIcon :name="link.icon" class="size-4.5 text-primary" />
                {{ link.label }}
              </NuxtLink>
            </div>
          </div>

          <template v-if="!auth.isAuthenticated.value">
            <div>
              <p class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">Account</p>
              <div class="space-y-0.5">
                <NuxtLink to="/properties" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-toned transition-colors hover:bg-muted/60 hover:text-highlighted" @click="closeDrawer">
                  <UIcon name="i-lucide-building-2" class="size-4.5 text-primary" />
                  Properties
                </NuxtLink>
                <NuxtLink to="/login" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-toned transition-colors hover:bg-muted/60 hover:text-highlighted" @click="closeDrawer">
                  <UIcon name="i-lucide-log-in" class="size-4.5 text-primary" />
                  Sign in
                </NuxtLink>
                <NuxtLink to="/register" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-toned transition-colors hover:bg-muted/60 hover:text-highlighted" @click="closeDrawer">
                  <UIcon name="i-lucide-user-plus" class="size-4.5 text-primary" />
                  Create account
                </NuxtLink>
              </div>
            </div>
          </template>

          <div v-for="section in roleLinks" :key="section.label">
            <p class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{{ section.label }}</p>
            <div class="space-y-0.5">
              <NuxtLink v-for="link in section.links" :key="link.to" :to="link.to" class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-toned transition-colors hover:bg-muted/60 hover:text-highlighted" :class="$route.path === link.to && 'bg-muted/60 text-highlighted'" @click="closeDrawer">
                <UIcon :name="link.icon" class="size-4.5 text-primary" />
                {{ link.label }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div v-if="auth.isAuthenticated.value" class="space-y-3">
          <div class="flex items-center gap-3">
            <UAvatar :label="(auth.user.value?.username ?? '?').charAt(0).toUpperCase()" :alt="auth.user.value?.username" size="sm" />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-highlighted">{{ auth.user.value?.username }}</p>
              <p v-if="auth.user.value?.email" class="truncate text-xs text-muted">{{ auth.user.value.email }}</p>
            </div>
          </div>
          <UButton block variant="subtle" color="error" icon="i-lucide-log-out" label="Sign out" @click="closeDrawer; auth.logout(); navigateTo('/')" />
        </div>
      </template>
    </UDrawer>

    <main>
      <slot />
    </main>
  </div>
</template>
