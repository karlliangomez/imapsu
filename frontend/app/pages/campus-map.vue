<script setup lang="ts">
import type { MapProperty, MapZone } from '~/types/map'
import { buildingColors, buildingOccupancy, MAP_STATUS_COLORS, normalizeBuildingName, propertiesInBuilding } from '~/utils/mapZones'
import { BUILDING_NAMES } from '~/utils/buildings'

type ListResponse<T> = { data: T[] }

type MapLabel = {
  documentId?: string
  buildingKey: string
  label: string
}

useHead({ title: 'Campus Map | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, authHeaders, $api, getErrorMessage } = useStrapi()

const { data: propertiesData, status } = await useFetch<ListResponse<MapProperty>>('/api/property-spaces', {
  baseURL,
  headers: authHeaders,
  query: { sort: 'propertyCode:asc', 'pagination[pageSize]': 500 }
})

const { data: labelsData, refresh: refreshLabels } = await useFetch<ListResponse<MapLabel>>('/api/map-labels', {
  baseURL,
  headers: authHeaders,
  query: { 'pagination[pageSize]': 500 }
})

const properties = computed(() => propertiesData.value?.data ?? [])
const colors = computed(() => buildingColors(properties.value))
const statuses = computed(() => buildingOccupancy(properties.value))
const labels = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const entry of labelsData.value?.data ?? []) map[normalizeBuildingName(entry.buildingKey)] = entry.label
  return map
})
const selected = ref<MapZone | null>(null)
const modelError = ref('')
const showNames = ref(true)
const buildingCount = ref(BUILDING_NAMES.length)

// OAS-only building labeling. In this mode clicking a building opens the name
// editor instead of the property details panel.
const labelMode = ref(false)
const labelOpen = ref(false)
const labelingZone = ref<MapZone | null>(null)
const labelDraft = ref('')
const savingLabel = ref(false)
const labelError = ref('')

type ViewerRef = { resetCamera: () => void }

const viewer = ref<ViewerRef | null>(null)

const displayName = (zone: MapZone) => labels.value[normalizeBuildingName(zone.name)] ?? zone.name

const selectZone = (zone: MapZone) => {
  viewer.value?.resetCamera()
  if (labelMode.value && auth.isOas.value) {
    const key = normalizeBuildingName(zone.name)
    labelDraft.value = labels.value[key] ?? zone.name
    labelingZone.value = zone
    labelError.value = ''
    labelOpen.value = true
    return
  }
  selected.value = zone
}

const closePanel = () => {
  selected.value = null
}

const saveLabel = async () => {
  const zone = labelingZone.value
  if (!zone) return
  const name = labelDraft.value.trim()
  if (!name) {
    labelError.value = 'Enter a name for this building.'
    return
  }
  savingLabel.value = true
  labelError.value = ''
  try {
    const key = normalizeBuildingName(zone.name)
    const existing = labelsData.value?.data.find((l) => normalizeBuildingName(l.buildingKey) === key)
    if (existing?.documentId) {
      await $api(`/api/map-labels/${existing.documentId}`, { method: 'PUT', body: { data: { label: name } } })
    } else {
      await $api('/api/map-labels', { method: 'POST', body: { data: { buildingKey: key, label: name } } })
    }
    toast.add({ title: 'Building name saved', color: 'success', icon: 'i-lucide-check-circle' })
    labelOpen.value = false
    await refreshLabels()
  } catch (err) {
    labelError.value = getErrorMessage(err)
  } finally {
    savingLabel.value = false
  }
}

const removeLabel = async () => {
  const zone = labelingZone.value
  if (!zone) return
  savingLabel.value = true
  labelError.value = ''
  try {
    const key = normalizeBuildingName(zone.name)
    const existing = labelsData.value?.data.find((l) => normalizeBuildingName(l.buildingKey) === key)
    if (existing?.documentId) {
      await $api(`/api/map-labels/${existing.documentId}`, { method: 'DELETE' })
      toast.add({ title: 'Building name removed', color: 'neutral', icon: 'i-lucide-eraser' })
    }
    labelOpen.value = false
    await refreshLabels()
  } catch (err) {
    labelError.value = getErrorMessage(err)
  } finally {
    savingLabel.value = false
  }
}

const buildingProperties = computed(() => propertiesInBuilding(selected.value?.name, properties.value))

const propertyBadgeColor = (property: MapProperty) => (property.space_status === 'Vacant' ? 'success' : 'error')
</script>

<template>
  <div class="imapsu-page-bg min-h-full">
    <div class="mx-auto max-w-7xl px-6 py-8">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="imapsu-page-heading">Campus Map</h1>
          <p class="mt-2 max-w-xl text-muted">
            Explore the campus in 3D. Building colors come from the property page: green has a vacant space, red is fully occupied, and unlisted buildings keep their original look.
          </p>
        </div>
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-mouse-pointer-click" class="size-4" />
          <span>Drag to rotate &middot; Scroll to zoom &middot; Click a building for details</span>
        </div>
      </div>

      <div class="mt-6">
        <UCard :ui="{ body: 'p-0', footer: 'flex flex-wrap items-center justify-between gap-3 px-4 py-2.5' }">
          <div class="relative h-[68vh] w-full overflow-hidden rounded-lg">
            <ClientOnly>
              <CampusMapViewer
                ref="viewer"
                :auto-buildings="true"
                :building-colors="colors"
                :building-status="statuses"
                :labels="labels"
                :active-zone-id="selected ? normalizeBuildingName(selected.name) : null"
                :show-names="showNames"
                @select="selectZone"
                @model-error="modelError = $event"
                @buildings-ready="buildingCount = $event"
              />

              <template #fallback>
                <div class="grid h-full w-full place-items-center text-muted">
                  <span>Loading 3D viewer…</span>
                </div>
              </template>
            </ClientOnly>

            <div
              v-if="labelMode && auth.isOas.value"
              class="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-(--ui-bg)/90 px-4 py-2 text-sm shadow-lg backdrop-blur"
            >
              <UIcon name="i-lucide-pen-line" class="size-4 text-primary" />
              <span class="font-medium">Labeling mode — click any building to name it</span>
              <UButton size="xs" color="neutral" variant="ghost" label="Done" @click="labelMode = false" />
            </div>

            <div
              v-if="modelError"
              class="absolute inset-0 grid place-items-center bg-(--ui-bg) p-8 text-center"
            >
              <div>
                <UIcon name="i-lucide-triangle-alert" class="mx-auto mb-3 size-10 text-warning" />
                <p class="font-medium">{{ modelError }}</p>
                <p class="mt-1 text-sm text-muted">
                  Place your GLB file at <code class="rounded bg-(--ui-bg-elevated) px-1.5 py-0.5">frontend/public/models/campus.glb</code>.
                </p>
              </div>
            </div>

            <div
              v-if="selected"
              class="absolute bottom-4 left-4 max-w-sm rounded-xl border border-(--ui-border) bg-(--ui-bg)/90 shadow-lg backdrop-blur"
            >
              <div class="flex items-start justify-between gap-3 p-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class="size-3 shrink-0 rounded-full"
                      :style="{ backgroundColor: selected.color ?? MAP_STATUS_COLORS.unlisted }"
                    />
                    <h3 class="truncate text-base font-semibold">{{ selected ? displayName(selected) : '' }}</h3>
                  </div>
                  <p class="mt-1 text-xs font-medium text-primary">Property building</p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    aria-label="Close"
                    @click="closePanel"
                  />
                </div>
              </div>

              <div class="px-4 pb-3">
                <template v-if="buildingProperties.length">
                  <div class="space-y-2">
                    <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                      {{ buildingProperties.length === 1 ? 'Property space' : `Property spaces in this building (${buildingProperties.length})` }}
                    </p>
                    <div
                      v-for="property in buildingProperties"
                      :key="property.documentId ?? property.propertyCode"
                      class="rounded-lg bg-(--ui-bg-elevated)/60 p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-medium">
                          {{ property.propertyCode ?? property.name }}
                        </span>
                        <UBadge :color="propertyBadgeColor(property)">{{ property.space_status }}</UBadge>
                      </div>
                      <p v-if="property.name && property.name !== property.propertyCode" class="mt-0.5 text-xs text-muted">
                        {{ property.name }}
                      </p>
                      <p v-if="property.monthlyRent" class="mt-1 text-sm font-semibold">
                        ₱{{ Number(property.monthlyRent).toLocaleString() }}<span class="text-xs font-normal text-muted"> / month</span>
                      </p>
                    </div>
                  </div>
                </template>
                <p v-else class="text-sm text-muted">
                  No property spaces listed for this building yet. Once a space is added on the property page, it shows up here.
                </p>

                <div class="mt-3">
                  <UButton
                    :to="auth.isAuthenticated.value ? '/properties' : '/login'"
                    size="sm"
                    icon="i-lucide-building-2"
                    label="View property listing"
                  />
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <span>
                {{ buildingCount }} {{ buildingCount === 1 ? 'building' : 'buildings' }} on the map
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-full" :style="{ backgroundColor: MAP_STATUS_COLORS.vacant }" />
                Vacant space available
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-full" :style="{ backgroundColor: MAP_STATUS_COLORS.occupied }" />
                Fully occupied
              </span>
              <span>·</span>
              <span>Building badges read ● Vacant / ● Occupied, so status is never color-only</span>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="auth.isOas.value"
                size="sm"
                :color="labelMode ? 'primary' : 'neutral'"
                :variant="labelMode ? 'solid' : 'ghost'"
                icon="i-lucide-pen-line"
                :label="labelMode ? 'Stop labeling' : 'Label buildings'"
                @click="labelMode = !labelMode"
              />
              <UButton
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-tag"
                :label="showNames ? 'Hide names' : 'Show names'"
                @click="showNames = !showNames"
              />
              <UButton
                v-if="BUILDING_NAMES.length"
                size="sm"
                variant="ghost"
                color="neutral"
                icon="i-lucide-rotate-ccw"
                label="Reset view"
                @click="viewer?.resetCamera()"
              />
            </div>
          </template>
        </UCard>
      </div>

      <div v-if="status === 'pending'" class="mt-4">
        <UProgress />
      </div>
      <UAlert
        v-else-if="status === 'error'"
        class="mt-4"
        color="error"
        icon="i-lucide-circle-alert"
        title="Could not load property data"
        description="Building colors are unavailable until the property list loads. Try refreshing the page."
      />

      <UModal v-model:open="labelOpen" title="Name this building" :description="labelingZone ? `Set the name shown on the map for ${labelingZone.name}.` : ''">
        <template #body>
          <form class="space-y-5" @submit.prevent="saveLabel">
            <UFormField label="Building name" name="label" required>
              <UInput v-model="labelDraft" placeholder="e.g. Main Library" :disabled="savingLabel" />
              <p class="mt-1 text-xs text-muted">This overrides the temporary model name and shows on the map for everyone.</p>
            </UFormField>

            <UAlert v-if="labelError" color="error" icon="i-lucide-circle-alert" :description="labelError" />

            <div class="flex items-center justify-between gap-2">
              <UButton
                v-if="labelingZone && labels[normalizeBuildingName(labelingZone.name)]"
                label="Reset name"
                color="error"
                variant="ghost"
                icon="i-lucide-eraser"
                :loading="savingLabel"
                @click="removeLabel"
              />
              <span v-else />
              <div class="flex items-center gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" :disabled="savingLabel" @click="labelOpen = false" />
                <UButton type="submit" :loading="savingLabel">Save name</UButton>
              </div>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>
