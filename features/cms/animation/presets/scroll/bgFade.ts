import type { PresetOutput } from '../types'

/**
 * Background Fade — scroll-driven backgroundColor transition.
 * Scrub-driven: no duration/easing.
 */
export function bgFade(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, backgroundColor: 'transparent' },
      { offset: 1, backgroundColor: 'var(--color-primary, #0066cc)' },
    ],
    presetId: 'bg-fade',
    presetVersion: '1.0',
    channels: ['background-color'],
  }
}
