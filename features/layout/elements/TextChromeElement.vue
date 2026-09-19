<script setup lang="ts">
import { computed } from 'vue'
import type { TextChromeElement } from '~/shared/types/layout'
import { anchorStyles, baseChromeStyles, rotationTransform, hideBelowAttr } from '../chromeStyle'
import { useTypographySlotStyle } from '~/shared/composables/useTypographySlotStyle'

const props = defineProps<{ element: TextChromeElement }>()

const visible = computed(() => props.element.enabled !== false)

// Typography is wired through the existing slot system: the 'chrome' slot is bound
// to the preset key and emits CSS vars (--rt-slot-chrome-*) that paired SCSS
// rules can consume. NOTE: blocks usually expose --rt-slot-* via SCSS theming;
// chrome elements do not have a paired SCSS layer yet, so the slot vars are
// emitted but currently unused — the explicit `color` prop below is the only
// guaranteed paint.
const typographyStyle = useTypographySlotStyle({
  chrome: computed(() => props.element.typographyPresetKey),
})

const styles = computed(() => {
  const e = props.element
  const anchor = anchorStyles(e.anchor, e.offsetX, e.offsetY)
  const transform = rotationTransform(e.rotation, anchor.transform)
  const style: Record<string, string> = {
    ...baseChromeStyles(e),
    ...anchor,
    ...typographyStyle.value,
  }
  if (transform) style.transform = transform
  if (e.color) style.color = e.color
  return style
})

const hideBelow = computed(() => hideBelowAttr(props.element.hideBelow))
</script>

<template>
  <div
    v-if="visible"
    data-chrome-element="text"
    :data-hide-below="hideBelow"
    :style="styles"
  >
    {{ element.text }}
  </div>
</template>
