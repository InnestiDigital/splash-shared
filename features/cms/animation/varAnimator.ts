/**
 * VarAnimator sidecar — typed CSS custom property interpolation.
 *
 * Consumes pre-compiled CompiledVarTrack[] where all values are already parsed
 * (numbers are numbers, colors are OKLCH objects, lengths are {num, unit}).
 * The sidecar does only arithmetic + setProperty per frame.
 */

import type { EntrySidecar } from '~/shared/types/animation'
import { type OklchColor, lerpOklch, formatOklch } from './oklch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompiledVarTrack {
  name: string
  type: 'number' | 'length' | 'percentage' | 'angle' | 'color'
  stops: CompiledVarStop[]
}

export type CompiledVarStop =
  | { offset: number; type: 'number'; num: number }
  | { offset: number; type: 'length'; num: number; unit: string }
  | { offset: number; type: 'percentage'; num: number }
  | { offset: number; type: 'angle'; num: number; unit: string }
  | { offset: number; type: 'color'; oklch: OklchColor }

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Find the two adjacent stops surrounding progress and return the local t.
 * Clamps to first/last stop if progress is outside the range.
 */
function findStopPair(stops: CompiledVarStop[], progress: number): { lo: number; hi: number; t: number } {
  if (stops.length === 1) {
    return { lo: 0, hi: 0, t: 0 }
  }

  // Before first stop
  if (progress <= stops[0].offset) {
    return { lo: 0, hi: 0, t: 0 }
  }

  // After last stop
  if (progress >= stops[stops.length - 1].offset) {
    const last = stops.length - 1
    return { lo: last, hi: last, t: 0 }
  }

  // Find adjacent pair
  for (let i = 0; i < stops.length - 1; i++) {
    if (progress >= stops[i].offset && progress <= stops[i + 1].offset) {
      const range = stops[i + 1].offset - stops[i].offset
      const t = range === 0 ? 0 : (progress - stops[i].offset) / range
      return { lo: i, hi: i + 1, t }
    }
  }

  // Fallback (shouldn't reach)
  const last = stops.length - 1
  return { lo: last, hi: last, t: 0 }
}

function round(n: number, digits: number): number {
  const factor = Math.pow(10, digits)
  return Math.round(n * factor) / factor
}

function interpolateTrack(track: CompiledVarTrack, progress: number): string {
  const { lo, hi, t } = findStopPair(track.stops, progress)
  const a = track.stops[lo]
  const b = track.stops[hi]

  switch (a.type) {
    case 'number': {
      const bNum = b as typeof a
      const val = a.num + (bNum.num - a.num) * t
      return String(round(val, 6))
    }
    case 'length': {
      const bLen = b as typeof a
      const val = a.num + (bLen.num - a.num) * t
      return `${round(val, 6)}${a.unit}`
    }
    case 'percentage': {
      const bPct = b as typeof a
      const val = a.num + (bPct.num - a.num) * t
      return `${round(val, 6)}%`
    }
    case 'angle': {
      const bAng = b as typeof a
      const val = a.num + (bAng.num - a.num) * t
      return `${round(val, 6)}${a.unit}`
    }
    case 'color': {
      const bCol = b as typeof a
      const lerped = lerpOklch(a.oklch, bCol.oklch, t)
      return formatOklch(lerped)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an EntrySidecar that interpolates CSS custom properties per frame.
 * Returns null if tracks is empty.
 */
export function createVarSidecar(
  element: HTMLElement,
  tracks: CompiledVarTrack[],
): EntrySidecar | null {
  if (tracks.length === 0) return null

  const varNames = tracks.map(t => t.name)

  return {
    update(progress: number) {
      for (const track of tracks) {
        const value = interpolateTrack(track, progress)
        element.style.setProperty(track.name, value)
      }
    },
    destroy() {
      for (const name of varNames) {
        element.style.removeProperty(name)
      }
    },
  }
}

/**
 * Fire-and-forget: apply final (progress=1) var state to element.
 * Used by non-scroll adapters that jump to final state.
 */
export function applyFinalVarState(
  element: HTMLElement,
  tracks: CompiledVarTrack[],
): void {
  const sidecar = createVarSidecar(element, tracks)
  if (sidecar) {
    sidecar.update(1)
  }
}
