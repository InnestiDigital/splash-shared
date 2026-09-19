import type { PresetOutput } from '~/shared/types/animation'
import { AMPLITUDE, type AmplitudeTier } from './constants'

export type ArcDirection = 'up' | 'down' | 'left' | 'right'

interface ArcKnobs {
  direction?: ArcDirection
  amplitude?: AmplitudeTier
}

function buildArcPath(direction: ArcDirection, a: number): string {
  switch (direction) {
    case 'up':    return `path('M 0 0 Q ${a} -${a} ${2 * a} 0')`
    case 'down':  return `path('M 0 0 Q ${a} ${a} ${2 * a} 0')`
    case 'left':  return `path('M 0 0 Q -${a} ${a} 0 ${2 * a}')`
    case 'right': return `path('M 0 0 Q ${a} ${a} 0 ${2 * a}')`
  }
}

export function pathArc(knobs: ArcKnobs = {}): PresetOutput {
  const direction = knobs.direction ?? 'up'
  const amplitude = knobs.amplitude ?? 'md'
  const a = AMPLITUDE[amplitude]
  const path = buildArcPath(direction, a)
  return {
    keyframes: [
      { offset: 0, offsetPath: path, offsetDistance: '0%',   offsetRotate: '0deg', offsetAnchor: 'auto' },
      { offset: 1, offsetPath: path, offsetDistance: '100%', offsetRotate: '0deg', offsetAnchor: 'auto' },
    ],
    presetId: 'path-arc',
    presetVersion: '1.0',
    channels: ['motion-path'],
    reducedMotion: 'skip',
  }
}
