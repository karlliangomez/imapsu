<script setup lang="ts">
useHead({ title: 'Create Account | iMapSU' })

const auth = useAuth()
const toast = useToast()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const role = ref('student')
const loading = ref(false)

const roleOptions = [
  { label: 'Student', value: 'student', description: 'View the map and submit feedback about tenants.' },
  { label: 'Aspiring Tenant', value: 'aspiring-tenant', description: 'Browse vacant spaces and apply to rent one.' }
]

const passwordCheck = computed(() => checkPasswordStrength(password.value))

const handleRegister = async () => {
  if (!isStrongPassword(password.value)) {
    toast.add({
      title: 'Password is too weak',
      description: `Password must contain ${PASSWORD_REQUIREMENTS.filter(requirement => passwordCheck.value.missing.includes(requirement.key)).map(requirement => requirement.label).join(', ')}.`,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return
  }

  if (password.value !== confirmPassword.value) {
    toast.add({ title: 'Passwords do not match', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }

  loading.value = true
  try {
    await auth.register({ username: username.value, email: email.value, password: password.value, role: role.value })
    toast.add({ title: 'Account created', description: `Welcome, ${auth.user.value?.username}!`, color: 'success', icon: 'i-lucide-check-circle' })
    await navigateTo('/account')
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    toast.add({ title: 'Registration failed', description: message ?? 'Something went wrong. Please try again.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <UCard class="border-t-4 border-t-gold-500 shadow-xl ring-1 ring-maroon-950/10">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-map" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Create your account</h1>
          <p class="mt-1 text-sm text-muted">Choose how you'll use iMapSU.</p>
        </div>
      </template>

      <form class="space-y-5" @submit.prevent="handleRegister">
        <UFormField label="Username" name="username" required>
          <UInput v-model="username" type="text" leading-icon="i-lucide-user" placeholder="jdoe" autocomplete="username" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
        </UFormField>

        <UFormField label="Email" name="email" required>
          <UInput v-model="email" type="email" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="email" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
        </UFormField>

        <UFormField label="I want to use iMapSU as" name="role" required>
          <USelect v-model="role" :items="roleOptions" size="lg" :disabled="loading" />
          <p class="mt-1 text-xs text-muted">{{ roleOptions.find(option => option.value === role)?.description }}</p>
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Password" name="password" required>
            <UInput v-model="password" :type="showPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                  <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
            <ul v-if="password" class="mt-1.5 space-y-1">
              <li
                v-for="requirement in PASSWORD_REQUIREMENTS"
                :key="requirement.key"
                class="flex items-center gap-1.5 text-xs"
                :class="passwordCheck.missing.includes(requirement.key) ? 'text-muted' : 'text-success'"
              >
                <UIcon :name="passwordCheck.missing.includes(requirement.key) ? 'i-lucide-circle' : 'i-lucide-circle-check'" class="size-3.5 shrink-0" />
                {{ requirement.label }}
              </li>
            </ul>
          </UFormField>

          <UFormField label="Confirm password" name="confirmPassword" required>
            <UInput v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                  <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>
        </div>

        <UButton type="submit" block size="lg" :loading="loading">
          Create account
        </UButton>
      </form>

      <template #footer>
        <p class="text-center text-sm text-muted">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">Sign in</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
