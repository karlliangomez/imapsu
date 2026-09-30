<script setup lang="ts">
import type { User } from '~/types/auth'

definePageMeta({
  title: 'Verify your email',
  description: 'Enter the verification code to activate your iMapSU account.'
})

const route = useRoute()
const auth = useAuth()
const toast = useToast()

const OTP_LENGTH = 6

const email = ref('')
const digits = ref<string[]>(Array(OTP_LENGTH).fill(''))
const inputRefs = ref<(HTMLElement | null)[]>([])
const verifying = ref(false)
const resending = ref(false)
const resendCooldown = ref(0)
const verifiedUser = ref<User | null>(null)
const errorMessage = ref('')

let cooldownTimer: ReturnType<typeof setInterval> | null = null

const code = computed(() => digits.value.join(''))
const codeComplete = computed(() => code.value.length === OTP_LENGTH)

const queryEmail = Array.isArray(route.query.email) ? route.query.email[0] : (route.query.email as string | undefined)
if (queryEmail) {
  email.value = queryEmail
} else if (auth.user.value?.email) {
  email.value = auth.user.value.email
}

function setInputRef(idx: number, el: unknown) {
  inputRefs.value[idx] = (el as HTMLElement | null) ?? null
}

function focusInput(idx: number) {
  const el = inputRefs.value[idx]
  if (el) {
    el.focus()
    el.select?.()
  }
}

function onDigitInput(idx: number, value: string) {
  const cleaned = value.replace(/[^0-9]/g, '').slice(-1)
  const next = [...digits.value]
  next[idx] = cleaned
  digits.value = next
  if (cleaned && idx < OTP_LENGTH - 1) {
    focusInput(idx + 1)
  }
}

function onDigitKeydown(idx: number, event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    if (!digits.value[idx] && idx > 0) {
      event.preventDefault()
      focusInput(idx - 1)
    }
  } else if (event.key === 'ArrowLeft' && idx > 0) {
    event.preventDefault()
    focusInput(idx - 1)
  } else if (event.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
    event.preventDefault()
    focusInput(idx + 1)
  }
}

function onDigitPaste(_idx: number, event: ClipboardEvent) {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text').replace(/[^0-9]/g, '').slice(0, OTP_LENGTH) ?? ''
  if (!pasted) return
  digits.value = Array(OTP_LENGTH)
    .fill('')
    .map((_, i) => pasted[i] ?? '')
  focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
}

function startResendCooldown(seconds = 30) {
  resendCooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const verify = async () => {
  errorMessage.value = ''
  if (!email.value.includes('@')) {
    errorMessage.value = 'Enter the email address you registered with.'
    return
  }
  if (!codeComplete.value) {
    errorMessage.value = 'Enter the 6-digit verification code from your email.'
    return
  }

  verifying.value = true
  try {
    verifiedUser.value = await auth.confirmEmail(email.value, code.value)
    toast.add({ title: 'Email verified', description: 'Your account is now active. Welcome aboard!', color: 'success', icon: 'i-lucide-mail-check' })
  } catch (error: unknown) {
    errorMessage.value = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      ?? 'We could not verify that code. It may be incorrect or expired.'
    digits.value = Array(OTP_LENGTH).fill('')
    focusInput(0)
  } finally {
    verifying.value = false
  }
}

const resend = async () => {
  if (resendCooldown.value > 0) return
  errorMessage.value = ''
  resending.value = true
  try {
    await auth.resendConfirmation(email.value)
    toast.add({ title: 'New code sent', description: `A fresh verification code was sent to ${email.value}.`, color: 'success', icon: 'i-lucide-mail-check' })
    startResendCooldown()
  } catch {
    toast.add({ title: 'Could not resend', description: 'Please try again in a moment.', color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    resending.value = false
  }
}

const goToAccount = async () => {
  await navigateTo('/account')
}

onMounted(() => {
  focusInput(0)
  startResendCooldown()
})

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})

watch(code, (value) => {
  if (value.length === OTP_LENGTH && !verifiedUser.value && !verifying.value) {
    verify()
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-base p-4">
    <UCard class="w-full max-w-md" :ui="{ body: { padding: 'p-8 sm:p-10' } }">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-mail-check" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Verify your email</h1>
          <p class="mt-1 text-sm text-muted">Enter the 6-digit code we emailed you to activate your account.</p>
        </div>
      </template>

      <div v-if="verifiedUser" class="space-y-5 text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <UIcon name="i-lucide-mail-check" class="size-7" />
        </span>
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Your email is verified</h2>
          <p class="mt-1 text-sm text-muted">
            Hello, <span class="font-medium text-highlighted">{{ verifiedUser.username }}</span>! Your account is now active and
            you're signed in.
          </p>
        </div>
        <UButton block size="lg" icon="i-lucide-arrow-right" @click="goToAccount">Continue to your account</UButton>
      </div>

      <form v-else class="space-y-5" @submit.prevent="verify">
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :description="errorMessage" />

        <UFormField label="Email address" name="email" required>
          <UInput v-model="email" type="email" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="email" size="lg" :disabled="verifying || resending" :ui="{ root: 'w-full' }" />
        </UFormField>

        <UFormField label="Verification code" name="code" required>
          <div class="flex items-center justify-center gap-2 sm:gap-3" role="group" aria-label="6-digit verification code">
            <input
              v-for="(_, idx) in OTP_LENGTH"
              :key="idx"
              :ref="(el) => setInputRef(idx, el)"
              :value="digits[idx]"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="1"
              placeholder="0"
              class="h-14 w-11 rounded-xl border border-default bg-elevated text-center text-xl font-semibold tracking-wide text-highlighted outline-none transition-all placeholder:text-dimmed/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50 sm:w-12"
              :class="digits[idx] ? 'border-primary' : ''"
              :disabled="verifying"
              :aria-label="`Digit ${idx + 1}`"
              @input="onDigitInput(idx, ($event.target as HTMLInputElement).value)"
              @keydown="onDigitKeydown(idx, $event)"
              @paste="onDigitPaste(idx, $event)"
            />
          </div>
          <p class="mt-2 text-center text-xs text-muted">
            Enter the code from your email. It expires in 10 minutes.
          </p>
        </UFormField>

        <UButton type="submit" block size="lg" :loading="verifying" :disabled="!codeComplete" icon="i-lucide-check-check">
          Verify &amp; activate account
        </UButton>

        <div class="flex items-center justify-center gap-1.5 text-sm">
          <span class="text-muted">Haven't received it?</span>
          <UButton variant="ghost" size="sm" :loading="resending" :disabled="resendCooldown > 0" @click="resend">
            {{ resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code' }}
          </UButton>
        </div>
      </form>

      <template #footer>
        <p class="text-center text-sm text-muted">
          Need to sign in instead?
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">Sign in</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>