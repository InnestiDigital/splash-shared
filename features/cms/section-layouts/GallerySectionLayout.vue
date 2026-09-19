<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import type { BlocksByRole, GalleryLayoutConfig } from '~/shared/types/sectionTypes'
import { useReducedMotion } from '~/shared/composables/useReducedMotion'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { resolveCollapse } from '~/shared/features/cms/composition/responsive'
import { useViewport } from '~/shared/composables/useViewport'

const props = defineProps<{
  section: any
  layoutConfig: Record<string, any>
  blocksByRole: BlocksByRole
}>()

const config = computed(() => props.layoutConfig as GalleryLayoutConfig)

const headingBlocks = computed(() => props.blocksByRole['section-heading'] ?? [])
const bodyBlocks = computed(() => props.blocksByRole['editorial-body'] ?? [])
const galleryBlocks = computed(() => props.blocksByRole['media-gallery'] ?? [])
const ctaBlocks = computed(() => props.blocksByRole['section-cta'] ?? [])

const layoutClass = computed(() => `gallery-layout--${config.value.layout ?? 'grid'}`)

// Responsive collapse descriptor — owned by TS, consumed by CSS via the
// `data-collapse` attribute (SPL-131). Keeps the column-cap `@media` out of
// the decision path so happy-dom tests can assert the collapse state directly.
// Gallery only reads `stack`; chrome fields are inert for this template.
const { innerWidth } = useViewport()
const collapse = computed(() =>
  resolveCollapse('gallery', config.value as Record<string, unknown>, innerWidth.value),
)
const collapseAttr = computed(() => (collapse.value.stack ? 'stack' : 'flow'))

function isLargeItem(idx: number, pattern?: string): boolean {
  switch (pattern) {
    case 'first': return idx === 0
    case 'alternating': return idx % 2 === 0
    case 'every-third':
    default: return idx % 3 === 0
  }
}
const columnsVar = computed(() => config.value.columns ?? 3)
// Both vocabularies, for the reason spelled out in `stackGapMap.ts`: the
// `2026_08_25_000003` migration rewrote authored gaps to the spacing tiers, and
// this component is now the kill-switch path that has to render them.
const gapRemMap: Record<string, number> = {
  none: 0, sm: 0.5, md: 1.5, lg: 3, xl: 4.8,
  tight: 0.5, normal: 1.5, loose: 3, spacious: 3,
}
const gapRem = computed(() => gapRemMap[config.value.gap ?? 'md'] ?? gapRemMap.md)
const gapVar = computed(() => gapRem.value === 0 ? '0' : `${gapRem.value}rem`)

// Carousel state
const { isReducedMotion } = useReducedMotion()
const trackRef = ref<HTMLElement>()
const currentPage = ref(0)
let autoScrollTimer: ReturnType<typeof setInterval> | null = null
const isAutoScrollPaused = ref(false)

// Carousel computed
const isCarousel = computed(() => config.value.layout === 'carousel')

const itemsPerPage = computed(() => {
  const width = innerWidth.value
  const desktopCols = Math.max(1, Math.min(4, Number(config.value.carouselColumns ?? 3) || 3))
  if (width <= 640) return 1
  if (width <= 1024) return Math.min(desktopCols, 2)
  return desktopCols
})

const totalPages = computed(() => {
  if (!isCarousel.value) return 1
  return Math.ceil(galleryBlocks.value.length / itemsPerPage.value)
})

const showPaginationDots = computed(() => {
  return isCarousel.value && (config.value.showDots ?? true) && totalPages.value > 1
})

const showNavArrows = computed(() => {
  return isCarousel.value && (config.value.showArrows ?? true) && totalPages.value > 1
})

const isAtStart = computed(() => currentPage.value <= 0)
const isAtEnd = computed(() => currentPage.value >= totalPages.value - 1)
const carouselItemBasis = computed(() => {
  const count = itemsPerPage.value
  if (count === 1) return '100%'
  const percentage = Number((100 / count).toFixed(6))
  const gapShare = Number((gapRem.value * (count - 1) / count).toFixed(6))
  return `calc(${percentage}% - ${gapShare}rem)`
})

// Carousel functions
function carouselItems(): HTMLElement[] {
  if (!trackRef.value) return []
  return Array.from(trackRef.value.querySelectorAll<HTMLElement>('.gallery-layout__carousel-item'))
}

function pageOffset(page: number): number {
  const items = carouselItems()
  if (!items.length) return 0
  const index = Math.min(page * itemsPerPage.value, items.length - 1)
  return Math.max(0, items[index].offsetLeft - items[0].offsetLeft)
}

function scroll(direction: 'prev' | 'next') {
  goToPage(currentPage.value + (direction === 'next' ? 1 : -1))
}

function goToPage(page: number) {
  if (!trackRef.value) return
  const targetPage = Math.max(0, Math.min(page, totalPages.value - 1))
  trackRef.value.scrollTo({
    left: pageOffset(targetPage),
    behavior: isReducedMotion.value ? 'auto' : 'smooth',
  })
  currentPage.value = targetPage
}

function updatePageIndicator() {
  const track = trackRef.value
  if (!track || totalPages.value <= 1) {
    currentPage.value = 0
    return
  }
  let closestPage = 0
  let closestDistance = Number.POSITIVE_INFINITY
  for (let page = 0; page < totalPages.value; page += 1) {
    const distance = Math.abs(track.scrollLeft - pageOffset(page))
    if (distance < closestDistance) {
      closestPage = page
      closestDistance = distance
    }
  }
  currentPage.value = closestPage
}

function startAutoScroll() {
  stopAutoScroll()
  const shouldAutoplay = config.value.autoplay ?? false
  if (!shouldAutoplay || isAutoScrollPaused.value || !isCarousel.value || isReducedMotion.value || totalPages.value <= 1) return

  const interval = Math.max(3, Math.min(10, Number(config.value.interval ?? 5) || 5)) * 1000
  autoScrollTimer = setInterval(() => {
    if (!trackRef.value || isAutoScrollPaused.value) return
    goToPage(isAtEnd.value ? 0 : currentPage.value + 1)
  }, interval)
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer)
    autoScrollTimer = null
  }
}

function pauseAutoScroll() {
  isAutoScrollPaused.value = true
  stopAutoScroll()
}

function resumeAutoScroll() {
  isAutoScrollPaused.value = false
  startAutoScroll()
}

async function resetCarousel() {
  stopAutoScroll()
  currentPage.value = 0
  await nextTick()
  if (!isCarousel.value || !trackRef.value) return
  trackRef.value.scrollTo({ left: 0, behavior: 'auto' })
  updatePageIndicator()
  startAutoScroll()
}

// Lifecycle
onMounted(async () => {
  await resetCarousel()
})

onUnmounted(() => {
  stopAutoScroll()
})

watch(
  [isCarousel, itemsPerPage, () => galleryBlocks.value.length],
  resetCarousel,
)

watch(
  [isReducedMotion, () => config.value.autoplay, () => config.value.interval],
  () => startAutoScroll(),
)
</script>

<template>
  <div class="gallery-layout" :class="layoutClass" :data-collapse="collapseAttr">
    <!-- section-heading: single block, top of section -->
    <div v-if="headingBlocks[0]" class="gallery-layout__heading">
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

    <!-- editorial-body: optional intro text between heading and gallery -->
    <div v-if="bodyBlocks.length" class="gallery-layout__intro">
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
    </div>

    <!-- media-gallery: multiple blocks rendered in chosen layout pattern -->
    <template v-if="galleryBlocks.length">
      <!-- Carousel Layout -->
      <div v-if="isCarousel" class="gallery-layout__carousel-container">
        <!-- Left Arrow -->
        <button
          v-if="showNavArrows"
          class="gallery-layout__carousel-nav gallery-layout__carousel-nav--prev"
          @click="scroll('prev')"
          @mouseenter="pauseAutoScroll"
          @mouseleave="resumeAutoScroll"
          aria-label="Previous items"
          :disabled="isAtStart"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        <!-- Carousel Track -->
        <div
          class="gallery-layout__carousel-track"
          ref="trackRef"
          @scroll.passive="updatePageIndicator"
          @mouseenter="pauseAutoScroll"
          @mouseleave="resumeAutoScroll"
          @focusin="pauseAutoScroll"
          @focusout="resumeAutoScroll"
          :style="{ '--gallery-gap': gapVar }"
        >
          <div
            v-for="b in galleryBlocks"
            :key="b.block._previewId || b.block.id"
            class="gallery-layout__carousel-item"
            :style="{ flexBasis: carouselItemBasis }"
          >
            <PlacementWrapper :placement="b.block.placement">
              <component :is="b.component" v-bind="b.props" />
            </PlacementWrapper>
          </div>
        </div>

        <!-- Right Arrow -->
        <button
          v-if="showNavArrows"
          class="gallery-layout__carousel-nav gallery-layout__carousel-nav--next"
          @click="scroll('next')"
          @mouseenter="pauseAutoScroll"
          @mouseleave="resumeAutoScroll"
          aria-label="Next items"
          :disabled="isAtEnd"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Pagination Dots -->
      <div v-if="showPaginationDots" class="gallery-layout__carousel-pagination" role="navigation" aria-label="Gallery pagination">
        <button
          v-for="(page, idx) in totalPages"
          :key="`dot-${idx}`"
          class="gallery-layout__carousel-pagination-dot"
          :class="{ 'is-active': currentPage === idx }"
          @click="goToPage(idx)"
          :aria-label="`Go to page ${idx + 1}`"
          :aria-current="currentPage === idx ? 'page' : undefined"
        />
      </div>

      <!-- Grid/Masonry/Strip Layout -->
      <div
        v-if="!isCarousel"
        class="gallery-layout__grid"
        :style="{ '--gallery-columns': columnsVar, '--gallery-gap': gapVar }"
      >
        <div
          v-for="(b, idx) in galleryBlocks"
          :key="b.block._previewId || b.block.id"
          class="gallery-layout__item"
          :class="{ 'gallery-layout__item--large': config.layout === 'strip' && isLargeItem(idx, config.stripPattern) }"
        >
          <PlacementWrapper :placement="b.block.placement">
            <component :is="b.component" v-bind="b.props" />
          </PlacementWrapper>
        </div>
      </div>
    </template>

    <!-- section-cta: bottom -->
    <div v-if="ctaBlocks.length" class="gallery-layout__cta">
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
.gallery-layout {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-width: 0;

  &__heading {
    // alignment controlled by block (SectionHeading.textAlign)
  }

  &__intro {
    // alignment and width controlled by block (EditorialText.textAlign / EditorialText.maxWidth)
  }

  &__grid {
    display: grid;
    gap: var(--gallery-gap, 1.5rem);
    min-width: 0;
  }

  // Grid mode — equal-size cells
  &--grid &__grid {
    grid-template-columns: repeat(var(--gallery-columns, 3), 1fr);
  }

  // Masonry mode — CSS columns (wide browser support)
  &--masonry &__grid {
    display: block;
    column-count: var(--gallery-columns, 3);
    column-gap: var(--gallery-gap, 1.5rem);
  }
  &--masonry &__item {
    break-inside: avoid;
    margin-bottom: var(--gallery-gap, 1.5rem);
  }

  // Strip mode — single row, alternating large/small
  &--strip &__grid {
    grid-template-columns: repeat(var(--gallery-columns, 3), 1fr);
  }
  &--strip &__item--large {
    grid-column: span 2;
  }

  &__item {
    min-width: 0;
    overflow: hidden;

    // CSS-16: cover-size only the block's PRIMARY media image, not every
    // descendant <img>. Rich item blocks (e.g. FigureCaption) can carry
    // caption/credit imagery and icons that must NOT be stretched to fill
    // the cell. Every media block tags its primary image with
    // `data-target="media"` (the shared media-primary contract also used by
    // scene animation targeting), so we key on that instead of a bare
    // `:deep(img)` or a fragile depth selector — ImageBanner nests its <img>
    // four levels deep, so `:deep(> * > img)` would silently miss it.
    :deep(img[data-target='media']) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__cta {
    text-align: center;
  }

  // Carousel mode
  &__carousel-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    min-width: 0;
  }

  &__carousel-track {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: var(--gallery-gap, 1.5rem);
    overflow-x: auto;
    scroll-behavior: smooth;
    scrollbar-width: none;
    padding: 0.4rem 0;
    scroll-snap-type: x mandatory;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__carousel-item {
    flex-shrink: 0;
    min-width: 0;
    overflow: hidden;
    scroll-snap-align: start;

    // CSS-16: see &__item — cover-size only the primary media image
    // (`data-target="media"`), never caption/icon imagery inside rich blocks.
    :deep(img[data-target='media']) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__carousel-nav {
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    width: 4.8rem;
    height: 4.8rem;
    border: 0.1rem solid var(--border-color, #ddd);
    border-radius: 50%;
    background: var(--color-background, #fff);
    color: var(--section-text, var(--color-text, #333));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    padding: 0;

    svg {
      width: 2rem;
      height: 2rem;
    }

    &:hover:not(:disabled) {
      background: var(--color-primary-subtle, #f0f0f0);
    }

    &:active:not(:disabled) {
      background: var(--color-primary-subtle, #f0f0f0);
      transform: scale(0.95);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: 0.2rem solid var(--color-primary, #007bff);
      outline-offset: 0.2rem;
      box-shadow: 0 0 0 0.3rem rgba(0, 123, 255, 0.25);
    }
  }

  &__carousel-pagination {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  &__carousel-pagination-dot {
    width: 1.2rem;
    height: 1.2rem;
    border: 0.1rem solid var(--color-primary, #007bff);
    border-radius: 50%;
    background: var(--color-background, #fff);
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;

    &.is-active {
      background: var(--color-primary, #007bff);
    }

    &:hover:not(.is-active) {
      background: var(--color-primary-subtle, #e7f1ff);
    }

    &:focus-visible {
      outline: 0.2rem solid var(--color-primary, #007bff);
      outline-offset: 0.2rem;
      box-shadow: 0 0 0 0.3rem rgba(0, 123, 255, 0.25);
    }
  }

  // Mobile: 1-2 columns max — BEHAVIOR rules keyed on the TS-owned
  // `data-collapse='stack'` attribute (SPL-131 / CSS-13). The decision path
  // runs through resolveCollapse('gallery') so happy-dom tests can assert it
  // directly; SCSS only paints. `stack` == viewport <= BREAKPOINTS.md, the same
  // threshold the old `@media (max-width: $bp-md)` used (768 inclusive-mobile).
  // (Dart Sass can't compound a BEM `&__` suffix under a rule whose `&`
  // already carries the [data-collapse] attribute suffix, so these are
  // written as explicit top-level compounds.)
  &--grid[data-collapse='stack'] &__grid,
  &--strip[data-collapse='stack'] &__grid {
    grid-template-columns: repeat(min(var(--gallery-columns, 3), 2), 1fr);
  }
  &--masonry[data-collapse='stack'] &__grid {
    column-count: min(var(--gallery-columns, 3), 2);
  }
  &--strip[data-collapse='stack'] &__item--large {
    grid-column: span 1;
  }

  // Pure paint tweaks (carousel gaps + nav/pagination sizing) stay as a
  // `$bp-*` @media per the Matteo-approved CSS-12 relaxation — no layout
  // decision here, so they don't need to route through TS.
  @media (max-width: $bp-md) {
    // Carousel mobile styles
    &__carousel-container {
      gap: 0.75rem;
    }

    &__carousel-track {
      gap: 0.75rem;
    }

    &__carousel-nav {
      width: 4rem;
      height: 4rem;

      svg {
        width: 1.6rem;
        height: 1.6rem;
      }
    }

    &__carousel-pagination {
      gap: 0.6rem;
      margin-top: 1rem;
    }

    &__carousel-pagination-dot {
      width: 0.8rem;
      height: 0.8rem;
    }
  }
}
</style>
