import { ref, onMounted, onUnmounted, unref, type Ref } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'

interface RevealPreset {
  startOpacity: number
  yOffset?: number
  xOffset?: number
  duration: number
  easing: string
  triggerThreshold: number
}

export interface RevealOptions {
  preset?: string | null
  overrides?: Partial<RevealPreset> | null
  /**
   * When truthy the composable is a no-op: no initial state is applied and
   * no IntersectionObserver is created. Used by SectionRenderer to yield to
   * the AnimationEngine when modern scenes are managing block entrance, so
   * `data-reveal`-tagged elements are not double-animated (SPL-076).
   *
   * Accepts a boolean, Ref<boolean>, or getter for reactive sources.
   */
  disabled?: boolean | Ref<boolean> | (() => boolean)
}

const DEFAULT_PRESET: RevealPreset = {
  startOpacity: 0,
  yOffset: 24,
  duration: 600,
  easing: 'cubic-bezier(.25,.1,.25,1)',
  triggerThreshold: 0.15,
}

// Stagger offsets relative to the title (reference point = 0)
const STAGGER = {
  eyebrow: -100,  // 100ms before title
  title: 0,       // reference point
  intro: 150,     // 150ms after title
}

export function useSectionReveal(sectionEl: Ref<HTMLElement | null>, options: RevealOptions) {
  const hasTriggered = ref(false)
  let observer: IntersectionObserver | null = null

  function resolvePreset(): RevealPreset {
    // Try to resolve from theme config
    let preset: RevealPreset = { ...DEFAULT_PRESET }

    try {
      const { config } = useClientConfig()
      const motion = (config.value as any)?.motion
      const presetName = options.preset || motion?.defaultRevealPreset

      if (presetName && presetName !== 'none' && motion?.revealPresets?.[presetName]) {
        preset = { ...DEFAULT_PRESET, ...motion.revealPresets[presetName] }
      }
    } catch {
      // Outside of setup context — use default
    }

    // Apply per-section overrides
    if (options.overrides) {
      Object.assign(preset, options.overrides)
    }

    return preset
  }

  function setInitialState(el: Element, preset: RevealPreset) {
    const htmlEl = el as HTMLElement
    htmlEl.style.opacity = String(preset.startOpacity)

    const transforms: string[] = []
    if (preset.yOffset) transforms.push(`translateY(${preset.yOffset}px)`)
    if (preset.xOffset) transforms.push(`translateX(${preset.xOffset}px)`)
    if (transforms.length) htmlEl.style.transform = transforms.join(' ')
  }

  function animateElement(el: Element, preset: RevealPreset, delay: number) {
    const htmlEl = el as HTMLElement
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      // Reduced motion: simple fade, no transforms
      htmlEl.animate(
        [
          { opacity: preset.startOpacity },
          { opacity: 1 },
        ],
        { duration: 200, easing: 'ease-out', fill: 'forwards', delay: Math.max(0, delay) },
      )
      htmlEl.style.transform = ''
      return
    }

    const keyframes: Keyframe[] = [
      {
        opacity: preset.startOpacity,
        transform: [
          preset.yOffset ? `translateY(${preset.yOffset}px)` : '',
          preset.xOffset ? `translateX(${preset.xOffset}px)` : '',
        ].filter(Boolean).join(' ') || 'none',
      },
      {
        opacity: 1,
        transform: 'translateY(0) translateX(0)',
      },
    ]

    htmlEl.animate(keyframes, {
      duration: preset.duration,
      easing: preset.easing,
      fill: 'forwards',
      delay: Math.max(0, delay),
    })
  }

  function isDisabled(): boolean {
    const d = options.disabled
    if (d === undefined || d === null) return false
    if (typeof d === 'function') return Boolean(d())
    return Boolean(unref(d))
  }

  onMounted(() => {
    if (!sectionEl.value) return

    // Guard: yield to AnimationEngine when modern scenes manage this page/section.
    // Prevents double WAAPI animations on shared DOM elements (SPL-076).
    if (isDisabled()) return

    const preset = resolvePreset()

    // If preset is 'none', skip all reveal animation
    if (options.preset === 'none') return

    const targets = {
      eyebrow: sectionEl.value.querySelector('[data-reveal="eyebrow"]'),
      title: sectionEl.value.querySelector('[data-reveal="title"]'),
      intro: sectionEl.value.querySelector('[data-reveal="intro"]'),
    }

    // No revealable targets — skip
    if (!targets.eyebrow && !targets.title && !targets.intro) return

    // Set initial hidden states
    for (const el of Object.values(targets)) {
      if (el) setInitialState(el, preset)
    }

    // Create observer
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasTriggered.value) {
            hasTriggered.value = true
            observer?.disconnect()

            // Run staggered animation (title is the reference point at delay 0)
            // Compute base delay so eyebrow starts first (its stagger is negative)
            const baseDelay = Math.abs(Math.min(...Object.values(STAGGER)))

            if (targets.eyebrow) animateElement(targets.eyebrow, preset, baseDelay + STAGGER.eyebrow)
            if (targets.title) animateElement(targets.title, preset, baseDelay + STAGGER.title)
            if (targets.intro) animateElement(targets.intro, preset, baseDelay + STAGGER.intro)
          }
        }
      },
      { threshold: preset.triggerThreshold },
    )

    observer.observe(sectionEl.value)
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { hasTriggered }
}
