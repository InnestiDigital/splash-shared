import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import { useReducedMotion } from '~/shared/composables/useReducedMotion'
import type { HeaderState, CompactTrigger } from '~/shared/types/headerZone'

const EASING_FUNCTIONS: Record<string, (t: number) => number> = {
  'linear': (t) => t,
  'ease': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
}

function resolveEasing(name: string): (t: number) => number {
  return EASING_FUNCTIONS[name] ?? EASING_FUNCTIONS['ease-out']
}

const HYSTERESIS_PX = 5

export interface StateMachineOptions {
  trigger: CompactTrigger
  duration: number
  easing: string
  /** Test-only override for reduced motion detection */
  reducedMotionOverride?: Ref<boolean>
}

export function useHeaderStateMachine(options: StateMachineOptions) {
  const { isReducedMotion } = useReducedMotion()
  const reducedMotion = options.reducedMotionOverride ?? isReducedMotion

  const state = ref<HeaderState>('expanded')
  const transitionProgress = ref(0)
  const isCompact = computed(() => state.value === 'compact')
  const isTransitioning = computed(() =>
    state.value === 'transitioning-to-compact' || state.value === 'transitioning-to-expanded',
  )
  const transitionDirection = computed(() => {
    if (state.value === 'transitioning-to-compact') return 'to-compact' as const
    if (state.value === 'transitioning-to-expanded') return 'to-expanded' as const
    return null
  })

  let resolvedThresholdPx = 0
  let rafId: number | null = null
  let startTime: number | null = null

  function resolveThreshold(): number {
    if (options.trigger.unit === 'vh') {
      return (options.trigger.value / 100) * window.innerHeight
    }
    return options.trigger.value
  }

  function startTransition(targetState: 'compact' | 'expanded') {
    const direction: HeaderState =
      targetState === 'compact' ? 'transitioning-to-compact' : 'transitioning-to-expanded'

    if (reducedMotion.value) {
      state.value = targetState
      transitionProgress.value = targetState === 'compact' ? 1 : 0
      return
    }

    state.value = direction
    transitionProgress.value = 0
    startTime = null

    if (rafId != null) cancelAnimationFrame(rafId)

    const easingFn = resolveEasing(options.easing)

    function tick(now: number) {
      if (startTime === null) {
        startTime = now
        rafId = requestAnimationFrame(tick)
        return
      }

      const elapsed = now - startTime
      const rawProgress = Math.min(elapsed / options.duration, 1)
      const easedProgress = easingFn(rawProgress)

      transitionProgress.value = targetState === 'compact' ? easedProgress : 1 - easedProgress

      if (rawProgress >= 1) {
        state.value = targetState
        transitionProgress.value = targetState === 'compact' ? 1 : 0
        rafId = null
        startTime = null
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
  }

  function onScroll() {
    const scrollY = window.scrollY
    const threshold = resolvedThresholdPx

    if (state.value === 'expanded' && scrollY >= threshold + HYSTERESIS_PX) {
      startTransition('compact')
    } else if (state.value === 'compact' && scrollY < threshold - HYSTERESIS_PX) {
      startTransition('expanded')
    }
    // If already transitioning, do not interrupt — the rAF plays to completion.
    // Mid-transition scroll changes are intentionally ignored.
  }

  onMounted(() => {
    resolvedThresholdPx = resolveThreshold()
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return {
    state,
    transitionProgress,
    isCompact,
    isTransitioning,
    transitionDirection,
  }
}
