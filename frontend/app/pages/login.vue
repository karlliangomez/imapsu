<script setup lang="ts">
useHead({ title: 'Sign in | iMapSU' })

const auth = useAuth()
const toast = useToast()
const route = useRoute()

const identifier = ref('')
const password = ref('')
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  try {
    await auth.login(identifier.value, password.value)
    toast.add({ title: 'Welcome back', description: `Signed in as ${auth.user.value?.username}`, color: 'success', icon: 'i-lucide-check-circle' })
    await navigateTo((route.query.redirect as string) || '/account')
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    toast.add({ title: 'Sign in failed', description: message ?? 'Check your credentials and try again.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
    <UCard>
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-map" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Sign in</h1>
          <p class="mt-1 text-sm text-muted">Welcome back — access your iMapSU account.</p>
        </div>
      </template>

      <form class="space-y-5" @submit.prevent="handleLogin">
        <UFormField label="Email or username" name="identifier" required>
          <UInput v-model="identifier" type="text" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="username" size="lg" :disabled="loading" autofocus />
        </UFormField>

        <UFormField label="Password" name="password" required>
          <UInput v-model="password" type="password" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="current-password" size="lg" :disabled="loading" />
        </UFormField>

        <UButton type="submit" block size="lg" :loading="loading">
          Sign in
        </UButton>
      </form>

      <template #footer>
        <p class="text-center text-sm text-muted">
          No account yet?
          <NuxtLink to="/register" class="font-medium text-primary hover:underline">Create one</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
