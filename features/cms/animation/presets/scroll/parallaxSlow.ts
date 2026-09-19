import type { PresetOutput } from '../types'

/**
 * Parallax Slow preset — subtle vertical parallax driven by scroll.
 *
 * Translates from 0% to -15% on the Y axis as the element
 * scrolls through the viewport. Scrub-driven: no duration/easing.
 */
export function parallaxSlow(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { y: '0%' } },
      { offset: 1, transform: { y: '-15%' } },
    ],
    presetId: 'parallax-slow',
    presetVersion: '1.0',
    channels: ['transform'],
  }
}
