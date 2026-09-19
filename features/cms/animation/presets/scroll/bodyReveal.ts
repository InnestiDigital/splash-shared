import type { PresetOutput } from '../types'

/**
 * Body Reveal — scroll-driven percentage var for editorial body clip-path.
 * Drives --motion-body-reveal from 0% to 100%.
 * Specifically for EditorialText body element.
 * Scrub-driven: no duration/easing.
 */
export function bodyReveal(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, vars: { '--motion-body-reveal': { type: 'percentage', value: '0%' } } },
      { offset: 1, vars: { '--motion-body-reveal': { type: 'percentage', value: '100%' } } },
    ],
    presetId: 'body-reveal',
    presetVersion: '1.0',
    channels: ['--motion-body-reveal'],
  }
}
