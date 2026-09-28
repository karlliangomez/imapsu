<script setup lang="ts">
import type { User } from '~/types/auth'

definePageMeta({
  title: 'Verify your email',
  description: 'Confirm your email address to activate your iMapSU account.'
})

const route = useRoute()
const auth = useAuth()
const toast = useToast()

const state = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')
const verifiedUser = ref<User | null>(null)

const token = Array.isArray(route.query.token) ? route.query.token[0] : (route.query.token as string | undefined)

onMounted(async () => {
  if (!token) {
    state.value = 'error'
    errorMessage.value = 'This verification link is missing its token. Please request a new one.'
    return
  }

  try {
    verifiedUser.value = await auth.confirmEmail(token)
    state.value = 'success'
    toast.add({ title: 'Email verified', description: 'Your account is now active. Welcome aboard!', color: 'success', icon: 'i-lucide-mail-check' })
  } catch (error: unknown) {
    state.value = 'error'
    errorMessage.value = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      ?? 'We could not verify this link. It may already have been used.'
  }
})

const goToAccount = async () => {
  await navigateTo('/account')
}

const goToLogin = async () => {
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-base p-4">
    <UCard class="w-full max-w-md" :ui="{ body: { padding: 'p-8 sm:p-10' } }">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-map" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Verify your email</h1>
        </div>
      </template>

      <div class="space-y-5 text-center">
        <div v-if="state === 'loading'" class="flex flex-col items-center gap-3 py-4">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
          <p class="text-sm text-muted">Confirming your email…</p>
        </div>

        <div v-else-if="state === 'success'" class="flex flex-col items-center gap-3">
          <span class="grid size-14 place-items-center rounded-full bg-success/10 text-success">
            <UIcon name="i-lucide-mail-check" class="size-7" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">Your email is verified</h2>
            <p class="mt-1 text-sm text-muted">
              Hello, <span class="font-medium text-highlighted">{{ verifiedUser?.username }}</span>! Your account is now active and
              you're signed in.
            </p>
          </div>
          <UButton block size="lg" icon="i-lucide-arrow-right" @click="goToAccount">Continue to your account</UButton>
        </div>

        <div v-else class="flex flex-col items-center gap-3">
          <span class="grid size-14 place-items-center rounded-full bg-error/10 text-error">
            <UIcon name="i-lucide-circle-alert" class="size-7" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-error">Verification failed</h2>
            <p class="mt-1 text-sm text-muted">{{ errorMessage }}</p>
          </div>
          <UButton block size="lg" variant="outline" icon="i-lucide-log-in" @click="goToLogin">Go to sign in</UButton>
        </div>
      </div>

      <template #footer>
        <p class="text-center text-sm text-muted">
          Need to sign in instead?
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">Sign in</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>