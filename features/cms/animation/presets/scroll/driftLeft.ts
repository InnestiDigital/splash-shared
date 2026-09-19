import type { PresetOutput } from '../types'

/**
 * Drift Left preset — horizontal drift to the left on scroll.
 *
 * Translates from 0% to -10% on the X axis as the element
 * scrolls through the viewport. Scrub-driven: no duration/easing.
 */
export function driftLeft(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { x: '0%' } },
      { offset: 1, transform: { x: '-10%' } },
    ],
    presetId: 'drift-left',
    presetVersion: '1.0',
  }
}
