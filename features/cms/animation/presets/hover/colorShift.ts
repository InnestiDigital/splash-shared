import type { PresetOutput } from '../types'

/**
 * Hover Color Shift preset — overlay opacity effect on hover.
 *
 * Fades an overlay from 0 to 15% opacity, creating a tint/highlight.
 * Duration is explicitly set (200ms) because hover presets
 * require quick, responsive feedback — not inheritable defaults.
 */
export function hoverColorShift(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 0.15 },
    ],
    presetId: 'hover-color-shift',
    presetVersion: '1.0',
    duration: 200,
    easing: 'ease-out',
  }
}
