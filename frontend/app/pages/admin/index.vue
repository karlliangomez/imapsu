<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

useHead({ title: 'Dashboard | iMapSU' })

const auth = useAuth()
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <AdminDashboard v-if="auth.isAdmin.value" />
    <OasDashboard v-else />
  </main>
</template>
