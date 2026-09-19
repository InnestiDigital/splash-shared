import type { PresetOutput } from '~/shared/types/animation'
import { AMPLITUDE, type AmplitudeTier } from './constants'

export type DiagonalDirection = 'up-right' | 'down-right' | 'up-left' | 'down-left'

interface DiagonalKnobs {
  direction?: DiagonalDirection
  amplitude?: AmplitudeTier
}

function buildDiagonalPath(direction: DiagonalDirection, a: number): string {
  const dx = direction.endsWith('right') ? 1 : -1
  const dy = direction.startsWith('up')    ? -1 : 1
  const cx = Math.round(dx * 0.66 * a)
  const cy = Math.round(dy * 0.33 * a)
  const ex = dx * a
  const ey = dy * a
  return `path('M 0 0 Q ${cx} ${cy} ${ex} ${ey}')`
}

export function pathDiagonalDrift(knobs: DiagonalKnobs = {}): PresetOutput {
  const direction = knobs.direction ?? 'up-right'
  const amplitude = knobs.amplitude ?? 'md'
  const a = AMPLITUDE[amplitude]
  const path = buildDiagonalPath(direction, a)
  return {
    keyframes: [
      { offset: 0, offsetPath: path, offsetDistance: '0%',   offsetRotate: '0deg', offsetAnchor: 'auto' },
      { offset: 1, offsetPath: path, offsetDistance: '100%', offsetRotate: '0deg', offsetAnchor: 'auto' },
    ],
    presetId: 'path-diagonal-drift',
    presetVersion: '1.0',
    channels: ['motion-path'],
    reducedMotion: 'skip',
  }
}
