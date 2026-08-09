<script setup lang="ts">
useHead({ title: 'iMapSU | Campus Property Management' })

const auth = useAuth()

const features = [
  {
    icon: 'i-lucide-map',
    title: 'Interactive campus map',
    description: 'Explore every property space across the campus and check its current status at a glance.'
  },
  {
    icon: 'i-lucide-key-round',
    title: 'Rental marketplace',
    description: 'Aspiring tenants can browse vacant spaces and apply to rent directly through iMapSU.'
  },
  {
    icon: 'i-lucide-message-square',
    title: 'Student feedback',
    description: 'Students can report and share feedback about stall tenants to keep the campus accountable.'
  }
]
</script>

<template>
  <div>
    <section class="relative overflow-hidden">
      <div class="absolute inset-0" style="background-image: linear-gradient(135deg, #380f0c, #7b2b24 55%, #b84034)" />
      <div class="absolute inset-0" style="background-image: radial-gradient(circle at 15% 60%, rgba(230, 181, 58, 0.35), transparent 32%), radial-gradient(circle at 85% 25%, rgba(230, 181, 58, 0.2), transparent 35%)" />

      <div class="relative mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <BrandLogo size="size-20" class="mx-auto mb-6" />

        <h1 class="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          Manage campus property,<br class="hidden sm:block" /> the simple way.
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

    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-6 md:grid-cols-3">
        <UCard v-for="feature in features" :key="feature.title" class="border-t-4 border-t-gold-400">
          <UIcon :name="feature.icon" class="mb-4 size-6 text-primary" />
          <h2 class="text-lg font-semibold text-highlighted">{{ feature.title }}</h2>
          <p class="mt-2 text-sm text-muted">{{ feature.description }}</p>
        </UCard>
      </div>
    </section>
  </div>
</template>
