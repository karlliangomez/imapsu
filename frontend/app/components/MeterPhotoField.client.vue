<script setup lang="ts">
import { useMeterOcr } from '~/composables/useMeterOcr'

const props = withDefaults(defineProps<{
  title: string
  hint: string
  unit: string
  icon: string
  initialSrc?: string | null
  disabled?: boolean
}>(), {
  initialSrc: null,
  disabled: false
})

const emit = defineEmits<{
  (e: 'file-change', file: File | null): void
  (e: 'remove-image'): void
  (e: 'reading', value: number): void
}>()

const { recognize, extractReading } = useMeterOcr()

const input = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const existingRemoved = ref(false)
const scanning = ref(false)
const scanStatus = ref('')
const ocrError = ref('')
const extracted = ref<number | null>(null)
const scanGen = ref(0)

const showingExisting = computed(() => props.initialSrc && !file.value && !existingRemoved.value)

const onPick = () => input.value?.click()

const onSelected = (event: Event) => {
  const el = event.target as HTMLInputElement
  const selected = el.files?.[0]
  el.value = ''
  if (!selected) return
  ocrError.value = ''
  if (!selected.type.startsWith('image/')) {
    ocrError.value = 'Please choose an image file.'
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(selected)
  file.value = selected
  extracted.value = null
  scanStatus.value = ''
  existingRemoved.value = false
  scanGen.value++
  emit('file-change', selected)
  scan()
}

const removePhoto = () => {
  scanGen.value++
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
  if (file.value) {
    file.value = null
    emit('file-change', null)
  } else if (props.initialSrc && !existingRemoved.value) {
    existingRemoved.value = true
    emit('remove-image')
  }
  extracted.value = null
  ocrError.value = ''
  scanStatus.value = ''
}

const scan = async () => {
  if (!file.value) return
  const gen = scanGen.value
  scanning.value = true
  ocrError.value = ''
  scanStatus.value = 'Preparing OCR engine…'
  try {
    const text = await recognize(file.value, status => {
      scanStatus.value = status
    })
    if (gen !== scanGen.value) return
    const reading = extractReading(text)
    if (reading == null) {
      ocrError.value = 'No number found in this photo. Enter the reading in the field above.'
    } else {
      extracted.value = reading
      emit('reading', reading)
    }
  } catch (err) {
    if (gen === scanGen.value) {
      ocrError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (gen === scanGen.value) {
      scanning.value = false
      scanStatus.value = ''
    }
  }
}

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="rounded-lg border border-default bg-muted/20 p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <UIcon :name="props.icon" class="size-3.5" />
        {{ props.title }}
      </p>
      <UButton v-if="file || showingExisting" label="Remove" icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" :disabled="scanning" @click="removePhoto" />
    </div>

    <div v-if="file || showingExisting" class="relative mb-3 overflow-hidden rounded-md">
      <img :src="file ? previewUrl! : props.initialSrc!" :alt="props.title" class="h-36 w-full object-cover" />
      <div v-if="scanning" class="absolute inset-0 grid place-items-center bg-black/50">
        <div class="px-4 text-center">
          <UIcon name="i-lucide-loader-circle" class="mx-auto mb-1 size-6 animate-spin text-white" />
          <p class="text-xs text-white/90">{{ scanStatus }}</p>
        </div>
      </div>
    </div>

    <div v-else class="mb-3 grid h-36 place-items-center rounded-md border border-dashed border-default bg-default/50">
      <p class="px-4 text-center text-xs text-muted">{{ props.hint }}</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton :label="file ? 'Replace photo' : 'Upload photo'" icon="i-lucide-camera" color="neutral" variant="outline" size="sm" :disabled="props.disabled || scanning" @click="onPick" />
      <input ref="input" type="file" accept="image/*" capture="environment" class="hidden" @change="onSelected" />
    </div>

    <UAlert v-if="ocrError" color="error" icon="i-lucide-circle-alert" class="mt-2" :description="ocrError" />

    <div v-if="extracted != null" class="mt-3 rounded-md bg-primary/10 px-3 py-2">
      <p class="text-xs text-muted">Meter reading</p>
      <p class="font-semibold text-highlighted">{{ extracted }} {{ props.unit }}</p>
      <p class="mt-0.5 text-[11px] text-muted">Review the value in the field above — you can edit it before saving.</p>
    </div>
  </div>
</template>
