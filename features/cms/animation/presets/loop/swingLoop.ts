import type { PresetOutput } from '~/shared/types/animation'

export function swingLoop(): PresetOutput {
  return {
    keyframes: [
      { offset: 0 },
      { offset: 0.25, transform: { rotate: '-6deg' } },
      { offset: 0.5 },
      { offset: 0.75, transform: { rotate: '6deg' } },
      { offset: 1 },
    ],
    presetId: 'swing',
    presetVersion: '1.0',
    duration: 1800,
    easing: 'ease-in-out',
    reducedMotion: 'skip',
    channels: ['transform'],
  }
}
