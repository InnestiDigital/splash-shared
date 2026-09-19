<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue'
import type { BlocksByRole } from '~/shared/types/sectionTypes'
import type { EditorialSplitLayoutConfig } from '~/shared/types/sectionTypes'
import { STACK_GAP_MAP } from './stackGapMap'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { resolveCollapse } from '~/shared/features/cms/composition/responsive'
import { useViewport } from '~/shared/composables/useViewport'

const props = defineProps<{
  section: any
  layoutConfig: Record<string, any>
  blocksByRole: BlocksByRole
}>()

const config = computed(() => props.layoutConfig as EditorialSplitLayoutConfig)

// Index map provided by DynamicPage — maps editorial-split section IDs to their
// sequential index among editorial-split sections on the page.
const editorialSplitIndexMap = inject<ComputedRef<Record<string, number>>>(
  'editorialSplitIndexMap',
  computed(() => ({})),
)

const sideClass = computed(() => {
  if (config.value.shellSide === 'alternate') {
    const index = editorialSplitIndexMap.value[props.section.id] ?? 0
    // Even index → right (default), odd index → left
    return index % 2 === 0 ? 'editorial-split--side-right' : 'editorial-split--side-left'
  }
  return config.value.shellSide === 'left' ? 'editorial-split--side-left' : 'editorial-split--side-right'
})

const ratioClass = computed(() => {
  const ratio = config.value.contentWidthRatio ?? 'wide-left'
  return `editorial-split--ratio-${ratio}`
})

const gapStyle = computed(() => ({
  '--block-gap': STACK_GAP_MAP[props.layoutConfig.stackGap] ?? '1.5rem',
  '--editorial-col-gap': '2rem', // hardcoded for now; extendable via future colGap setting
}))

const chromeAlignClass = computed(() => {
  const align = config.value.chromeAlign ?? 'sticky-top'
  return `editorial-split--chrome-${align}`
})

const surfaceClass = computed(() =>
  config.value.contentSurface === 'outlined' ? 'editorial-split--surface-outlined' : null,
)

// Responsive collapse descriptor — owned by TS, consumed by CSS via
// `data-collapse` attribute (SPL-131). Keeps `@media` out of the decision
// path so happy-dom tests can assert the collapse state directly.
const { innerWidth } = useViewport()
const collapse = computed(() =>
  resolveCollapse('editorial-split', config.value as Record<string, unknown>, innerWidth.value),
)
const collapseAttr = computed(() => (collapse.value.stack ? 'stack' : 'flow'))

const headingBlocks = computed(() => props.blocksByRole['section-heading'] ?? [])
const bodyBlocks = computed(() => props.blocksByRole['editorial-body'] ?? [])
const supportingBlocks = computed(() => props.blocksByRole['supporting-text'] ?? [])
const galleryBlocks = computed(() => props.blocksByRole['media-gallery'] ?? [])
const mediaChromeBlocks = computed(() => props.blocksByRole['media-chrome'] ?? [])
const ctaBlocks = computed(() => props.blocksByRole['section-cta'] ?? [])
</script>

<template>
  <div
    class="editorial-split"
    :class="[ratioClass, sideClass, chromeAlignClass, surfaceClass, { 'editorial-split--show-separator': config.showSeparators }]"
    :style="gapStyle"
    :data-collapse="collapseAttr"
  >
    <div class="editorial-split__content">
      <!-- section-heading: hard-capped at single (spec rule 6) — render only first -->
      <PlacementWrapper
        v-if="headingBlocks[0]"
        :key="headingBlocks[0].block._previewId || headingBlocks[0].block.id"
        :placement="headingBlocks[0].block.placement"
      >
        <component
          :is="headingBlocks[0].component"
          v-bind="headingBlocks[0].props"
        />
      </PlacementWrapper>
      <PlacementWrapper
        v-for="b in bodyBlocks"
        :key="b.block._previewId || b.block.id"
        :placement="b.block.placement"
      >
        <component
          :is="b.component"
          v-bind="b.props"
        />
      </PlacementWrapper>
      <PlacementWrapper
        v-for="b in galleryBlocks"
        :key="b.block._previewId || b.block.id"
        :placement="b.block.placement"
      >
        <component
          :is="b.component"
          v-bind="b.props"
        />
      </PlacementWrapper>
    </div>
    <aside class="editorial-split__chrome-side" :data-collapse="collapseAttr">
      <PlacementWrapper
        v-for="b in supportingBlocks"
        :key="b.block._previewId || b.block.id"
        :placement="b.block.placement"
      >
        <component
          :is="b.component"
          v-bind="b.props"
        />
      </PlacementWrapper>
      <PlacementWrapper
        v-for="b in mediaChromeBlocks"
        :key="b.block._previewId || b.block.id"
        :placement="b.block.placement"
      >
        <component
          :is="b.component"
          v-bind="b.props"
        />
      </PlacementWrapper>
      <PlacementWrapper
        v-for="b in ctaBlocks"
        :key="b.block._previewId || b.block.id"
        :placement="b.block.placement"
      >
        <component
          :is="b.component"
          v-bind="b.props"
        />
      </PlacementWrapper>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.editorial-split {
  display: grid;
  gap: var(--editorial-col-gap, 2rem);
  align-items: start;
  min-width: 0;

  // Width ratios
  // minmax(0,…) on every track: bare fr defaults to minmax(auto,Xfr), so an
  // oversized media child forces min-content and can blow the grid past the
  // section width (image ghost bleeding into the next row). The 0 floor keeps
  // each column inside its share regardless of intrinsic child size. WP13.
  &--ratio-equal { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  &--ratio-wide-left { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  &--ratio-wide-right { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  &--ratio-sidebar-left { grid-template-columns: minmax(0, 1fr) minmax(0, 4fr); }
  &--ratio-sidebar-right { grid-template-columns: minmax(0, 4fr) minmax(0, 1fr); }
  // content ≈26% — ref-measured narrow content column (vs wide-right's 33%)
  &--ratio-narrow-left { grid-template-columns: minmax(0, 1fr) minmax(0, 2.85fr); }

  // Opt-in outlined content card — thin themeable border around the content column.
  &--surface-outlined &__content {
    border: 1px solid var(--content-surface-border, #d8d8d8);
    padding: clamp(1.2rem, 2vw, 2rem);
  }

  // Side placement
  &--side-left {
    .editorial-split__chrome-side { order: -1; }
  }

  &__content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--block-gap, 1.5rem);
  }

  &__chrome-side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--block-gap, 1.5rem);
  }

  // Chrome alignment variants
  &--chrome-sticky-top &__chrome-side {
    position: sticky;
    top: calc(var(--header-height, 0px) + 2rem);
    align-self: start;
  }

  &--chrome-center &__chrome-side {
    align-self: center;
  }

  &--chrome-top &__chrome-side {
    align-self: start;
  }

  &--chrome-bottom &__chrome-side {
    align-self: end;
  }

  &__separator {
    grid-column: 1 / -1;
    border: none;
    border-top: 1px solid var(--section-border, #e8e8e8);
    margin: var(--editorial-col-gap, 2rem) 0 0;
  }

  // Vertical separator: border on the content column edge facing the chrome side
  &--show-separator &__content {
    border-right: 1px solid var(--section-border, #e8e8e8);
    padding-right: 2rem;
  }

  // When chrome side is on the left, the border should be on the left edge of content
  &--show-separator#{&}--side-left &__content {
    border-right: none;
    padding-right: 0;
    border-left: 1px solid var(--section-border, #e8e8e8);
    padding-left: 2rem;
  }

  // Mobile collapse — keyed on data-collapse attribute so the decision
  // path runs through TS (resolveCollapse) and stays unit-testable in
  // happy-dom. SCSS still paints; see SPL-131 / composition-responsive.md.
  //
  // R1 (SPL-131): chrome always stacks *below* content on mobile, even when
  // shellSide: 'left' would place it first on desktop. Intentional for
  // consistent readability on narrow screens.
  &[data-collapse='stack'] {
    grid-template-columns: 1fr;

    .editorial-split__chrome-side {
      position: static;
      align-self: auto;
      order: 1;
    }
  }

  // Drop the vertical separator when the layout has collapsed to a stack —
  // the border would otherwise appear under the content. Written as an
  // explicit compound selector because `&--show-separator` can't suffix the
  // attribute selector above.
  &[data-collapse='stack']#{&}--show-separator &__content {
    border-right: none;
    padding-right: 0;
    border-left: none;
    padding-left: 0;
  }
}
</style>
