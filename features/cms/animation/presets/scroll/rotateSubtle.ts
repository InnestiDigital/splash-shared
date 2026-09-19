import type { PresetOutput } from '../types'

/**
 * Rotate Subtle preset — gentle rotation driven by scroll.
 *
 * Rotates from -3deg to 3deg as the element scrolls through
 * the viewport. Scrub-driven: no duration/easing.
 */
export function rotateSubtle(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { rotate: '-3deg' } },
      { offset: 1, transform: { rotate: '3deg' } },
    ],
    presetId: 'rotate-subtle',
    presetVersion: '1.0',
  }
}
