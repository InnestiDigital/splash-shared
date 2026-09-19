import type { PresetOutput } from '~/shared/types/animation'

export function breatheLoop(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, opacity: 1 },
      { offset: 0.5, opacity: 0.9, transform: { scale: 0.98 } },
      { offset: 1, opacity: 1 },
    ],
    presetId: 'breathe',
    presetVersion: '1.0',
    duration: 3200,
    easing: 'cubic-bezier(.4,0,.6,1)',
    reducedMotion: 'skip',
    channels: ['transform', 'opacity'],
  }
}
