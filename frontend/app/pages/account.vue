<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

useHead({ title: 'My account | iMapSU' })

const auth = useAuth()
const user = auth.user.value

const roleLabel = computed(() => {
  switch (auth.role.value) {
    case 'student':
      return 'Student'
    case 'aspiring-tenant':
      return 'Aspiring Tenant'
    case 'current-tenant':
      return 'Current Tenant'
    case 'oas':
      return 'Office of Auxiliary Services'
    case 'admin':
      return 'Administrator'
    default:
      return 'Member'
  }
})

const roleColor = computed(() => {
  switch (auth.role.value) {
    case 'student':
      return 'neutral'
    case 'aspiring-tenant':
      return 'secondary'
    case 'current-tenant':
      return 'primary'
    case 'oas':
      return 'warning'
    case 'admin':
      return 'primary'
    default:
      return 'neutral'
  }
})

const upcomingFeatures = computed(() => {
  const features: { icon: string; title: string; description: string; to?: string }[] = []

  features.push({ icon: 'i-lucide-map', title: 'Interactive map', description: 'Browse campus spaces and their current status.' })
  features.push({ icon: 'i-lucide-bell', title: 'Announcements', description: 'Stay updated with campus announcements.', to: '/announcements' })

  if (auth.isAspiringTenant.value) {
    features.push({ icon: 'i-lucide-file-text', title: 'Rental applications', description: 'Apply to rent a vacant space and track your applications.', to: '/rental-applications' })
  }

  if (auth.isCurrentTenant.value) {
    features.push({ icon: 'i-lucide-receipt', title: 'Bills', description: 'View the bills attached to your tenancy.', to: '/bills' })
    features.push({ icon: 'i-lucide-wrench', title: 'Maintenance', description: 'Report issues and track your maintenance tickets.', to: '/maintenance' })
    features.push({ icon: 'i-lucide-home', title: 'My tenancy', description: 'Review your tenancy contract details.', to: '/tenancy' })
  }

  if (auth.isStudent.value) {
    features.push({ icon: 'i-lucide-message-square', title: 'Feedback', description: 'Share feedback about stall tenants.', to: '/feedback' })
  }

  return features
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Your account</p>
        <h1 class="imapsu-page-heading">My account</h1>
        <p class="mt-2 max-w-xl text-muted">Manage your iMapSU profile and access role-specific features.</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Profile</h2>
        </template>

        <dl class="space-y-4 text-sm">
          <div>
            <dt class="mb-1 text-xs text-muted">Username</dt>
            <dd class="font-medium text-highlighted">{{ user?.username }}</dd>
          </div>
          <div>
            <dt class="mb-1 text-xs text-muted">Email</dt>
            <dd class="font-medium text-highlighted">{{ user?.email }}</dd>
          </div>
          <div>
            <dt class="mb-1 text-xs text-muted">Role</dt>
            <dd>
              <UBadge :color="roleColor" variant="subtle">{{ roleLabel }}</UBadge>
            </dd>
          </div>
        </dl>
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Available features</h2>
        </template>

        <div class="grid gap-4 sm:grid-cols-2">
          <NuxtLink
            v-for="feature in upcomingFeatures"
            :key="feature.title"
            :to="feature.to"
            class="group rounded-lg border border-default bg-muted/20 p-4 transition-colors"
            :class="feature.to ? 'hover:border-primary/40 hover:bg-primary/5' : 'cursor-default'"
          >
            <UIcon :name="feature.icon" class="mb-3 size-5 text-primary" />
            <h3 class="flex items-center gap-1.5 font-medium text-highlighted">
              {{ feature.title }}
              <UIcon v-if="feature.to" name="i-lucide-arrow-right" class="size-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
            </h3>
            <p class="mt-1 text-sm text-muted">{{ feature.description }}</p>
          </NuxtLink>
        </div>
      </UCard>
    </div>
  </div>
</template>
