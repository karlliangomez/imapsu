<script setup lang="ts">
useHead({ title: 'Sign in | iMapSU' })

const auth = useAuth()
const toast = useToast()

const identifier = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  try {
    await auth.login(identifier.value, password.value)
    toast.add({ title: 'Welcome back', description: `Signed in as ${auth.user.value?.username}`, color: 'success', icon: 'i-lucide-check-circle' })
    await navigateTo('/')
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    toast.add({ title: 'Sign in failed', description: message ?? 'Check your credentials and try again.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative overflow-hidden">
    <div class="absolute inset-0" style="background-image: linear-gradient(135deg, #380f0c, #7b2b24 55%, #b84034)" />
    <div class="absolute inset-0" style="background-image: radial-gradient(circle at 15% 60%, rgba(230, 181, 58, 0.35), transparent 32%), radial-gradient(circle at 85% 25%, rgba(230, 181, 58, 0.2), transparent 35%)" />

    <div class="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <UCard :ui="{ root: 'shadow-2xl ring-1 ring-maroon-950/10', header: 'px-6 pb-4 pt-8 sm:px-8', body: 'px-6 pb-6 sm:px-8', footer: 'px-6 pb-8 sm:px-8' }">
        <template #header>
          <div class="flex flex-col items-center text-center">
            <BrandLogo size="size-16" />
            <h1 class="mt-4 text-2xl font-bold tracking-tight text-highlighted">Sign in to iMapSU</h1>
            <p class="mt-1 text-sm text-muted">Welcome back — access your campus account.</p>
          </div>
        </template>

        <form class="space-y-5" @submit.prevent="handleLogin">
          <UFormField label="Email or username" name="identifier" required>
            <UInput v-model="identifier" type="text" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="username" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput v-model="password" :type="showPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="current-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                  <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UButton type="submit" block size="lg" icon="i-lucide-log-in" :loading="loading">
            Sign in
          </UButton>
        </form>

        <template #footer>
          <div class="space-y-3">
            <p class="text-center text-sm text-muted">
              No account yet?
              <NuxtLink to="/register" class="font-medium text-primary hover:underline">Create one</NuxtLink>
            </p>
            <div class="flex items-center justify-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-arrow-left" class="size-3.5" />
              <NuxtLink to="/" class="font-medium text-primary hover:underline">Back to home</NuxtLink>
            </div>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>
