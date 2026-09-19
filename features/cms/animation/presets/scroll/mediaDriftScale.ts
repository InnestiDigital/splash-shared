import type { PresetOutput } from '../types'

/**
 * Media Drift Scale — compound scroll preset.
 *
 * TranslateX + translateY + slight scale-up. Designed for image/media
 * layers that feel dimensional — drifting and growing as the user scrolls.
 * Scrub-driven: no duration/easing.
 */
export function mediaDriftScale(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { x: '0%', y: '0%', scale: 1 } },
      { offset: 1, transform: { x: '8%', y: '-10%', scale: 1.08 } },
    ],
    presetId: 'media-drift-scale',
    presetVersion: '1.0',
    channels: ['transform'],
  }
}
