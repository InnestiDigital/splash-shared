import type { PresetOutput } from '../types'

/**
 * Color Shift — scroll-driven color transition on text.
 * Scrub-driven: no duration/easing.
 */
export function colorShift(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, color: 'var(--color-text, inherit)' },
      { offset: 1, color: 'var(--color-primary, #0066cc)' },
    ],
    presetId: 'color-shift',
    presetVersion: '1.0',
    channels: ['color'],
  }
}
