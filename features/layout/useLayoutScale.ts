import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useViewport } from '~/shared/composables/useViewport'
import type { LayoutFrameConfig } from '~/shared/types/layout'
import { computeScale } from './computeScale'

/**
 * Reactive scale factor for a layout frame. Reads viewport width via
 * useViewport() so test overrides via VIEWPORT_OVERRIDE work transparently.
 *
 * Accepts the frame config as a ref-or-getter so callers can wire it up
 * to a reactive source (e.g. resolved layout) without unwrapping by hand.
 */
export function useLayoutScale(
  frame: MaybeRefOrGetter<LayoutFrameConfig>,
): ComputedRef<number> {
  const { innerWidth } = useViewport()
  return computed(() => computeScale(innerWidth.value, toValue(frame)))
}
