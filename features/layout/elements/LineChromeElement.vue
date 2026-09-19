<script setup lang="ts">
import { computed } from 'vue'
import type { LineChromeElement } from '~/shared/types/layout'
import { anchorStyles, baseChromeStyles, hideBelowAttr } from '../chromeStyle'

const props = defineProps<{ element: LineChromeElement }>()

const visible = computed(() => props.element.enabled !== false)

const styles = computed(() => {
  const e = props.element
  const isVertical = e.orientation === 'vertical'
  return {
    ...baseChromeStyles(e),
    backgroundColor: e.color,
    width: isVertical ? e.thickness : e.length,
    height: isVertical ? e.length : e.thickness,
    ...anchorStyles(e.anchor, e.offsetX, e.offsetY),
  }
})

const hideBelow = computed(() => hideBelowAttr(props.element.hideBelow))
</script>

<template>
  <div
    v-if="visible"
    data-chrome-element="line"
    :data-hide-below="hideBelow"
    :style="styles"
  />
</template>
