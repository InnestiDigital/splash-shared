import type { PresetOutput } from '../types'

/**
 * Hover Lift preset — subtle upward translation on hover.
 *
 * Translates element 8px upward to create a "lift" effect.
 * Duration is explicitly set (300ms) because hover presets
 * require quick, responsive feedback — not inheritable defaults.
 */
export function hoverLift(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { y: '0px' } },
      { offset: 1, transform: { y: '-8px' } },
    ],
    presetId: 'hover-lift',
    presetVersion: '1.0',
    duration: 300,
    easing: 'ease-out',
  }
}
