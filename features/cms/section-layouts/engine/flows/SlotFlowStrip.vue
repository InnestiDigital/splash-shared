<script setup lang="ts">
/**
 * `strip` slot flow — a uniform grid where a pattern of items spans two tracks.
 *
 * Ground truth: `GallerySectionLayout.vue:34-41` (the pattern predicate) and
 * `:366-371` (`grid-column: span 2` on a large item). At the floor tier the
 * span drops back to 1, which legacy expressed as
 * `&--strip[data-collapse='stack'] &__item--large { grid-column: span 1 }`.
 */
import { computed } from 'vue'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { isStripLargeItem } from '../resolveLayout'
import { slotBlockKey, type SlotFlowProps } from './types'
import type { StripPattern } from '~/shared/types/sectionTypes'

const props = defineProps<SlotFlowProps>()

const pattern = computed<StripPattern>(() =>
  'pattern' in props.flowSlot.flowOptions ? props.flowSlot.flowOptions.pattern : 'every-third',
)

/**
 * A large item spans two tracks — but only where there are more than two of
 * them. At the floor tier the grid is capped at two columns, so a spanning item
 * would claim the whole row and turn the strip into a stack.
 */
function itemStyle(index: number): Record<string, string> {
  const large = isStripLargeItem(index, pattern.value) && props.collapse !== 'stack'
  return large ? { gridColumn: 'span 2' } : {}
}
</script>

<template>
  <div
    class="schema-layout__slot schema-layout__slot--strip"
    :data-slot-role="flowSlot.role"
    :data-slot-flow="flowSlot.flow"
    :style="rootStyle"
  >
    <div
      v-for="(entry, index) in blocks"
      :key="slotBlockKey(entry)"
      class="schema-layout__flow-item"
      :data-strip-large="isStripLargeItem(index, pattern) || undefined"
      :style="itemStyle(index)"
    >
      <PlacementWrapper :placement="entry.block.placement">
        <component :is="entry.component" v-bind="entry.props" />
      </PlacementWrapper>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// No `@media` here: both the column cap and the span cap are TS decisions
// (`effectiveColumns()` / `collapse`), written as inline style.
.schema-layout__flow-item {
  min-width: 0;
  overflow: hidden;

  // CSS-16: cover-size only the block's PRIMARY media image — see the same
  // rule in SlotFlowMasonry.vue.
  :deep(img[data-target='media']) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
