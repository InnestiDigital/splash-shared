<script setup lang="ts">
import { computed } from 'vue'
import type { BlocksByRole } from '~/shared/types/sectionTypes'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { useViewport } from '~/shared/composables/useViewport'
import { resolveHeroMediaPosition, heroViewportFor, heroMediaPositionCss } from './heroMediaPosition'

const props = defineProps<{
  section: any
  layoutConfig: Record<string, any>
  blocksByRole: BlocksByRole
}>()

const headingBlocks = computed(() => props.blocksByRole['section-heading'] ?? [])
const galleryBlocks = computed(() => props.blocksByRole['media-gallery'] ?? [])
const ctaBlocks = computed(() => props.blocksByRole['section-cta'] ?? [])

const { innerWidth } = useViewport()
const mediaPositionCss = computed(() =>
  heroMediaPositionCss(resolveHeroMediaPosition(props.layoutConfig, heroViewportFor(innerWidth.value))),
)
</script>

<template>
  <div
    class="hero-layout"
    :class="[
      `hero-layout--height-${layoutConfig.height || 'viewport'}`,
      `hero-layout--align-${layoutConfig.contentAlign || 'center'}`
    ]"
  >
    <!--
      media-gallery: background layer, absolute positioned.
      NOTE: Reuses the global "media-gallery" role vocabulary as a pragmatic compromise.
      Semantically "hero-media" or "media-primary" would be more accurate, but keeping
      the shared role name avoids fragmenting the role vocabulary. See user feedback on SPL-003.
      Single-slot enforcement: layout renders only galleryBlocks[0]. Additional blocks
      assigned to this role are ignored here. Ideally, validation/admin should also warn
      when multiple blocks target a single-slot role (not yet implemented).
    -->
    <!--
      SPL-077: Expose mediaPosition as an inheritable CSS custom property
      (`--hero-media-position`) so media blocks that render backgrounds via
      `background-image` on a <div>/<section> (e.g. HeroBlock) can consume it
      via `background-position`. The `:deep(> *)` rule below still maps it to
      `object-position` for replaced-element blocks (ImageBanner <img>, future
      <video>). Custom properties inherit naturally — both approaches coexist.
    -->
    <div
      v-if="galleryBlocks[0]"
      class="hero-layout__media"
      :style="{ '--hero-media-position': mediaPositionCss }"
    >
      <PlacementWrapper
        :key="galleryBlocks[0].block._previewId || galleryBlocks[0].block.id"
        :placement="galleryBlocks[0].block.placement"
      >
        <component
          :is="galleryBlocks[0].component"
          v-bind="galleryBlocks[0].props"
        />
      </PlacementWrapper>
    </div>

    <!--
      section-heading: centered overlay, hard-capped at single block.
      Same single-slot enforcement note as media-gallery above.
    -->
    <div v-if="headingBlocks[0]" class="hero-layout__heading">
      <PlacementWrapper
        :key="headingBlocks[0].block._previewId || headingBlocks[0].block.id"
        :placement="headingBlocks[0].block.placement"
      >
        <component
          :is="headingBlocks[0].component"
          v-bind="headingBlocks[0].props"
        />
      </PlacementWrapper>
    </div>

    <!-- section-cta: bottom-aligned -->
    <div v-if="ctaBlocks.length" class="hero-layout__cta">
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
    </div>

  </div>
</template>

<style lang="scss" scoped>
.hero-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;

  // Height variants
  &--height-viewport {
    min-height: 100vh;
    min-height: 100svh;
  }

  &--height-large {
    min-height: 80vh;
    min-height: 80svh;
  }

  &--height-medium {
    min-height: 60vh;
    min-height: 60svh;
  }

  &--height-auto {
    min-height: 0;
  }

  &__media {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;

    // CSS-16: split the slotted-child contract into two tiers.
    //
    // Tier 1 — layout necessity: ANY direct slotted block must fill the media
    // zone, so width/height stay on `:deep(> *)`.
    :deep(> *) {
      width: 100%;
      height: 100%;
    }

    // Tier 2 — replaced-element sizing: `object-fit`/`object-position` only
    // affect replaced elements (<img>, <video>, <canvas>), so scope them to
    // direct <img>/<video> children. Non-replaced blocks (e.g. HeroBlock's
    // <div>/<section>) already consume --hero-media-position themselves via
    // background-position — applying object-* to them was inert noise. See
    // SPL-077.
    :deep(> img),
    :deep(> video) {
      object-fit: cover;
      object-position: var(--hero-media-position, center);
    }
  }

  &__heading {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  // Content alignment variants
  // Positions heading block within the hero section via flexbox overrides.
  // Default "center" ensures backward compat with pre-SPL-021 sections.
  &--align-center &__heading {
    align-items: center;
    justify-content: center;
  }

  &--align-bottom-left &__heading {
    align-items: flex-end;
    justify-content: flex-start;
  }

  &--align-bottom-center &__heading {
    align-items: flex-end;
    justify-content: center;
  }

  &--align-bottom-right &__heading {
    align-items: flex-end;
    justify-content: flex-end;
  }

  &--align-top-left &__heading {
    align-items: flex-start;
    justify-content: flex-start;
  }

  &--align-top-center &__heading {
    align-items: flex-start;
    justify-content: center;
  }

  &--align-top-right &__heading {
    align-items: flex-start;
    justify-content: flex-end;
  }

  &__cta {
    position: relative;
    z-index: 1;
    margin-top: auto;
    min-width: 0;
  }

}
</style>
