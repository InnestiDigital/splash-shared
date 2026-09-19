<script setup lang="ts">
import { provide, toRef } from 'vue'
import { VIEWPORT_OVERRIDE } from '~/shared/composables/useViewport'

const props = defineProps<{ designWidth: number }>()

// Provide design width as the viewport override for any descendant block
// that calls useViewport() (e.g. EditorialSplitSectionLayout). Without this,
// blocks read the actual browser width and collapse to mobile layout even
// though they live inside a desktop-width design canvas that is visually
// scaled by the parent transform.
//
// Component is transparent (renders only its slot) so it does not introduce
// an extra DOM node; the .layout-scale-content wrapper stays in LayoutShell.
provide(VIEWPORT_OVERRIDE, toRef(props, 'designWidth'))
</script>

<template>
  <slot />
</template>
