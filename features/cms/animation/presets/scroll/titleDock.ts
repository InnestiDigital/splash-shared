import type { PresetOutput } from '../types'

/**
 * Title Dock — compound scroll preset.
 *
 * Scale down + translateY up + translateX toward left edge. Designed
 * for display text that visually docks toward header/navigation chrome
 * as the user scrolls. Scrub-driven: no duration/easing.
 */
export function titleDock(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, transform: { x: '0%', y: '0%', scale: 1 } },
      { offset: 1, transform: { x: '-15%', y: '-30%', scale: 0.5 } },
    ],
    presetId: 'title-dock',
    presetVersion: '1.0',
    channels: ['transform'],
  }
}
