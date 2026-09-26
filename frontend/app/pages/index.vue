<script setup lang="ts">
import type { MapProperty } from '~/types/map'
import { PAMSU_BUILDINGS } from '~/utils/pamsu'

useHead({ title: 'iMapSU | Campus Property Management' })

const auth = useAuth()
const { baseURL, authHeaders } = useStrapi()

const { data: propertiesData } = await useFetch<{ data: MapProperty[] }>('/api/property-spaces', {
  baseURL,
  headers: authHeaders,
  query: { 'fields[0]': 'space_status', 'pagination[pageSize]': 500 }
})

const properties = computed(() => propertiesData.value?.data ?? [])
const vacantCount = computed(() => properties.value.filter(p => p['space_status'] === 'Vacant').length)
const occupiedCount = computed(() => properties.value.filter(p => p['space_status'] === 'Occupied').length)

const features = [
  {
    icon: 'i-lucide-map',
    title: 'Interactive campus map',
    description: 'Explore every property space across the campus and check its current status at a glance.',
    to: '/campus-map',
    cta: 'Explore the map',
    accent: 'bg-maroon-100 text-maroon-800'
  },
  {
    icon: 'i-lucide-key-round',
    title: 'Rental marketplace',
    description: 'Aspiring tenants can browse vacant spaces and apply to rent directly through iMapSU.',
    to: '/properties',
    cta: 'Browse rentals',
    accent: 'bg-gold-100 text-gold-700'
  },
  {
    icon: 'i-lucide-message-square',
    title: 'Student feedback',
    description: 'Students can report and share feedback about stall tenants to keep the campus accountable.',
    to: '/feedback',
    cta: 'Share feedback',
    accent: 'bg-maroon-50 text-maroon-700'
  }
]

const stats = [
  { label: 'Campus buildings', value: PAMSU_BUILDINGS.length, suffix: '' },
  { label: 'Occupied spaces', value: occupiedCount, suffix: '' },
  { label: 'Vacant spaces', value: vacantCount, suffix: '' }
]
</script>

<template>
  <div>
    <section class="relative overflow-hidden">
      <div class="absolute inset-0" style="background-image: linear-gradient(135deg, #380f0c, #7b2b24 55%, #b84034)" />
      <div class="absolute inset-0" style="background-image: radial-gradient(circle at 15% 60%, rgba(230, 181, 58, 0.35), transparent 32%), radial-gradient(circle at 85% 25%, rgba(230, 181, 58, 0.2), transparent 35%)" />
      <div class="absolute inset-x-0 bottom-0 h-px" style="background-image: linear-gradient(90deg, transparent, rgba(230, 181, 58, 0.5), transparent)" />

      <div class="relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
        <div class="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-gold-400/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-200">
          <UIcon name="i-lucide-building-2" class="size-4" />
          PSU&apos;s property management platform
        </div>

        <BrandLogo size="size-20" class="mx-auto mb-6" />

        <h1 class="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          Manage campus property,<br class="hidden sm:block" />
          <span class="bg-gradient-to-r from-gold-300 via-gold-200 to-gold-400 bg-clip-text text-transparent">the simple way.</span>
        </h1>

        <p class="mx-auto mt-5 max-w-2xl text-lg text-white/85">
          iMapSU is PSU&apos;s property management platform — track vacant and occupied spaces, connect tenants with rentals, and gather student feedback in one place.
        </p>

        <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <UButton to="/campus-map" size="lg" label="Navigate the map" icon="i-lucide-navigation" />
          <UButton v-if="!auth.isAuthenticated.value" to="/register" size="lg" color="primary" variant="subtle" label="Create an account" />
          <UButton v-else to="/account" size="lg" color="primary" variant="subtle" label="My account" />
        </div>
      </div>
    </section>

    <section class="border-b border-default bg-default/60">
      <div class="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-default sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div v-for="stat in stats" :key="stat.label" class="flex flex-col items-center gap-1 px-6 py-6 text-center">
          <p class="text-3xl font-bold tracking-tight text-highlighted">{{ stat.value }}<span v-if="stat.suffix" class="text-lg text-primary">{{ stat.suffix }}</span></p>
          <p class="text-sm text-muted">{{ stat.label }}</p>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <p class="imapsu-page-eyebrow mb-3">What iMapSU offers</p>
        <h2 class="text-2xl font-bold tracking-tight text-highlighted sm:text-3xl">Everything about campus spaces, in one place</h2>
        <p class="mt-3 text-muted">Whether you are managing stalls, renting a space, or keeping the campus accountable — iMapSU brings it all together.</p>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
        <NuxtLink
          v-for="feature in features"
          :key="feature.title"
          :to="feature.to"
          class="group relative flex flex-col overflow-hidden rounded-2xl border border-default bg-default p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
        >
          <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-700 via-maroon-500 to-gold-500 opacity-60 transition-opacity group-hover:opacity-100" />
          <span class="grid size-12 place-items-center rounded-xl" :class="feature.accent">
            <UIcon :name="feature.icon" class="size-6" />
          </span>
          <h3 class="mt-5 text-lg font-semibold text-highlighted">{{ feature.title }}</h3>
          <p class="mt-2 flex-1 text-sm leading-relaxed text-muted">{{ feature.description }}</p>
          <span class="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            {{ feature.cta }}
            <UIcon name="i-lucide-arrow-right" class="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </NuxtLink>
      </div>
    </section>

    <section class="border-t border-default bg-maroon-50 dark:bg-maroon-950/40">
      <div class="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div class="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p class="imapsu-page-eyebrow mb-3">For the whole campus</p>
            <h2 class="text-2xl font-bold tracking-tight text-highlighted sm:text-3xl">Built for students, tenants, and campus management</h2>
            <p class="mt-3 text-muted">
              Students raise their voices, aspiring tenants find their next space, current tenants manage bills and maintenance, and the property office keeps everything running smoothly.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <UBadge color="primary" variant="subtle" icon="i-lucide-graduation-cap" label="Students" />
              <UBadge color="primary" variant="subtle" icon="i-lucide-key-round" label="Tenants" />
              <UBadge color="secondary" variant="subtle" icon="i-lucide-shield-check" label="Management" />
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div v-for="role in [
              { icon: 'i-lucide-search', title: 'Find a space', text: 'Browse vacant properties and apply to rent in minutes.', accent: 'bg-gold-100 text-gold-700' },
              { icon: 'i-lucide-receipt', title: 'Manage tenancy', text: 'Track bills, submit meter readings, and request maintenance.', accent: 'bg-maroon-100 text-maroon-800' },
              { icon: 'i-lucide-map-pin', title: 'Navigate campus', text: 'Locate buildings and spaces on the interactive campus map.', accent: 'bg-gold-100 text-gold-700' },
              { icon: 'i-lucide-panel-top', title: 'Oversee operations', text: 'Property office dashboard for spaces, applications, and reports.', accent: 'bg-maroon-100 text-maroon-800' }
            ]" :key="role.title" class="rounded-xl border border-default bg-default p-5 shadow-sm">
              <span class="grid size-10 place-items-center rounded-lg" :class="role.accent">
                <UIcon :name="role.icon" class="size-5" />
              </span>
              <p class="mt-3 font-semibold text-highlighted">{{ role.title }}</p>
              <p class="mt-1 text-sm text-muted">{{ role.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="relative overflow-hidden">
      <div class="absolute inset-0" style="background-image: linear-gradient(135deg, #380f0c, #7b2b24 55%, #b84034)" />
      <div class="absolute inset-0" style="background-image: radial-gradient(circle at 85% 30%, rgba(230, 181, 58, 0.25), transparent 40%)" />

      <div class="relative mx-auto max-w-4xl px-6 py-16 text-center sm:py-20">
        <h2 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to see your campus property at a glance?</h2>
        <p class="mx-auto mt-3 max-w-xl text-white/85">Open the map to explore buildings and spaces, or create an account to start applying, managing, and giving back.</p>
        <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <UButton to="/campus-map" size="lg" label="Open the campus map" icon="i-lucide-map-pin" />
          <UButton v-if="!auth.isAuthenticated.value" to="/register" size="lg" label="Get started" class="border border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20" />
          <UButton v-else to="/account" size="lg" label="My account" class="border border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20" />
        </div>
      </div>
    </section>
  </div>
</template>