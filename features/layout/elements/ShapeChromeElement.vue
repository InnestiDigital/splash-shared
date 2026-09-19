<script setup lang="ts">
import { computed } from 'vue'
import type { ShapeChromeElement } from '~/shared/types/layout'
import { anchorStyles, baseChromeStyles, rotationTransform, hideBelowAttr } from '../chromeStyle'

const props = defineProps<{ element: ShapeChromeElement }>()

const visible = computed(() => props.element.enabled !== false)

const styles = computed(() => {
  const e = props.element
  const anchor = anchorStyles(e.anchor, e.offsetX, e.offsetY)
  const transform = rotationTransform(e.rotation, anchor.transform)
  const style: Record<string, string> = {
    ...baseChromeStyles(e),
    backgroundColor: e.color,
    width: e.width,
    height: e.height,
    ...anchor,
  }
  if (transform) style.transform = transform
  if (e.shape === 'circle') style.borderRadius = '50%'
  else if (e.shape === 'pill') style.borderRadius = '9999px'
  else if (e.radius) style.borderRadius = e.radius
  return style
})

const hideBelow = computed(() => hideBelowAttr(props.element.hideBelow))
</script>

<template>
  <div
    v-if="visible"
    data-chrome-element="shape"
    :data-hide-below="hideBelow"
    :style="styles"
  />
</template>
