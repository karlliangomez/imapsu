<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['student', 'current-tenant']
})

type Feedback = {
  id: number | string
  documentId?: string
  tenantName?: string
  rating: number
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type PropertySpace = { documentId: string; name: string; propertyCode: string; building: string }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Feedback | iMapSU' })

const auth = useAuth()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = { Authorization: `Bearer ${auth.token.value}` }

const { data, status, error, refresh } = await useFetch<ListResponse<Feedback>>('/api/feedbacks', {
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 50
  }
})

const { data: propertyData } = await useFetch<ListResponse<PropertySpace>>('/api/properties', {
  baseURL,
  headers,
  query: {
    'fields[0]': 'name',
    'fields[1]': 'propertyCode',
    'fields[2]': 'building',
    'pagination[pageSize]': 100
  }
})

const { data: tenantData } = await useFetch<ListResponse<{ propertyDocumentId: string; tenantName: string | null }>>('/api/properties/active-tenants', {
  baseURL,
  headers
})

const feedbacks = computed(() => data.value?.data ?? [])
const properties = computed(() => propertyData.value?.data ?? [])
const propertyOptions = computed(() => properties.value.map(property => ({
  label: `${property.name} (${property.propertyCode})`,
  value: property.documentId
})))

const selectedProperty = ref<string>()
const tenantName = ref('')
const rating = ref(0)
const comment = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const tenantMap = computed(() => new Map((tenantData.value?.data ?? []).map(entry => [entry.propertyDocumentId, entry.tenantName ?? ''])))

const tenantOfProperty = (documentId?: string) => tenantMap.value.get(documentId ?? '') ?? ''

watch(selectedProperty, value => {
  tenantName.value = tenantOfProperty(value)
})

const submit = async () => {
  errorMessage.value = ''
  if (!selectedProperty.value) {
    errorMessage.value = 'Please choose a property.'
    return
  }
  if (rating.value < 1) {
    errorMessage.value = 'Please pick a rating.'
    return
  }

  submitting.value = true
  try {
    await $api('/api/feedbacks', {
      method: 'POST',
      body: {
        tenantName: tenantName.value || undefined,
        rating: rating.value,
        comment: comment.value || undefined,
        propertySpace: selectedProperty.value
      }
    })
    selectedProperty.value = undefined
    tenantName.value = ''
    rating.value = 0
    comment.value = ''
    await refresh()
  } catch (err) {
    errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p class="imapsu-page-eyebrow mb-2">Student feedback</p>
        <h1 class="imapsu-page-heading">Feedback</h1>
        <p class="mt-2 max-w-xl text-muted">{{ auth.isStudent.value ? 'Rate and review the tenant of a stall or space so the administration can keep service quality high.' : 'Read what students are saying about stall tenants.' }}</p>
      </div>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-5">
      <UCard v-if="auth.isStudent.value" class="lg:col-span-2">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Submit feedback</h2>
        </template>

        <form class="space-y-5" @submit.prevent="submit">
          <UFormField label="Property" name="propertySpace" required>
            <USelect v-model="selectedProperty" :items="propertyOptions" placeholder="Select a property" :disabled="submitting" />
          </UFormField>

          <UFormField label="Tenant name" name="tenantName">
            <UInput v-model="tenantName" type="text" placeholder="No active tenant" disabled />
            <p class="mt-1 text-xs text-muted">The tenant is filled in automatically for the selected property.</p>
          </UFormField>

          <UFormField label="Rating" name="rating" required>
            <div class="flex items-center gap-1">
              <UButton
                v-for="star in 5"
                :key="star"
                type="button"
                color="neutral"
                variant="ghost"
                square
                :icon="star <= rating ? 'i-lucide-star' : 'i-lucide-star-outline'"
                :class="star <= rating ? 'text-secondary' : 'text-muted'"
                :aria-label="`Rate ${star} star${star > 1 ? 's' : ''}`"
                :disabled="submitting"
                @click="rating = star"
              />
            </div>
          </UFormField>

          <UFormField label="Comment" name="comment">
            <UTextarea v-model="comment" placeholder="Tell us about your experienceâ€¦" :rows="4" :disabled="submitting" />
          </UFormField>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :description="errorMessage" />

          <UButton type="submit" block :loading="submitting">Submit feedback</UButton>
        </form>
      </UCard>

      <div class="lg:col-span-3" :class="auth.isStudent.value ? '' : 'lg:col-span-5'">
        <div v-if="status === 'pending'" class="space-y-4">
          <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-lg" />
        </div>

        <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load feedback" :description="error.message" />

        <UEmpty v-else-if="feedbacks.length === 0" icon="i-lucide-message-square" title="No feedback yet" description="Feedback shared by students will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in feedbacks" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-1">
                <UIcon
                  v-for="star in 5"
                  :key="star"
                  :name="star <= item.rating ? 'i-lucide-star' : 'i-lucide-star-outline'"
                  class="size-4"
                  :class="star <= item.rating ? 'text-secondary' : 'text-muted'"
                />
              </div>
              <p class="text-xs text-muted">{{ formatDate(item.createdAt) }}</p>
            </div>
            <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.comment || 'No comment left.' }}</p>
            <p class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span v-if="item.propertySpace" class="flex items-center gap-1">
                <UIcon name="i-lucide-building-2" class="size-3.5" />
                {{ item.propertySpace.name }}
                <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
              </span>
              <span v-if="item.tenantName">Â· Tenant: {{ item.tenantName }}</span>
            </p>
          </UCard>
        </div>
      </div>
    </div>
  </main>
</template>
