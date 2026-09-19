<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutBackgroundConfig } from '~/shared/types/layout'

const props = defineProps<{ background: LayoutBackgroundConfig }>()

const hasBackground = computed(() => {
  const b = props.background
  return Boolean(b.color || b.image || b.overlay || b.texture)
})

const layerStyles = computed(() => {
  const b = props.background
  const style: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    zIndex: '0',
    pointerEvents: 'none',
  }
  if (b.color) style.backgroundColor = b.color
  if (b.image) {
    style.backgroundImage = `url("${b.image.src}")`
    style.backgroundRepeat = b.image.repeat
    style.backgroundSize = b.image.size
    style.backgroundPosition = b.image.position
    style.backgroundAttachment = b.image.attachment
    if (b.image.opacity != null) style.opacity = String(b.image.opacity)
  }
  return style
})

const overlayStyles = computed(() => {
  const o = props.background.overlay
  if (!o) return null
  const style: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    zIndex: '1',
    pointerEvents: 'none',
    backgroundColor: o.color,
    opacity: String(o.opacity),
  }
  if (o.blendMode) style.mixBlendMode = o.blendMode
  return style
})
</script>

<template>
  <template v-if="hasBackground">
    <div data-layout-background :style="layerStyles" />
    <div v-if="overlayStyles" data-layout-background-overlay :style="overlayStyles" />
  </template>
</template>
