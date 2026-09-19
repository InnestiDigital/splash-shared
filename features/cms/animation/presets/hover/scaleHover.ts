import type { PresetOutput } from '../types'

/**
 * Hover Scale preset — gentle scale-up on hover.
 *
 * Scales element to 1.04x for a subtle emphasis effect.
 * Duration is explicitly set (250ms) because hover presets
 * require quick, responsive feedback — not inheritable defaults.
 */
export function hoverScale(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { scale: 1 } },
      { offset: 1, transform: { scale: 1.04 } },
    ],
    presetId: 'hover-scale',
    presetVersion: '1.0',
    duration: 250,
    easing: 'ease-out',
  }
}
