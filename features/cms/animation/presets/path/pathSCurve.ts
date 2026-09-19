import type { PresetOutput } from '~/shared/types/animation'
import { AMPLITUDE, type AmplitudeTier } from './constants'

export type SCurveDirection = 'horizontal' | 'vertical'

interface SCurveKnobs {
  direction?: SCurveDirection
  amplitude?: AmplitudeTier
}

function buildSCurvePath(direction: SCurveDirection, a: number): string {
  // Horizontal: M 0 0 C 0.75a 0 0.75a -a 1.5a -a S 2.25a 0 3a 0
  const c = 0.75 * a
  const midX = 1.5 * a
  const sC2 = 2.25 * a
  const endX = 3 * a
  if (direction === 'horizontal') {
    return `path('M 0 0 C ${c} 0 ${c} -${a} ${midX} -${a} S ${sC2} 0 ${endX} 0')`
  }
  return `path('M 0 0 C 0 ${c} -${a} ${c} -${a} ${midX} S 0 ${sC2} 0 ${endX}')`
}

export function pathSCurve(knobs: SCurveKnobs = {}): PresetOutput {
  const direction = knobs.direction ?? 'horizontal'
  const amplitude = knobs.amplitude ?? 'md'
  const a = AMPLITUDE[amplitude]
  const path = buildSCurvePath(direction, a)
  return {
    keyframes: [
      { offset: 0, offsetPath: path, offsetDistance: '0%',   offsetRotate: '0deg', offsetAnchor: 'auto' },
      { offset: 1, offsetPath: path, offsetDistance: '100%', offsetRotate: '0deg', offsetAnchor: 'auto' },
    ],
    presetId: 'path-s-curve',
    presetVersion: '1.0',
    channels: ['motion-path'],
    reducedMotion: 'skip',
  }
}
