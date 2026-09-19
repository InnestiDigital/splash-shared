import type { SceneConditions } from '~/shared/types/animation'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

/**
 * Evaluate scene conditions against current viewport and device capabilities.
 * All specified conditions must pass (AND logic).
 * Returns true if no conditions are set or all conditions are met.
 */
export function evaluateConditions(conditions: SceneConditions | undefined): boolean {
  if (!conditions) return true

  const { minBreakpoint, maxBreakpoint, pointer } = conditions

  // Return true for empty object
  if (minBreakpoint == null && maxBreakpoint == null && pointer == null) return true

  const width = typeof window !== 'undefined' ? window.innerWidth : 0

  if (minBreakpoint != null) {
    const min = BREAKPOINTS[minBreakpoint]
    if (width < min) return false
  }

  if (maxBreakpoint != null) {
    const max = BREAKPOINTS[maxBreakpoint]
    // maxBreakpoint means "up to but not including the next breakpoint"
    // i.e. maxBreakpoint: 'md' means width < lg threshold
    if (width >= max) return false
  }

  if (pointer != null && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const isFine = window.matchMedia('(pointer: fine)').matches
    if (pointer === 'fine' && !isFine) return false
    if (pointer === 'coarse' && isFine) return false
  }

  return true
}
