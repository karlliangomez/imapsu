<script setup lang="ts">
const props = withDefaults(defineProps<{ collapsed?: boolean; onNavigate?: () => void }>(), {
  collapsed: false
})

const auth = useAuth()
const route = useRoute()

type NavLink = { label: string; icon: string; to: string }

const generalLinks = computed<NavLink[]>(() => {
  const links: NavLink[] = [
    { label: 'Home', icon: 'i-lucide-home', to: '/' },
    { label: 'Campus Map', icon: 'i-lucide-map', to: '/campus-map' }
  ]
  if (!auth.isStaff.value) {
    links.push({ label: 'Announcements', icon: 'i-lucide-megaphone', to: '/announcements' })
  }
  return links
})

const roleLinks = computed<{ label: string; links: NavLink[] }[]>(() => {
  const sections: { label: string; links: NavLink[] }[] = []

  if (auth.isAuthenticated.value && !auth.isStaff.value) {
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
        { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/maintenance' },
        { label: 'Feedback', icon: 'i-lucide-message-square', to: '/feedback' }
      ]
    })
  }

  if (auth.isOas.value) {
    sections.push({
      label: 'Management',
      links: [
        { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
        { label: 'Announcements', icon: 'i-lucide-megaphone', to: '/admin/announcements' },
        { label: 'Properties', icon: 'i-lucide-building-2', to: '/admin/properties' },
        { label: 'Rental applications', icon: 'i-lucide-file-text', to: '/admin/applications' },
        { label: 'Tenancies', icon: 'i-lucide-key-round', to: '/admin/tenancies' },
        { label: 'Bills', icon: 'i-lucide-receipt', to: '/admin/bills' },
        { label: 'Meter readings', icon: 'i-lucide-gauge', to: '/admin/meter-readings' },
        { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/admin/maintenance' },
        { label: 'Feedback', icon: 'i-lucide-message-square', to: '/admin/feedback' }
      ]
    })
  }

  if (auth.isAdmin.value) {
    sections.push({
      label: 'Administration',
      links: [
        { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
        { label: 'Users', icon: 'i-lucide-users', to: '/admin/users' },
        { label: 'Roles & permissions', icon: 'i-lucide-shield-check', to: '/admin/roles' },
        { label: 'Audit logs', icon: 'i-lucide-scroll-text', to: '/admin/audit-logs' },
        { label: 'System monitoring', icon: 'i-lucide-activity', to: '/admin/system-monitoring' },
        { label: 'System settings', icon: 'i-lucide-settings', to: '/admin/system-settings' },
        { label: 'Database backups', icon: 'i-lucide-database-backup', to: '/admin/backups' }
      ]
    })
  }

  return sections
})

const linkClasses = (to: string) => [
  'imapsu-nav-link flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
  props.collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
  route.path === to ? 'is-active' : ''
]

const iconClasses = () => ['imapsu-nav-icon size-4.5']
</script>

<template>
  <div class="space-y-6">
    <div>
      <p v-if="!collapsed" class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-maroon-200">General</p>
      <div class="space-y-0.5">
        <NuxtLink v-for="link in generalLinks" :key="link.to" :to="link.to" :class="linkClasses(link.to)" :title="collapsed ? link.label : undefined" @click="onNavigate?.()">
          <UIcon :name="link.icon" :class="iconClasses(link.to)" />
          <span v-if="!collapsed">{{ link.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <div v-for="section in roleLinks" :key="section.label">
      <p v-if="!collapsed" class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-maroon-200">{{ section.label }}</p>
      <div class="space-y-0.5">
        <NuxtLink v-for="link in section.links" :key="link.to" :to="link.to" :class="linkClasses(link.to)" :title="collapsed ? link.label : undefined" @click="onNavigate?.()">
          <UIcon :name="link.icon" :class="iconClasses(link.to)" />
          <span v-if="!collapsed">{{ link.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
