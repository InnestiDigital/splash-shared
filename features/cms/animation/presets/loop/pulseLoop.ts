import type { PresetOutput } from '~/shared/types/animation'

export function pulseLoop(): PresetOutput {
  return {
    keyframes: [
      { offset: 0,   color: 'rgb(34, 34, 34)' },
      { offset: 0.4, color: 'rgb(16, 138, 0)' },
      { offset: 1,   color: 'rgb(34, 34, 34)' },
    ],
    presetId: 'pulse',
    presetVersion: '1.0',
    duration: 1500,
    easing: 'ease-in-out',
    reducedMotion: 'skip',
    channels: ['color'],
  }
}
