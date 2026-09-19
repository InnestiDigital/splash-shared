import { computed, onMounted, onUnmounted, type Ref } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'

export interface EntranceRevealOptions {
  /** Elements to reveal. Defaults to explicit opt-in via [data-entrance]. */
  selector?: string
}

/**
 * Viewport-entry reveal for TEMPLATE-rendered pages (structured templates
 * bypass the block pipeline, so DynamicPage's auto-entrance scenes never
 * reach them — /lavori, /diario and article pages had no entrances at all).
 *
 * Behavior mirrors the engine's auto-entrance and reads the same theme
 * motion config: fade from opacity 0 on intersection, after
 * `motion.entranceDelay`, staggered by `motion.defaultChoreography.baseDelay`
 * within each observer batch, triggered at `motion.entranceThreshold`.
 *
 * Late-appearing matches (async lists, e.g. ArticleList inside the blog-index
 * template) are picked up via MutationObserver. Reduced motion → no-op
 * (content stays fully visible, exactly like the engine's downgrade path).
 */
export function useEntranceReveal(
  rootRef: Ref<HTMLElement | null>,
  options: EntranceRevealOptions = {},
) {
  const selector = options.selector ?? '[data-entrance]'

  // Resolve theme motion config in setup scope (composable rules).
  let motionCfg = computed<Record<string, any>>(() => ({}))
  try {
    const { config } = useClientConfig()
    motionCfg = computed(() => ((config.value as any)?.motion ?? {}) as Record<string, any>)
  } catch { /* outside setup / no config — fall back to defaults */ }

  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null
  const prepared = new WeakSet<Element>()
  const revealed = new WeakSet<Element>()
  // Track pre-hidden elements so teardown can never strand invisible content.
  const hidden = new Set<HTMLElement>()

  onMounted(() => {
    const root = rootRef.value
    if (!root) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const m = motionCfg.value
    const baseDelay = Number(m.entranceDelay ?? 0) || 0
    const stagger = Number(m.defaultChoreography?.baseDelay ?? 80) || 0
    const duration = Number(m.defaultDuration ?? 600) || 600
    const easing = typeof m.defaultEasing === 'string' ? m.defaultEasing : 'cubic-bezier(.25,.1,.25,1)'
    const threshold = Number(m.entranceThreshold ?? 0.15) || 0

    // Ratio-based thresholds are meaningless for targets taller than the
    // viewport: their max achievable intersectionRatio (vh / elementHeight)
    // stays below the configured threshold, so a single-threshold observer
    // would never fire and the element is stranded at its prepare()-time
    // opacity:0 (a permanently blank void — SPL / entrance-tall-sections).
    // Observe at [0, threshold] and treat a very tall target (> 70% of the
    // viewport) as triggered on ANY intersection; normal-sized targets keep
    // firing exactly at the ref-tuned threshold, so their feel is unchanged.
    const thresholds = threshold > 0 ? [0, threshold] : [0]

    io = new IntersectionObserver((entries) => {
      // Stagger within the batch that entered together (same rhythm as the
      // engine's section choreography).
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      let batchIdx = 0
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        if (revealed.has(el)) continue
        // Very tall targets reveal on any intersection; normal targets wait
        // for the configured ratio (the observer also reports the 0 crossing).
        const isTall = vh > 0 && entry.boundingClientRect.height > vh * 0.7
        if (!isTall && entry.intersectionRatio < threshold) continue
        revealed.add(el)
        io?.unobserve(el)
        const anim = el.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration, easing, delay: baseDelay + batchIdx * stagger, fill: 'both' },
        )
        anim.addEventListener('finish', () => {
          // Return the element to its natural (visible) state and drop the
          // animation so finished reveals hold no WAAPI residue.
          el.style.removeProperty('opacity')
          hidden.delete(el)
          anim.cancel()
        }, { once: true })
        batchIdx++
      }
    }, { threshold: thresholds })

    const prepare = (el: HTMLElement) => {
      if (prepared.has(el)) return
      prepared.add(el)
      el.style.opacity = '0'
      hidden.add(el)
      io?.observe(el)
    }

    root.querySelectorAll<HTMLElement>(selector).forEach(prepare)

    // Async content (loading lists) — reveal matches as they appear.
    mo = new MutationObserver(() => {
      root.querySelectorAll<HTMLElement>(selector).forEach(prepare)
    })
    mo.observe(root, { childList: true, subtree: true })
  })

  onUnmounted(() => {
    io?.disconnect()
    io = null
    mo?.disconnect()
    mo = null
    for (const el of hidden) el.style.removeProperty('opacity')
    hidden.clear()
  })
}
