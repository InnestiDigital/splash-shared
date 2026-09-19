<script setup lang="ts">
/**
 * The whole-section free-placement surface, selected by PAGE type
 * (`pageType === 'brand-canvas'`) in `SectionRenderer`.
 *
 * The positioning machinery itself lives in `useCanvasLayerSurface`, shared with
 * the `flow: "layered"` slot flow — the same substrate, adapter and
 * `CANVAS_LAYER_CONTEXT`, scoped to a section here and to one slot there. What
 * stays here is the brand-canvas shape: every block on the page, deduplicated
 * across roles and ordered by `position`, in a full-viewport box.
 */
import { computed, ref } from 'vue'
import type { BlocksByRole, ResolvedBlock } from '~/shared/types/sectionTypes'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import {
  blockIdOf,
  useCanvasLayerSurface,
} from '~/shared/features/cms/placement/useCanvasLayerSurface'

const props = defineProps<{
  section: { id: string }
  layoutConfig: Record<string, unknown>
  blocksByRole: BlocksByRole
}>()

const blocks = computed<ResolvedBlock[]>(() => {
  const unique = new Map<string, ResolvedBlock>()
  for (const roleBlocks of Object.values(props.blocksByRole)) {
    for (const resolved of roleBlocks) {
      const id = blockIdOf(resolved)
      if (id && !unique.has(id)) unique.set(id, resolved)
    }
  }
  return [...unique.values()].sort(
    (a, b) => (a.block?.position ?? 0) - (b.block?.position ?? 0),
  )
})

const rootRef = ref<HTMLElement | null>(null)

const surface = useCanvasLayerSurface({
  surfaceId: props.section.id,
  blocks,
  canvasEl: rootRef,
})
</script>

<template>
  <div
    ref="rootRef"
    class="canvas-section-layout"
    data-canvas-layer-host
    @pointerdown="surface.onPointerDownCanvas"
  >
    <PlacementWrapper
      v-for="resolved in blocks"
      :key="blockIdOf(resolved)"
      :block-id="blockIdOf(resolved)"
      :placement="resolved.block.placement"
    >
      <component :is="resolved.component" v-bind="resolved.props" />
    </PlacementWrapper>
  </div>
</template>

<style scoped>
.canvas-section-layout {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  isolation: isolate;
}
</style>
