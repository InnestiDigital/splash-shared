import { ref, onMounted, onUnmounted } from 'vue'
import type { ReducedMotionMode, AnimationEntry, AnimationScene } from '~/shared/types/animation'

/**
 * Reactive prefers-reduced-motion detection.
 * Returns a ref that updates when the OS accessibility setting changes.
 */
export function useReducedMotion() {
  const isReducedMotion = ref(false)
  let mql: MediaQueryList | null = null

  const update = () => {
    isReducedMotion.value = mql?.matches ?? false
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    isReducedMotion.value = mql.matches
    mql.addEventListener('change', update)
  })

  onUnmounted(() => {
    mql?.removeEventListener('change', update)
    mql = null
  })

  return { isReducedMotion }
}

/**
 * Resolution chain: entry → scene.defaults → theme setting → system default ('fade-only').
 *
 * null/undefined = inherit (check next level).
 * The 'inherit' string is editor UI only, never persisted — not checked here.
 */
export function resolveReducedMotion(
  entry: Pick<AnimationEntry, 'reducedMotion'>,
  scene: Pick<AnimationScene, 'defaults'>,
  themeReducedMotion?: ReducedMotionMode,
): ReducedMotionMode {
  if (entry.reducedMotion != null) return entry.reducedMotion
  if (scene.defaults?.reducedMotion != null) return scene.defaults.reducedMotion
  if (themeReducedMotion != null) return themeReducedMotion
  return 'fade-only'
}
