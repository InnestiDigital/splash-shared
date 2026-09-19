import type { PresetOutput } from '../types'

/**
 * Parallax Fast preset — aggressive vertical parallax driven by scroll.
 *
 * Translates from 0% to -30% on the Y axis as the element
 * scrolls through the viewport. Scrub-driven: no duration/easing.
 */
export function parallaxFast(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { y: '0%' } },
      { offset: 1, transform: { y: '-30%' } },
    ],
    presetId: 'parallax-fast',
    presetVersion: '1.0',
  }
}
