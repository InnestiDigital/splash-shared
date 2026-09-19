<script setup lang="ts">
/**
 * The block list of a `layered` slot, as its own component so
 * `SlotFlowLayered.vue` states each of its three containers once instead of
 * repeating the loop inside them.
 *
 * It renders the same markup whether the slot is positioning or stacked: a
 * `PlacementWrapper` carrying `blockId`, which is what lets the wrapper look
 * itself up in `CANVAS_LAYER_CONTEXT`. When that context reports no items — the
 * `collapse: "stack"` floor tier — the wrapper finds nothing and lays the block
 * out in normal flow, with no branch here.
 */
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { blockIdOf } from '~/shared/features/cms/placement/useCanvasLayerSurface'
import type { ResolvedBlock } from '~/shared/types/sectionTypes'
import { slotBlockKey } from './types'

defineProps<{ blocks: ResolvedBlock[] }>()
</script>

<template>
  <PlacementWrapper
    v-for="entry in blocks"
    :key="slotBlockKey(entry)"
    :block-id="blockIdOf(entry)"
    :placement="entry.block.placement"
  >
    <component :is="entry.component" v-bind="entry.props" />
  </PlacementWrapper>
</template>
