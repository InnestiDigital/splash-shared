<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import type { ResolvedLayoutConfig } from '~/shared/types/layout'
import { RESOLVED_LAYOUT_KEY } from './layoutInjectionKey'
import { useLayoutScale } from './useLayoutScale'

// Mirror the LayoutShell scale-content geometry so chrome elements with
// `coordSpace: 'design'` position themselves relative to the design canvas
// (e.g. `offsetX: 20%` of designWidth) and uniformly scale with the page
// content. The wrapper is fixed to the viewport; its inner pixel width
// equals designWidth and the scale matches the content scale.
//
// In breakpoint mode this layer is not mounted (renderer guards). When the
// layout switches to scale mode at a smaller viewport, design-space chrome
// shrinks proportionally with the canvas — a 1px line in design coords
// will visually be sub-pixel at small scales (acceptable trade-off; if a
// chrome element should stay viewport-scale, leave coordSpace='viewport').
const resolvedLayout = inject<Ref<ResolvedLayoutConfig> | null>(RESOLVED_LAYOUT_KEY, null)

const scale = useLayoutScale(() => resolvedLayout?.value?.frame ?? { containerMode: 'content', insetX: 'md', overflowX: 'visible' })

const designWidthCss = computed(() => `${resolvedLayout?.value?.frame.designWidth ?? 1440}px`)
const scaleOriginAttr = computed(() => resolvedLayout?.value?.frame.scaleOrigin ?? 'top-center')
const layerStyle = computed<Record<string, string>>(() => ({
  '--layout-design-width': designWidthCss.value,
  '--layout-scale': String(scale.value),
}))
</script>

<template>
  <div
    class="layout-design-chrome"
    data-chrome-layer="design"
    :data-scale-origin="scaleOriginAttr"
    :style="layerStyle"
  >
    <slot />
  </div>
</template>

<style scoped>
/* Design-coords mirror: same width as the design canvas so children's `%`
   offsets resolve against designWidth pixels; same scale + origin as the
   scale-content wrapper so positions align visually with content.

   Height is the inverse-scaled viewport so the wrapper, AFTER the transform
   scale, visually covers the full viewport. Without this, a child sized at
   100% (or 100vh) of the layer would scale down with the canvas and stop
   short of the viewport edge — e.g. a vertical line set to span the page
   would only reach `100vh × scale` (60vh at scale 0.6).

   Authors writing design-coords chrome should use `100%` of the layer for
   "fill the viewport vertically" rather than `100vh` (which is viewport-
   relative and gets scaled down by the transform). */
.layout-design-chrome {
  position: fixed;
  top: 0;
  width: var(--layout-design-width, 1440px);
  height: calc(100vh / var(--layout-scale, 1));
  pointer-events: none;
  overflow: visible;
}

.layout-design-chrome[data-scale-origin="top-left"] {
  left: 0;
  transform: scale(var(--layout-scale, 1));
  transform-origin: top left;
}

.layout-design-chrome[data-scale-origin="top-center"] {
  left: 50%;
  transform: translateX(-50%) scale(var(--layout-scale, 1));
  transform-origin: top center;
}
</style>
