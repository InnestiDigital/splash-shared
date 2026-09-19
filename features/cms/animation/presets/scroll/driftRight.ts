import type { PresetOutput } from '../types'

/**
 * Drift Right preset — horizontal drift to the right on scroll.
 *
 * Translates from 0% to 10% on the X axis as the element
 * scrolls through the viewport. Scrub-driven: no duration/easing.
 */
export function driftRight(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { x: '0%' } },
      { offset: 1, transform: { x: '10%' } },
    ],
    presetId: 'drift-right',
    presetVersion: '1.0',
  }
}
