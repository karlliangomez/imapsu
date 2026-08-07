<script setup lang="ts">
withDefaults(defineProps<{ size?: string }>(), { size: 'size-9' })

const failed = ref(false)
</script>

<template>
  <span
    v-if="failed"
    class="grid shrink-0 select-none place-items-center rounded-lg bg-gold-400 text-maroon-900 shadow-sm"
    :class="size"
  >
    <UIcon name="i-lucide-map" class="size-1/2" />
  </span>
  <img
    v-else
    src="/logo.png"
    alt="iMapSU logo"
    class="select-none rounded-lg object-contain shadow-sm"
    :class="size"
    @error="failed = true"
  />
</template>
