import type { PresetOutput } from '../types'

/**
 * Hero Compress — compound scroll preset.
 *
 * Scale down + translateY up as user scrolls. Designed for large
 * display titles that tighten into a compact header-like state.
 * Scrub-driven: no duration/easing.
 */
export function heroCompress(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { y: '0%', scale: 1 } },
      { offset: 1, transform: { y: '-20%', scale: 0.6 } },
    ],
    presetId: 'hero-compress',
    presetVersion: '1.0',
    channels: ['transform'],
  }
}
