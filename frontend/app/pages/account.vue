<script setup lang="ts">
import type { StrapiFile } from '~/types/auth'

definePageMeta({
  middleware: 'auth'
})

useHead({ title: 'My account | iMapSU' })

const auth = useAuth()
const { $api, getErrorMessage } = useStrapi()
const toast = useToast()

const profileForm = reactive({
  fullName: '',
  contactNumber: '',
  bio: ''
})

const employeeForm = reactive({
  position: '',
  department: '',
  employeeId: '',
  officeLocation: ''
})

const savingProfile = ref(false)
const profileError = ref('')
const savingEmployee = ref(false)
const employeeError = ref('')
const uploadingAvatar = ref(false)
const avatarError = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
const cropModalOpen = ref(false)
const cropSrc = ref<string | null>(null)
const cropObjectUrl = ref<string | null>(null)

const isStaff = computed(() => auth.isOas.value || auth.isAdmin.value)

const applyUserToForms = () => {
  const u = auth.user.value
  if (!u) return
  profileForm.fullName = u.fullName ?? ''
  profileForm.contactNumber = u.contactNumber ?? ''
  profileForm.bio = u.bio ?? ''
  employeeForm.position = u.position ?? ''
  employeeForm.department = u.department ?? ''
  employeeForm.employeeId = u.employeeId ?? ''
  employeeForm.officeLocation = u.officeLocation ?? ''
}

watch(() => auth.user.value, () => applyUserToForms(), { immediate: true })

const openAccountSettings = () => {
  useState('account-settings-open').value = true
}

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

const saveProfile = async () => {
  profileError.value = ''
  savingProfile.value = true
  try {
    await $api('/api/auth/account', {
      method: 'PUT',
      body: { ...profileForm }
    })
    await auth.refreshMe()
    toast.add({ title: 'Profile updated', color: 'success', icon: 'i-lucide-check-circle' })
  } catch (err) {
    profileError.value = getErrorMessage(err)
  } finally {
    savingProfile.value = false
  }
}

const saveEmployee = async () => {
  employeeError.value = ''
  savingEmployee.value = true
  try {
    await $api('/api/auth/account', {
      method: 'PUT',
      body: { ...employeeForm }
    })
    await auth.refreshMe()
    toast.add({ title: 'Employee details updated', color: 'success', icon: 'i-lucide-check-circle' })
  } catch (err) {
    employeeError.value = getErrorMessage(err)
  } finally {
    savingEmployee.value = false
  }
}

const triggerAvatarPicker = () => {
  avatarError.value = ''
  avatarInput.value?.click()
}

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  avatarError.value = ''
  if (!file.type.startsWith('image/')) {
    avatarError.value = 'Please choose an image file.'
    return
  }
  if (cropObjectUrl.value) URL.revokeObjectURL(cropObjectUrl.value)
  const url = URL.createObjectURL(file)
  cropObjectUrl.value = url
  cropSrc.value = url
  cropModalOpen.value = true
  input.value = ''
}

const handleCropModalOpenChange = (value: boolean) => {
  cropModalOpen.value = value
  if (!value) {
    if (cropObjectUrl.value) {
      URL.revokeObjectURL(cropObjectUrl.value)
      cropObjectUrl.value = null
    }
    cropSrc.value = null
  }
}

const onCropComplete = async (blob: Blob) => {
  handleCropModalOpenChange(false)
  uploadingAvatar.value = true
  try {
    const croppedFile = new File([blob], 'avatar.png', { type: 'image/png' })
    const form = new FormData()
    form.append('files', croppedFile)
    const uploaded = await $api<StrapiFile[]>('/api/upload', { method: 'POST', body: form })
    await $api('/api/auth/account', { method: 'PUT', body: { avatar: uploaded[0].id } })
    await auth.refreshMe()
    toast.add({ title: 'Profile photo updated', color: 'success', icon: 'i-lucide-check-circle' })
  } catch (err) {
    avatarError.value = getErrorMessage(err)
  } finally {
    uploadingAvatar.value = false
  }
}

onBeforeUnmount(() => {
  if (cropObjectUrl.value) URL.revokeObjectURL(cropObjectUrl.value)
})

const removeAvatar = async () => {
  avatarError.value = ''
  uploadingAvatar.value = true
  try {
    await $api('/api/auth/account', { method: 'PUT', body: { avatar: null } })
    await auth.refreshMe()
    toast.add({ title: 'Profile photo removed', color: 'neutral', icon: 'i-lucide-check-circle' })
  } catch (err) {
    avatarError.value = getErrorMessage(err)
  } finally {
    uploadingAvatar.value = false
  }
}

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
        <p class="mt-2 max-w-xl text-muted">Manage your profile and access role-specific features.</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Profile</h2>
        </template>

        <div class="flex flex-col items-center gap-4">
          <UAvatar
            :src="auth.avatarUrl.value ?? undefined"
            :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()"
            :alt="auth.displayName.value"
            size="2xl"
            color="primary"
          />
          <div class="text-center">
            <p class="font-semibold text-highlighted">{{ auth.displayName.value }}</p>
            <p class="text-sm text-muted">@{{ auth.user.value?.username }}</p>
          </div>
          <UBadge :color="roleColor" variant="subtle">{{ roleLabel }}</UBadge>

          <div class="flex flex-wrap justify-center gap-2">
            <UButton :loading="uploadingAvatar" color="neutral" variant="outline" icon="i-lucide-camera" label="Upload photo" size="sm" @click="triggerAvatarPicker" />
            <UButton v-if="auth.user.value?.avatar" :loading="uploadingAvatar" color="neutral" variant="ghost" icon="i-lucide-trash-2" label="Remove" size="sm" @click="removeAvatar" />
          </div>
          <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarSelected" />
          <UAlert v-if="avatarError" color="error" icon="i-lucide-circle-alert" :description="avatarError" />
        </div>
      </UCard>

      <AvatarCropperModal
        :open="cropModalOpen"
        :src="cropSrc"
        @update:open="handleCropModalOpenChange"
        @cropped="onCropComplete"
      />

      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Profile details</h2>
        </template>

        <form class="space-y-4" @submit.prevent="saveProfile">
          <UFormField label="Full name" name="fullName">
            <UInput v-model="profileForm.fullName" placeholder="Your full name" :disabled="savingProfile" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Contact number" name="contactNumber">
              <UInput v-model="profileForm.contactNumber" placeholder="e.g. 0917 000 0000" :disabled="savingProfile" />
            </UFormField>
            <UFormField label="Email" name="email" hint="Managed by an administrator">
              <UInput :model-value="auth.user.value?.email" disabled />
            </UFormField>
          </div>

          <UFormField label="Bio" name="bio">
            <UTextarea v-model="profileForm.bio" placeholder="Tell us a little about yourself" :disabled="savingProfile" />
          </UFormField>

          <UAlert v-if="profileError" color="error" icon="i-lucide-circle-alert" :description="profileError" />

          <div class="flex justify-end">
            <UButton type="submit" :loading="savingProfile">Save profile</UButton>
          </div>
        </form>
      </UCard>
    </div>

    <UCard v-if="isStaff" class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">Employee details</h2>
      </template>

      <form class="space-y-4" @submit.prevent="saveEmployee">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Position" name="position">
            <UInput v-model="employeeForm.position" placeholder="e.g. Campus Property Officer" :disabled="savingEmployee" />
          </UFormField>
          <UFormField label="Department" name="department">
            <UInput v-model="employeeForm.department" placeholder="e.g. Office of Auxiliary Services" :disabled="savingEmployee" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Employee ID" name="employeeId">
            <UInput v-model="employeeForm.employeeId" placeholder="e.g. OAS-2026-014" :disabled="savingEmployee" />
          </UFormField>
          <UFormField label="Office location" name="officeLocation">
            <UInput v-model="employeeForm.officeLocation" placeholder="e.g. Admin Building, Room 204" :disabled="savingEmployee" />
          </UFormField>
        </div>

        <UAlert v-if="employeeError" color="error" icon="i-lucide-circle-alert" :description="employeeError" />

        <div class="flex justify-end">
          <UButton type="submit" :loading="savingEmployee">Save employee details</UButton>
        </div>
      </form>
    </UCard>

    <UCard class="mt-6">
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

    <UCard class="mt-6">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">Account settings</h2>
      </template>

      <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p class="text-sm font-medium text-toned">Password</p>
          <p class="mt-0.5 text-sm text-muted">Username and email are managed by an administrator.</p>
        </div>
        <UButton label="Change password" icon="i-lucide-key-round" @click="openAccountSettings" />
      </div>
    </UCard>
  </div>
</template>
