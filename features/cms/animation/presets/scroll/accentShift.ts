import type { PresetOutput } from '../types'

/**
 * Accent Shift — scroll-driven color var for accent elements.
 * Drives --motion-accent through 3 color stops.
 * Components consume this var on markers, connectors, line/dot decorations.
 * Scrub-driven: no duration/easing.
 */
export function accentShift(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, vars: { '--motion-accent': { type: 'color', value: 'rgba(30,61,79,1)' } } },
      { offset: 0.5, vars: { '--motion-accent': { type: 'color', value: 'rgba(16,138,0,1)' } } },
      { offset: 1, vars: { '--motion-accent': { type: 'color', value: 'rgba(108,99,255,1)' } } },
    ],
    presetId: 'accent-shift',
    presetVersion: '1.0',
    channels: ['--motion-accent'],
  }
}
