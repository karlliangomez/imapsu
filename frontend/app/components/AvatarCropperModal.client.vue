<script setup lang="ts">
import { Cropper, RectangleStencil } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = defineProps<{ open: boolean; src: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; cropped: [blob: Blob] }>()

const cropper = ref<{ getResult: () => { canvas?: HTMLCanvasElement | null }; zoom?: (factor: number) => void } | null>(null)
const busy = ref(false)

const zoom = (factor: number) => {
  cropper.value?.zoom?.(factor)
}

const confirmCrop = () => {
  const result = cropper.value?.getResult()
  const canvas = result?.canvas
  if (!canvas) return
  busy.value = true
  canvas.toBlob((blob) => {
    busy.value = false
    if (blob) {
      emit('cropped', blob)
    }
  }, 'image/png')
}

const close = () => emit('update:open', false)
</script>

<template>
  <UModal
    :open="open"
    :ui="{ body: 'p-4 sm:p-5', footer: 'p-4 sm:p-5' }"
    title="Crop your profile photo"
    description="Drag to frame your photo, then confirm. The result is saved as a square image."
    @update:open="(value) => emit('update:open', value)"
  >
    <template #body>
      <div class="grid min-h-72 place-items-center overflow-hidden rounded-xl bg-muted/50">
        <Cropper
          v-if="src"
          ref="cropper"
          :src="src"
          :stencil-component="RectangleStencil"
          :stencil-props="{ aspectRatio: 1 }"
          class="h-72 w-full"
        />
      </div>

      <div class="mt-4 flex items-center justify-center gap-2">
        <UButton square size="sm" color="neutral" variant="outline" icon="i-lucide-zoom-out" aria-label="Zoom out" @click="zoom(0.8)" />
        <UButton square size="sm" color="neutral" variant="outline" icon="i-lucide-zoom-in" aria-label="Zoom in" @click="zoom(1.25)" />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="close" />
        <UButton label="Crop & upload" icon="i-lucide-crop" :loading="busy" @click="confirmCrop" />
      </div>
    </template>
  </UModal>
</template>
