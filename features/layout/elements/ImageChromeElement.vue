<script setup lang="ts">
import { computed } from 'vue'
import type { ImageChromeElement } from '~/shared/types/layout'
import { anchorStyles, baseChromeStyles, rotationTransform, hideBelowAttr } from '../chromeStyle'

const props = defineProps<{ element: ImageChromeElement }>()

const visible = computed(() => props.element.enabled !== false)

const styles = computed(() => {
  const e = props.element
  const anchor = anchorStyles(e.anchor, e.offsetX, e.offsetY)
  const transform = rotationTransform(e.rotation, anchor.transform)
  const style: Record<string, string> = {
    ...baseChromeStyles(e),
    width: e.width,
    ...anchor,
  }
  if (transform) style.transform = transform
  if (e.height) style.height = e.height
  if (e.objectFit) style.objectFit = e.objectFit
  return style
})

const hideBelow = computed(() => hideBelowAttr(props.element.hideBelow))
</script>

<template>
  <img
    v-if="visible"
    data-chrome-element="image"
    :data-hide-below="hideBelow"
    :src="element.src"
    :alt="element.alt ?? ''"
    :style="styles"
  >
</template>
