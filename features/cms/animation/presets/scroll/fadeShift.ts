import type { PresetOutput } from '../types'

/**
 * Fade Shift — compound scroll preset.
 *
 * Opacity fade-out + translateX drift. Designed for taglines, captions,
 * or secondary text that exits the composition as the user scrolls.
 * Starts fully visible (opacity: 1) — safe for scroll mount.
 * Scrub-driven: no duration/easing.
 */
export function fadeShift(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, opacity: 1, transform: { x: '0%' } },
      { offset: 1, opacity: 0, transform: { x: '-20%' } },
    ],
    presetId: 'fade-shift',
    presetVersion: '1.0',
    channels: ['opacity', 'transform'],
  }
}
