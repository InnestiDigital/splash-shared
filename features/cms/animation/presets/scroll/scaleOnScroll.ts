import type { PresetOutput } from '../types'

/**
 * Scale On Scroll preset — gradual scale increase driven by scroll.
 *
 * Scales from 0.9 to 1.05 as the element scrolls through
 * the viewport. Scrub-driven: no duration/easing.
 */
export function scaleOnScroll(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { scale: 0.9 } },
      { offset: 1, transform: { scale: 1.05 } },
    ],
    presetId: 'scale-on-scroll',
    presetVersion: '1.0',
  }
}
