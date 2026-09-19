import type { PresetOutput } from '../types'

/**
 * Tint Through — scroll-driven --motion-tint CSS var transition.
 * 3-stop color shift: transparent → dark blue → dark.
 * Scrub-driven: no duration/easing.
 *
 * Requires target component to declare --motion-tint in animatableVars
 * and consume it in CSS.
 */
export function tintThrough(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, vars: { '--motion-tint': { type: 'color', value: 'rgba(0,0,0,0)' } } },
      { offset: 0.5, vars: { '--motion-tint': { type: 'color', value: 'rgba(30,61,79,0.6)' } } },
      { offset: 1, vars: { '--motion-tint': { type: 'color', value: 'rgba(0,0,0,0.8)' } } },
    ],
    presetId: 'tint-through',
    presetVersion: '1.0',
    channels: ['--motion-tint'],
  }
}
