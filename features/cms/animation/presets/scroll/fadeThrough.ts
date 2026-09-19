import type { PresetOutput } from '../types'

/**
 * Fade Through preset — fade in then fade out driven by scroll.
 *
 * Three keyframes: opacity 0 → 1 → 0 at offsets 0 / 0.5 / 1.
 * Creates a window of visibility as the element scrolls through
 * the viewport. Scrub-driven: no duration/easing.
 */
export function fadeThrough(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 0.5, opacity: 1 },
      { offset: 1, opacity: 0 },
    ],
    presetId: 'fade-through',
    presetVersion: '1.0',
  }
}
