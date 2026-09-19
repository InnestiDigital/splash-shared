<script setup lang="ts">
/**
 * `carousel` slot flow — a horizontal scroll-snap track with arrows and dots.
 *
 * The interaction is ported wholesale from `GallerySectionLayout.vue:47-189`:
 * page-based scrolling by measured item offsets (not by a fixed pixel step, so
 * a variable-width item cannot desynchronise the indicator), autoplay that
 * pauses on hover AND on focus, and a reduced-motion path that jumps instead of
 * animating.
 *
 * Two things deliberately do NOT come from `flowOptions`:
 *
 * - `itemsPerPage` reads the raw viewport width through `carouselItemsPerPage()`
 *   rather than the layout tier. The legacy breakpoints are 640 / 1024, one more
 *   step than the schema's two tiers, and dropping the middle step would put
 *   three items on a 900px tablet.
 * - `interval` comes from `layoutConfig`. It is a `number` setting, and a number
 *   cannot carry `layoutBind` — there is no option list to validate a stored
 *   value against, and an unvalidated value must never reach a style (contract
 *   §3.6). It reaches a `setInterval` here instead, clamped to 3–10s.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { useReducedMotion } from '~/shared/composables/useReducedMotion'
import { useViewport } from '~/shared/composables/useViewport'
import { carouselInterval, carouselItemsPerPage, gapRem, gapToken } from '../resolveLayout'
import { slotBlockKey, type SlotFlowProps } from './types'

const props = defineProps<SlotFlowProps>()

const options = computed(() =>
  'showArrows' in props.flowSlot.flowOptions
    ? props.flowSlot.flowOptions
    : { columns: 3, autoplay: false, interval: 5, showDots: true, showArrows: true },
)

const { innerWidth } = useViewport()
const { isReducedMotion } = useReducedMotion()

const trackRef = ref<HTMLElement>()
const currentPage = ref(0)
const isAutoScrollPaused = ref(false)
let autoScrollTimer: ReturnType<typeof setInterval> | null = null

const itemsPerPage = computed(() => carouselItemsPerPage(options.value.columns, innerWidth.value))
const totalPages = computed(() => Math.max(1, Math.ceil(props.blocks.length / itemsPerPage.value)))

const showArrows = computed(() => options.value.showArrows && totalPages.value > 1)
const showDots = computed(() => options.value.showDots && totalPages.value > 1)
const isAtStart = computed(() => currentPage.value <= 0)
const isAtEnd = computed(() => currentPage.value >= totalPages.value - 1)

const trackStyle = computed(() => ({ gap: gapToken(props.flowSlot.flowOptions.gap) }))

/**
 * Flex basis for one item, gap share subtracted so `count` items plus their
 * gaps add up to exactly the track width (GallerySectionLayout.vue:80-86).
 */
const itemBasis = computed(() => {
  const count = itemsPerPage.value
  if (count === 1) return '100%'
  const percentage = Number((100 / count).toFixed(6))
  const gapShare = Number((gapRem(props.flowSlot.flowOptions.gap) * (count - 1) / count).toFixed(6))
  return `calc(${percentage}% - ${gapShare}rem)`
})

function carouselItems(): HTMLElement[] {
  if (!trackRef.value) return []
  return Array.from(trackRef.value.querySelectorAll<HTMLElement>('.schema-carousel__item'))
}

function pageOffset(page: number): number {
  const items = carouselItems()
  if (!items.length) return 0
  const index = Math.min(page * itemsPerPage.value, items.length - 1)
  return Math.max(0, items[index]!.offsetLeft - items[0]!.offsetLeft)
}

function goToPage(page: number): void {
  if (!trackRef.value) return
  const targetPage = Math.max(0, Math.min(page, totalPages.value - 1))
  trackRef.value.scrollTo({
    left: pageOffset(targetPage),
    behavior: isReducedMotion.value ? 'auto' : 'smooth',
  })
  currentPage.value = targetPage
}

function scroll(direction: 'prev' | 'next'): void {
  goToPage(currentPage.value + (direction === 'next' ? 1 : -1))
}

/** Nearest page to the current scroll offset — the source of truth for the dots. */
function updatePageIndicator(): void {
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

function startAutoScroll(): void {
  stopAutoScroll()
  if (!options.value.autoplay || isAutoScrollPaused.value || isReducedMotion.value || totalPages.value <= 1) return

  const interval = carouselInterval(props.layoutConfig.interval, options.value.interval)
  autoScrollTimer = setInterval(() => {
    if (!trackRef.value || isAutoScrollPaused.value) return
    goToPage(isAtEnd.value ? 0 : currentPage.value + 1)
  }, interval)
}

function stopAutoScroll(): void {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer)
    autoScrollTimer = null
  }
}

function pauseAutoScroll(): void {
  isAutoScrollPaused.value = true
  stopAutoScroll()
}

function resumeAutoScroll(): void {
  isAutoScrollPaused.value = false
  startAutoScroll()
}

async function resetCarousel(): Promise<void> {
  stopAutoScroll()
  currentPage.value = 0
  await nextTick()
  if (!trackRef.value) return
  trackRef.value.scrollTo({ left: 0, behavior: 'auto' })
  updatePageIndicator()
  startAutoScroll()
}

onMounted(resetCarousel)
onUnmounted(stopAutoScroll)

watch([itemsPerPage, () => props.blocks.length], resetCarousel)
watch([isReducedMotion, () => options.value.autoplay, () => props.layoutConfig.interval], () => startAutoScroll())
</script>

<template>
  <div
    class="schema-layout__slot schema-carousel"
    :data-slot-role="flowSlot.role"
    :data-slot-flow="flowSlot.flow"
    :data-collapse="collapse"
    :style="rootStyle"
  >
    <div class="schema-carousel__viewport">
      <button
        v-if="showArrows"
        class="schema-carousel__nav schema-carousel__nav--prev"
        type="button"
        aria-label="Previous items"
        :disabled="isAtStart"
        @click="scroll('prev')"
        @mouseenter="pauseAutoScroll"
        @mouseleave="resumeAutoScroll"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div
        ref="trackRef"
        class="schema-carousel__track"
        :style="trackStyle"
        @scroll.passive="updatePageIndicator"
        @mouseenter="pauseAutoScroll"
        @mouseleave="resumeAutoScroll"
        @focusin="pauseAutoScroll"
        @focusout="resumeAutoScroll"
      >
        <div
          v-for="entry in blocks"
          :key="slotBlockKey(entry)"
          class="schema-carousel__item"
          :style="{ flexBasis: itemBasis }"
        >
          <PlacementWrapper :placement="entry.block.placement">
            <component :is="entry.component" v-bind="entry.props" />
          </PlacementWrapper>
        </div>
      </div>

      <button
        v-if="showArrows"
        class="schema-carousel__nav schema-carousel__nav--next"
        type="button"
        aria-label="Next items"
        :disabled="isAtEnd"
        @click="scroll('next')"
        @mouseenter="pauseAutoScroll"
        @mouseleave="resumeAutoScroll"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div
      v-if="showDots"
      class="schema-carousel__pagination"
      role="navigation"
      aria-label="Gallery pagination"
    >
      <button
        v-for="(page, idx) in totalPages"
        :key="`dot-${idx}`"
        class="schema-carousel__dot"
        type="button"
        :class="{ 'is-active': currentPage === idx }"
        :aria-label="`Go to page ${idx + 1}`"
        :aria-current="currentPage === idx ? 'page' : undefined"
        @click="goToPage(idx)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Ported from GallerySectionLayout.vue:396-562, minus its window-width media
// block: the engine's structural-media-query scan covers this directory, and
// the mobile sizing below keys on the TS-owned `data-collapse` attribute
// instead — same threshold (BREAKPOINTS.md), decided in one place.
//
// (The scan matches on source text and does not strip comments, so spelling
// that at-rule out here would flag the file. Worth knowing before writing one.)
.schema-carousel {
  display: flex;
  flex-direction: column;
  min-width: 0;

  &__viewport {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    min-width: 0;
  }

  &__track {
    flex: 1;
    min-width: 0;
    display: flex;
    overflow-x: auto;
    scroll-behavior: smooth;
    scrollbar-width: none;
    padding: 0.4rem 0;
    scroll-snap-type: x mandatory;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__item {
    flex-shrink: 0;
    min-width: 0;
    overflow: hidden;
    scroll-snap-align: start;

    // CSS-16: cover-size only the block's PRIMARY media image.
    :deep(img[data-target='media']) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  &__nav {
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    width: 4.8rem;
    height: 4.8rem;
    border: 0.1rem solid var(--section-border, var(--border-color, #ddd));
    border-radius: 50%;
    background: var(--section-bg, var(--color-background, #fff));
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

  &__pagination {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  &__dot {
    width: 1.2rem;
    height: 1.2rem;
    border: 0.1rem solid var(--color-primary, #007bff);
    border-radius: 50%;
    background: var(--section-bg, var(--color-background, #fff));
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

  // Mobile paint tweaks, keyed on the TS-owned collapse state rather than a
  // window `@media` — the decision path is `resolveLayoutTier()`.
  &[data-collapse='stack'] {
    .schema-carousel__viewport {
      gap: 0.75rem;
    }

    .schema-carousel__nav {
      width: 4rem;
      height: 4rem;

      svg {
        width: 1.6rem;
        height: 1.6rem;
      }
    }

    .schema-carousel__pagination {
      gap: 0.6rem;
      margin-top: 1rem;
    }

    .schema-carousel__dot {
      width: 0.8rem;
      height: 0.8rem;
    }
  }
}
</style>
