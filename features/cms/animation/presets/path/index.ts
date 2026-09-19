import type { PresetMeta } from '~/shared/types/animation'
import { pathArc } from './pathArc'
import { pathWave } from './pathWave'
import { pathSCurve } from './pathSCurve'
import { pathDiagonalDrift } from './pathDiagonalDrift'

export { pathArc, pathWave, pathSCurve, pathDiagonalDrift }

export const pathPresets: PresetMeta[] = [
  {
    id: 'path-arc',
    name: 'Path — Arc',
    group: 'safe',
    category: 'scroll',
    factory: pathArc,
    knobs: [
      { id: 'direction', type: 'enum', options: ['up', 'down', 'left', 'right'], default: 'up' },
      { id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
    ] as const,
    targetKinds: ['media', 'decorative', 'text', 'root'],
    maxAmplitude: { text: 'md' },
  },
  {
    id: 'path-wave',
    name: 'Path — Wave',
    group: 'safe',
    category: 'scroll',
    factory: pathWave,
    knobs: [
      { id: 'direction', type: 'enum', options: ['horizontal', 'vertical'], default: 'horizontal' },
      { id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
      { id: 'cycles', type: 'enum', options: [1, 2, 3], default: 1 },
    ] as const,
    targetKinds: ['media', 'decorative'],
  },
  {
    id: 'path-s-curve',
    name: 'Path — S Curve',
    group: 'safe',
    category: 'scroll',
    factory: pathSCurve,
    knobs: [
      { id: 'direction', type: 'enum', options: ['horizontal', 'vertical'], default: 'horizontal' },
      { id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
    ] as const,
    targetKinds: ['media', 'decorative', 'text', 'root'],
    maxAmplitude: { text: 'md' },
  },
  {
    id: 'path-diagonal-drift',
    name: 'Path — Diagonal Drift',
    group: 'safe',
    category: 'scroll',
    factory: pathDiagonalDrift,
    knobs: [
      { id: 'direction', type: 'enum', options: ['up-right', 'down-right', 'up-left', 'down-left'], default: 'up-right' },
      { id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
    ] as const,
    targetKinds: ['media', 'decorative', 'text', 'root'],
    maxAmplitude: { text: 'md' },
  },
]
