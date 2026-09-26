<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type UploadedFile = { id: number; url?: string; name?: string }

type Tenancy = {
  id: number | string
  documentId?: string
  startDate: string
  endDate?: string
  status: 'Active' | 'Ended' | 'Terminated'
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; floor?: string; monthlyRent?: number | string; tenantPhotos?: UploadedFile[] | null } | null
}

type RenewalIntent = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  message?: string
  createdAt?: string
  tenancy?: { documentId?: string } | null
  letterOfRenewal?: { id: number; url?: string; name?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'My Tenancy | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Tenancy>>('/api/tenancies', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace][populate][tenantPhotos]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 10
  }
})

const { data: renewalData, refresh: refreshRenewals } = await useFetch<ListResponse<RenewalIntent>>('/api/renewal-intents', {
  baseURL,
  headers,
  query: {
    'populate[tenancy]': true,
    'populate[letterOfRenewal]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 50
  }
})

const tenancies = computed(() => data.value?.data ?? [])
const renewals = computed(() => renewalData.value?.data ?? [])

const statusColor = (status: Tenancy['status']) => {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Terminated':
      return 'error'
    default:
      return 'neutral'
  }
}

const renewalColor = (status: RenewalIntent['status']) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Rejected':
      return 'error'
    default:
      return 'secondary'
  }
}

const pendingRenewalFor = (tenancy: Tenancy) =>
  renewals.value.find(renewal => renewal.tenancy?.documentId === (tenancy.documentId ?? tenancy.id) && renewal.status === 'Pending')

const refreshAll = async () => {
  await Promise.all([refresh(), refreshRenewals()])
}

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : ''

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))

const renewOpen = ref(false)
const renewTenancy = ref<Tenancy | null>(null)
const renewLetterFile = ref<File>()
const renewMessage = ref('')
const renewSubmitting = ref(false)
const renewError = ref('')

const openRenew = (tenancy: Tenancy) => {
  renewTenancy.value = tenancy
  renewLetterFile.value = undefined
  renewMessage.value = ''
  renewError.value = ''
  renewOpen.value = true
}

const submitRenewal = async () => {
  renewError.value = ''
  if (!renewTenancy.value) return
  if (!renewLetterFile.value) {
    renewError.value = 'Please attach your letter of renewal intent.'
    return
  }

  renewSubmitting.value = true
  try {
    const form = new FormData()
    form.append('files', renewLetterFile.value)
    const uploaded = await $api<{ id: number }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Upload failed')

    await $api('/api/renewal-intents', {
      method: 'POST',
      body: {
        tenancy: renewTenancy.value.documentId ?? renewTenancy.value.id,
        letterOfRenewal: fileId,
        message: renewMessage.value || undefined
      }
    })
    toast.add({ title: 'Renewal intent submitted', description: 'Your request is now pending review by the administration.', color: 'success', icon: 'i-lucide-check-circle' })
    renewOpen.value = false
    await refreshRenewals()
  } catch (err) {
    renewError.value = getErrorMessage(err)
  } finally {
    renewSubmitting.value = false
  }
}

const tenancyKey = (tenancy: Tenancy) => String(tenancy.documentId ?? tenancy.id)
const photoSavingFor = ref<Record<string, boolean>>({})
const photoErrorFor = ref<Record<string, string>>({})

// Staged photo edits: selected files are kept as local previews and existing
// photos are removed from the working list, but nothing is persisted to the
// server until the tenant hits "Save photos".
type DraftPhoto = { url: string; serverId?: number; name?: string; file?: File }
const photoDrafts = ref<Record<string, DraftPhoto[]>>({})
const photoDirty = ref<Record<string, boolean>>({})

const draftsFor = (tenancy: Tenancy): DraftPhoto[] => {
  const key = tenancyKey(tenancy)
  let list = photoDrafts.value[key]
  if (!list) {
    list = (tenancy.propertySpace?.tenantPhotos ?? []).map(photo => ({
      url: `${baseURL}${photo.url}`,
      serverId: photo.id,
      name: photo.name
    }))
    photoDrafts.value[key] = list
  }
  return list
}

const savePhotos = async (tenancy: Tenancy, ids: number[]) => {
  await $api(`/api/tenancies/${tenancyKey(tenancy)}`, {
    method: 'PUT',
    body: { data: { photos: ids } }
  })
}

const onPhotoSelected = (tenancy: Tenancy, event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  for (const file of files) {
    draftsFor(tenancy).push({ url: URL.createObjectURL(file), file })
  }
  photoDirty.value[tenancyKey(tenancy)] = true
  photoErrorFor.value[tenancyKey(tenancy)] = ''
}

const removeDraftPhoto = (tenancy: Tenancy, photo: DraftPhoto) => {
  const list = draftsFor(tenancy)
  const index = list.indexOf(photo)
  if (index >= 0) list.splice(index, 1)
  photoDirty.value[tenancyKey(tenancy)] = true
  photoErrorFor.value[tenancyKey(tenancy)] = ''
}

const submitPhotos = async (tenancy: Tenancy) => {
  const key = tenancyKey(tenancy)
  const list = draftsFor(tenancy)
  photoSavingFor.value[key] = true
  photoErrorFor.value[key] = ''
  try {
    const pending = list.filter(photo => photo.file)
    let uploadedIds: number[] = []
    if (pending.length) {
      const formData = new FormData()
      for (const photo of pending) formData.append('files', photo.file as File)
      const uploaded = await $api<UploadedFile[]>('/api/upload', {
        method: 'POST',
        body: formData
      })
      uploadedIds = (uploaded ?? []).filter(photo => photo?.id != null).map(photo => photo.id)
    }
    const ids = [...list.filter(photo => photo.serverId != null).map(photo => photo.serverId as number), ...uploadedIds]
    await savePhotos(tenancy, ids)
    delete photoDrafts.value[key]
    delete photoDirty.value[key]
    toast.add({ title: 'Photos saved', description: 'Your space photos were saved and now appear on the campus map.', color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  } catch (err) {
    photoErrorFor.value[key] = getErrorMessage(err)
  } finally {
    photoSavingFor.value[key] = false
  }
}

const discardPhotos = (tenancy: Tenancy) => {
  const key = tenancyKey(tenancy)
  delete photoDrafts.value[key]
  delete photoDirty.value[key]
  photoErrorFor.value[key] = ''
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Current tenant</p>
        <h1 class="imapsu-page-heading">My Tenancy</h1>
        <p class="mt-2 max-w-xl text-muted">Details of the tenancy contract attached to your account.</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
    </div>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton v-for="index in 2" :key="index" class="h-40 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load your tenancy" :description="error.message" />

    <UEmpty v-else-if="tenancies.length === 0" icon="i-lucide-home" title="No tenancy on record" description="Once a tenancy is assigned to your account it will appear here." />

    <div v-else class="space-y-6">
      <UCard v-for="tenancy in tenancies" :key="tenancy.documentId ?? tenancy.id" :ui="{ body: 'p-6' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ tenancy.propertySpace?.name ?? 'Property' }}</p>
            <p v-if="tenancy.propertySpace" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span class="font-mono">{{ tenancy.propertySpace.propertyCode }}</span>
              <span class="flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-3.5" />{{ tenancy.propertySpace.building }}<template v-if="tenancy.propertySpace.floor"> · {{ tenancy.propertySpace.floor }}</template></span>
            </p>
          </div>
          <UBadge :color="statusColor(tenancy.status)" variant="subtle">{{ tenancy.status }}</UBadge>
        </div>

        <dl class="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Start date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.startDate) }}</dd></div>
          <div><dt class="text-xs text-muted">End date</dt><dd class="font-medium text-highlighted">{{ formatDate(tenancy.endDate) || '—' }}</dd></div>
          <div class="col-span-2"><dt class="text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(tenancy.propertySpace?.monthlyRent) }}</dd></div>
        </dl>

        <div class="mt-5 border-t border-default pt-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">Space photos</p>
            <p class="text-xs text-muted">Shown on the campus map so students can see your space.</p>
          </div>
          <div class="mt-3 flex flex-wrap items-start gap-3">
            <template v-if="draftsFor(tenancy).length">
              <div class="flex flex-wrap gap-2">
                <div v-for="photo in draftsFor(tenancy)" :key="photo.serverId ?? photo.url" class="group relative">
                  <img :src="photo.url" :alt="photo.name || 'Space photo'" class="h-20 w-20 rounded-lg object-cover" />
                  <button
                    v-if="tenancy.status === 'Active'"
                    type="button"
                    class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted shadow hover:text-error"
                    :disabled="photoSavingFor[tenancyKey(tenancy)]"
                    :aria-label="`Remove ${photo.name || 'photo'}`"
                    @click="removeDraftPhoto(tenancy, photo)"
                  >
                    <UIcon name="i-lucide-x" class="size-3" />
                  </button>
                </div>
              </div>
            </template>
            <label
              v-if="tenancy.status === 'Active'"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary"
              :class="{ 'pointer-events-none opacity-60': photoSavingFor[tenancyKey(tenancy)] }"
            >
              <UIcon name="i-lucide-image-plus" class="size-4" />
              Add photos
              <input type="file" accept="image/*" multiple class="sr-only" :disabled="photoSavingFor[tenancyKey(tenancy)]" @change="onPhotoSelected(tenancy, $event)" />
            </label>
            <p v-if="!draftsFor(tenancy).length && tenancy.status !== 'Active'" class="text-sm text-muted">No photos uploaded.</p>
          </div>
          <div v-if="tenancy.status === 'Active' && photoDirty[tenancyKey(tenancy)]" class="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-muted">Changes are staged — they appear on the campus map only after you save.</p>
            <div class="flex items-center gap-2">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" label="Discard changes" :disabled="photoSavingFor[tenancyKey(tenancy)]" @click="discardPhotos(tenancy)" />
              <UButton size="sm" icon="i-lucide-check" :loading="photoSavingFor[tenancyKey(tenancy)]" label="Save photos" @click="submitPhotos(tenancy)" />
            </div>
          </div>
          <p v-if="photoErrorFor[tenancyKey(tenancy)]" class="mt-2 text-xs text-error">{{ photoErrorFor[tenancyKey(tenancy)] }}</p>
        </div>

        <div v-if="tenancy.status === 'Active'" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
          <template v-if="pendingRenewalFor(tenancy)">
            <p class="flex items-center gap-2 text-sm text-toned"><UIcon name="i-lucide-hourglass" class="size-4 text-secondary" />Your contract renewal is pending review.</p>
            <UBadge color="secondary" variant="subtle">Renewal pending</UBadge>
          </template>
          <template v-else>
            <p class="text-sm text-muted">Planning to stay? File your renewal before the contract ends.</p>
            <UButton label="Renew contract" icon="i-lucide-file-signature" size="sm" @click="openRenew(tenancy)" />
          </template>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="renewOpen" class="max-w-xl" title="Renew contract" :description="renewTenancy ? `Submit a renewal intent for ${renewTenancy.propertySpace?.name ?? 'your tenancy'}.` : ''">
      <template #body>
        <form class="space-y-5" @submit.prevent="submitRenewal">
          <UFormField label="Letter of renewal intent" name="letterOfRenewal" required>
            <label class="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': renewSubmitting }">
              <UIcon name="i-lucide-folder-up" class="size-4" />
              Choose file
              <input type="file" accept=".pdf,.doc,.docx" class="sr-only" :disabled="renewSubmitting" @change="(event: Event) => { const input = event.target as HTMLInputElement; renewLetterFile = input.files?.[0] }" />
            </label>
            <p class="mt-1 text-xs text-muted">Attach a signed letter of renewal intent in PDF or Word format.</p>
            <p v-if="renewLetterFile" class="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary"><UIcon name="i-lucide-file-text" class="size-3.5" />{{ renewLetterFile.name }}</p>
          </UFormField>

          <UFormField label="Message" name="message">
            <UTextarea v-model="renewMessage" placeholder="Anything you want the administration to know? (Optional)" :rows="4" :disabled="renewSubmitting" />
          </UFormField>

          <UAlert v-if="renewError" color="error" icon="i-lucide-circle-alert" :description="renewError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="renewSubmitting" @click="renewOpen = false" />
            <UButton type="submit" :loading="renewSubmitting">Submit renewal intent</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
