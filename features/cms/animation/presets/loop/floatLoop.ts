import type { PresetOutput } from '~/shared/types/animation'

export function floatLoop(): PresetOutput {
  return {
    keyframes: [
      { offset: 0 },
      { offset: 0.5, transform: { y: '-10px' } },
      { offset: 1 },
    ],
    presetId: 'float',
    presetVersion: '1.0',
    duration: 2500,
    easing: 'ease-in-out',
    reducedMotion: 'skip',
    channels: ['transform'],
  }
}
