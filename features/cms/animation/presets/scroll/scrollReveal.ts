import type { PresetOutput } from '../types'

/**
 * Scroll Reveal — scroll-driven percentage var for clip-path reveal.
 * Drives --motion-reveal (or --motion-body-reveal) from 0% to 100%.
 * Components consume this var in clip-path: inset(0 calc(100% - var(--motion-reveal, 100%)) 0 0).
 * Scrub-driven: no duration/easing.
 */
export function scrollReveal(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, vars: { '--motion-reveal': { type: 'percentage', value: '0%' } } },
      { offset: 1, vars: { '--motion-reveal': { type: 'percentage', value: '100%' } } },
    ],
    presetId: 'scroll-reveal',
    presetVersion: '1.0',
    channels: ['--motion-reveal'],
  }
}
