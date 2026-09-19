<script setup lang="ts">
/**
 * `layered` slot flow — free placement, scoped to one slot.
 *
 * The same substrate that drives a brand-canvas page (`CanvasSectionLayout`,
 * `shared/features/layout-interaction/`), wired over this slot's blocks instead
 * of the whole page's, inside a box whose height the schema states. That scoping
 * is the entire difference: an ordinary page keeps all its sections, keeps its
 * motion, and gains one region where blocks carry `placement.canvas`
 * coordinates.
 *
 * Reading order is DOM order is `position` order, and paint order follows it —
 * `canvasLayerItem()` derives `zIndex` from the index and ignores any authored
 * value, so the navigation tree and the rendered stack can never disagree.
 *
 * Both collapse modes are handled here rather than by a second component:
 * - `stack` — at the floor tier the surface reports no items, every
 *   `PlacementWrapper` falls back to normal flow, and `slotFlowStyle()` has
 *   already made the root a flex column.
 * - `scale` — the composition survives; the zone is scaled down from
 *   `designWidth`, and `LayoutScaleContent` tells the blocks inside they are
 *   still that wide so they do not each collapse to their own mobile layout.
 *
 * Contract: docs/architecture/section-layout-engine-contract.md §7.
 */
import { computed, ref } from 'vue'
import type { ResolvedBlock } from '~/shared/types/sectionTypes'
import { LAYERED_DEFAULT_DESIGN_WIDTH } from '~/shared/types/sectionTypes'
import { useCanvasLayerSurface } from '~/shared/features/cms/placement/useCanvasLayerSurface'
import { useViewport } from '~/shared/composables/useViewport'
import { computeScale } from '~/shared/features/layout/computeScale'
import LayoutScaleContent from '~/shared/features/layout/LayoutScaleContent.vue'
import { isLayeredOptions, stacksAtFloor } from '../resolveLayout'
import LayeredLayers from './LayeredLayers.vue'
import type { SlotFlowProps } from './types'

const props = defineProps<SlotFlowProps>()

const options = computed(() =>
  isLayeredOptions(props.flowSlot.flowOptions) ? props.flowSlot.flowOptions : null,
)

/** DOM order is the documented reading order, so it is authored order. */
const blocks = computed<ResolvedBlock[]>(() =>
  [...props.blocks].sort((a, b) => (a.block?.position ?? 0) - (b.block?.position ?? 0)),
)

/** False only for the `stack` fallback at the floor tier. */
const positioned = computed(() => {
  const resolved = options.value
  return resolved === null ? false : !stacksAtFloor(resolved, props.collapse)
})

const designWidth = computed(() => options.value?.designWidth ?? LAYERED_DEFAULT_DESIGN_WIDTH)
const scaling = computed(() =>
  options.value?.collapse === 'scale' && props.collapse === 'stack',
)

const { innerWidth } = useViewport()

const scale = computed(() =>
  computeScale(innerWidth.value, {
    containerMode: 'full-bleed',
    insetX: 'none',
    overflowX: 'hidden',
    responsiveMode: 'scale',
    designWidth: designWidth.value,
  }),
)

/**
 * The scaler is laid out at `1 / scale` of the box in both axes and then scaled
 * back down from its top-left corner, so it occupies the box exactly. Percentage
 * layer coordinates resolve against the pre-transform size, which is what keeps
 * the composition identical rather than merely similar.
 */
const scalerStyle = computed<Record<string, string>>(() => {
  const factor = scale.value
  const base = { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%' }
  if (!scaling.value || factor >= 1) return base
  const inverse = `${100 / factor}%`
  return {
    ...base,
    width: inverse,
    height: inverse,
    transform: `scale(${factor})`,
    transformOrigin: 'top left',
  }
})

const surfaceRef = ref<HTMLElement | null>(null)

// Gestures are measured against the un-scaled surface, not the slot root: in
// `scale` mode those are different boxes, and measuring the outer one would make
// every drag land short by the scale factor.
const surface = useCanvasLayerSurface({
  surfaceId: `${props.flowSlot.role}:${props.flowSlot.zone ?? 'placed'}`,
  blocks,
  canvasEl: surfaceRef,
  positioned,
})
</script>

<template>
  <div
    class="schema-layout__slot schema-layout__slot--layered"
    :data-slot-role="flowSlot.role"
    :data-slot-flow="flowSlot.flow"
    :data-layered-collapse="options?.collapse"
    :data-layered-positioned="positioned ? 'true' : 'false'"
    :style="rootStyle"
    @pointerdown="surface.onPointerDownCanvas"
  >
    <div v-if="positioned" ref="surfaceRef" class="schema-layout__layered-surface" :style="scalerStyle">
      <LayoutScaleContent v-if="scaling" :design-width="designWidth">
        <LayeredLayers :blocks="blocks" />
      </LayoutScaleContent>
      <LayeredLayers v-else :blocks="blocks" />
    </div>

    <!-- collapse: "stack" at the floor tier — position-ordered single column. -->
    <LayeredLayers v-else :blocks="blocks" />
  </div>
</template>

<style lang="scss" scoped>
// No `@media`: whether this slot positions or stacks is `resolveCollapse`'s
// answer, reaching CSS as `data-layered-positioned`.
.schema-layout__layered-surface {
  isolation: isolate;
}
</style>
