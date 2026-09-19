<script setup lang="ts">
/**
 * `stack` and `grid` slot flows.
 *
 * Both put the blocks straight into the slot root — a flex column for `stack`,
 * uniform `minmax(0, 1fr)` tracks for `grid` — so there is nothing to render
 * between the root and the blocks. `slotFlowStyle()` already decided which.
 *
 * Contract: docs/architecture/section-layout-engine-contract.md §3.5.
 */
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { slotBlockKey, type SlotFlowProps } from './types'

defineProps<SlotFlowProps>()
</script>

<template>
  <div
    class="schema-layout__slot"
    :data-slot-role="flowSlot.role"
    :data-slot-flow="flowSlot.flow"
    :style="rootStyle"
  >
    <PlacementWrapper
      v-for="entry in blocks"
      :key="slotBlockKey(entry)"
      :placement="entry.block.placement"
    >
      <component :is="entry.component" v-bind="entry.props" />
    </PlacementWrapper>
  </div>
</template>
