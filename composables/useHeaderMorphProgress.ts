import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface HeaderMorphProgressOptions {
  /**
   * Fixed scroll distance (px) over which progress runs 0→1. When set, the
   * trigger-element measurement is skipped entirely (used by 'editorial-slide',
   * whose reference choreography completes within the first ~400px of scroll).
   */
  distancePx?: number
  /** Trigger anchor when no fixed distance is given. Default 'hero-section'. */
  triggerAnchor?: 'hero-section' | 'first-section'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Continuous scroll-linked morph progress for header choreographies.
 * Progress runs 0→1 over a fixed distance or the height of a trigger section,
 * rAF-throttled. Consumers publish it as a `--morph-t` CSS custom property and
 * let stylesheet rules own every visual of the choreography.
 */
export function useHeaderMorphProgress(options: HeaderMorphProgressOptions = {}): { progress: Ref<number> } {
  const progress = ref(0)
  let scrollRaf: number | null = null
  let triggerBottom = 0

  function findTriggerElement(): HTMLElement | null {
    if (options.triggerAnchor !== 'first-section') {
      const hero = document.querySelector<HTMLElement>('[data-section-role="hero"]')
      if (hero) return hero
    }
    return document.querySelector<HTMLElement>('[data-section-id]')
  }

  function onScroll() {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null
      if (triggerBottom <= 0) {
        progress.value = 0
        return
      }
      progress.value = clamp(window.scrollY / triggerBottom, 0, 1)
    })
  }

  onMounted(() => {
    if (options.distancePx && options.distancePx > 0) {
      triggerBottom = options.distancePx
    } else {
      const trigger = findTriggerElement()
      triggerBottom = trigger
        ? trigger.getBoundingClientRect().bottom + window.scrollY
        : window.innerHeight
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf)
      scrollRaf = null
    }
  })

  return { progress }
}
