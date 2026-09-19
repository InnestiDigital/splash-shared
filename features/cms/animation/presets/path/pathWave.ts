import type { PresetOutput } from '~/shared/types/animation'
import { AMPLITUDE, type AmplitudeTier } from './constants'

export type WaveDirection = 'horizontal' | 'vertical'
export type WaveCycles = 1 | 2 | 3

interface WaveKnobs {
  direction?: WaveDirection
  amplitude?: AmplitudeTier
  cycles?: WaveCycles
}

function buildWavePath(direction: WaveDirection, a: number, cycles: WaveCycles): string {
  // One full cycle = 2 cubic segments (crest then trough), 4a travel per cycle.
  // Segment N spans x=[N·2a, (N+1)·2a]. Control points at (segStart+0.5a, ±a) and (segStart+1.5a, ±a).
  // Even segments crest (-a), odd segments trough (+a). Segment endpoint returns to y=0.
  const segments: string[] = []
  for (let seg = 0; seg < 2 * cycles; seg++) {
    const segLen = 2 * a
    const segStart = seg * segLen
    const segEnd = segStart + segLen
    const c1x = segStart + 0.5 * a
    const c2x = segStart + 1.5 * a
    const y = seg % 2 === 0 ? -a : a
    segments.push(`C ${c1x} ${y} ${c2x} ${y} ${segEnd} 0`)
  }
  const horizontal = `M 0 0 ${segments.join(' ')}`
  if (direction === 'horizontal') {
    return `path('${horizontal}')`
  }
  // Vertical: swap X/Y in every M and C
  const tokens = horizontal.split(/\s+/)
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]!
    if (cmd === 'M') {
      const x = tokens[i + 1]!, y = tokens[i + 2]!
      out.push('M', y, x)
      i += 3
    } else if (cmd === 'C') {
      const c1x = tokens[i + 1]!, c1y = tokens[i + 2]!
      const c2x = tokens[i + 3]!, c2y = tokens[i + 4]!
      const ex = tokens[i + 5]!,  ey = tokens[i + 6]!
      out.push('C', c1y, c1x, c2y, c2x, ey, ex)
      i += 7
    } else {
      out.push(cmd)
      i++
    }
  }
  return `path('${out.join(' ')}')`
}

export function pathWave(knobs: WaveKnobs = {}): PresetOutput {
  const direction = knobs.direction ?? 'horizontal'
  const amplitude = knobs.amplitude ?? 'md'
  const cycles = knobs.cycles ?? 1
  const a = AMPLITUDE[amplitude]
  const path = buildWavePath(direction, a, cycles)
  return {
    keyframes: [
      { offset: 0, offsetPath: path, offsetDistance: '0%',   offsetRotate: 'auto', offsetAnchor: 'auto' },
      { offset: 1, offsetPath: path, offsetDistance: '100%', offsetRotate: 'auto', offsetAnchor: 'auto' },
    ],
    presetId: 'path-wave',
    presetVersion: '1.0',
    channels: ['motion-path'],
    reducedMotion: 'skip',
  }
}
