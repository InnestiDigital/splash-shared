<script setup lang="ts">
/**
 * `masonry` slot flow — column-balanced flow via CSS multi-column.
 *
 * Ground truth: `GallerySectionLayout.vue:355-363` — `column-count` on the
 * container, `break-inside: avoid` plus a bottom margin on each item (multi-col
 * has no `row-gap`, so the vertical rhythm has to come from the item).
 *
 * The column cap at the floor tier is `resolved.collapse`, not a `@media`:
 * legacy did it with `&--masonry[data-collapse='stack'] { column-count: min(…, 2) }`
 * and the engine keeps the decision in TS (`effectiveColumns`).
 */
import { computed } from 'vue'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { gapToken } from '../resolveLayout'
import { slotBlockKey, type SlotFlowProps } from './types'

const props = defineProps<SlotFlowProps>()

/** Multi-column has no row gap; each item carries the vertical rhythm itself. */
const itemStyle = computed(() => ({ marginBottom: gapToken(props.flowSlot.flowOptions.gap) }))
</script>

<template>
  <div
    class="schema-layout__slot schema-layout__slot--masonry"
    :data-slot-role="flowSlot.role"
    :data-slot-flow="flowSlot.flow"
    :style="rootStyle"
  >
    <div
      v-for="entry in blocks"
      :key="slotBlockKey(entry)"
      class="schema-layout__flow-item"
      :style="itemStyle"
    >
      <PlacementWrapper :placement="entry.block.placement">
        <component :is="entry.component" v-bind="entry.props" />
      </PlacementWrapper>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// No `@media` here: the column cap is `effectiveColumns()` in TS, written into
// the root's inline `column-count`.
.schema-layout__flow-item {
  break-inside: avoid;
  min-width: 0;
  overflow: hidden;

  // CSS-16: cover-size only the block's PRIMARY media image. Rich item blocks
  // carry caption/credit imagery and icons that must NOT be stretched, so this
  // keys on the shared media-primary contract rather than a bare `:deep(img)`.
  :deep(img[data-target='media']) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
