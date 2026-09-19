<script setup lang="ts">
import { computed } from 'vue'
import type { BlocksByRole } from '~/shared/types/sectionTypes'
import { STACK_GAP_MAP } from './stackGapMap'

const props = defineProps<{
  section: any
  layoutConfig: Record<string, any>
  blocksByRole: BlocksByRole
}>()

const gapStyle = computed(() => ({
  '--block-gap': STACK_GAP_MAP[props.layoutConfig.stackGap] ?? STACK_GAP_MAP.normal,
}))

</script>

<template>
  <div
    class="stacked-layout"
    :class="[
      layoutConfig.shellLayout ? `stacked-layout--${layoutConfig.shellLayout}` : '',
      layoutConfig.contentAlignment ? `stacked-layout--content-${layoutConfig.contentAlignment}` : '',
    ]"
    :style="gapStyle"
  >
    <div class="stacked-layout__body">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.stacked-layout {
  min-width: 0;

  &__body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--block-gap, 0);
  }

  // Shell layout variants (from layoutConfig.shellLayout)
  &--centered &__body {
    align-items: center;
    text-align: center;
  }

  // Content alignment variants (SPL-060)
  // Applied when shellLayout is "stacked" (default).
  // Default "left" matches existing stacked behavior (no change needed for omitted setting).
  &--content-left &__body {
    align-items: flex-start;
  }

  &--content-center &__body {
    align-items: center;
  }

  &--content-full &__body {
    align-items: stretch;
  }

}
</style>
