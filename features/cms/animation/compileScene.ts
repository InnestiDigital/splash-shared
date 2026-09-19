/**
 * Compile scene pipeline — validate scrollRange and pre-parse var tracks.
 *
 * All parsing happens here at scene load time (synchronous, before RAF).
 * Sidecars downstream do only arithmetic + setProperty.
 */

import type { AnimationEntry, Keyframe, TypedValue } from '~/shared/types/animation'
import type { CompiledVarTrack, CompiledVarStop } from './varAnimator'
import { parseToOklch } from './oklch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompiledEntry {
  source: AnimationEntry
  compiled: {
    scrollRange: { start: number; end: number } | null
    varTracks: CompiledVarTrack[] | null
  }
}

// ---------------------------------------------------------------------------
// scrollRange validation
// ---------------------------------------------------------------------------

function compileScrollRange(
  entry: AnimationEntry,
): { start: number; end: number } | null {
  const sr = entry.scrollRange
  if (!sr) return null

  let { start, end } = sr

  // Clamp out-of-bounds
  const needsClamp = start < 0 || start > 1 || end < 0 || end > 1
  if (needsClamp) {
    console.warn(
      `[compileScene] Entry "${entry.id}": scrollRange [${sr.start}, ${sr.end}] out of bounds, clamping to [0,1]`,
    )
    start = Math.max(0, Math.min(1, start))
    end = Math.max(0, Math.min(1, end))
  }

  // Reject start >= end
  if (start >= end) {
    console.warn(
      `[compileScene] Entry "${entry.id}": scrollRange start (${start}) >= end (${end}), dropping`,
    )
    return null
  }

  return { start, end }
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

const LENGTH_RE = /^(-?[\d.]+)(px|rem|em|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/
const PERCENTAGE_RE = /^(-?[\d.]+)%$/
const ANGLE_RE = /^(-?[\d.]+)(deg|rad|grad|turn)$/

function parseTypedValue(
  tv: TypedValue,
  offset: number,
): CompiledVarStop | null {
  switch (tv.type) {
    case 'number': {
      const num = typeof tv.value === 'number' ? tv.value : parseFloat(String(tv.value))
      if (isNaN(num)) return null
      return { offset, type: 'number', num }
    }
    case 'length': {
      const match = String(tv.value).match(LENGTH_RE)
      if (!match) return null
      return { offset, type: 'length', num: parseFloat(match[1]), unit: match[2] }
    }
    case 'percentage': {
      const match = String(tv.value).match(PERCENTAGE_RE)
      if (!match) return null
      return { offset, type: 'percentage', num: parseFloat(match[1]) }
    }
    case 'angle': {
      const match = String(tv.value).match(ANGLE_RE)
      if (!match) return null
      return { offset, type: 'angle', num: parseFloat(match[1]), unit: match[2] }
    }
    case 'color': {
      const oklch = parseToOklch(String(tv.value))
      if (!oklch) return null
      return { offset, type: 'color', oklch }
    }
  }
}

// ---------------------------------------------------------------------------
// Var track compilation
// ---------------------------------------------------------------------------

const CONVENTION_PREFIX_RE = /^--(motion|anim)-/

function compileVarTracks(
  entry: AnimationEntry,
): CompiledVarTrack[] | null {
  // Collect all var names across keyframes
  const varNames = new Set<string>()
  for (const kf of entry.keyframes) {
    if (kf.vars) {
      for (const name of Object.keys(kf.vars)) {
        varNames.add(name)
      }
    }
  }

  if (varNames.size === 0) return null

  const tracks: CompiledVarTrack[] = []

  for (const name of varNames) {
    // Warn on non-standard prefix
    if (!CONVENTION_PREFIX_RE.test(name)) {
      console.warn(
        `[compileScene] Entry "${entry.id}": var "${name}" does not use --motion-* or --anim-* prefix`,
      )
    }

    // Collect stops for this var name
    const stops: CompiledVarStop[] = []
    let trackType: TypedValue['type'] | null = null
    let trackUnit: string | null = null
    let valid = true

    for (const kf of entry.keyframes) {
      const tv = kf.vars?.[name]
      if (!tv) continue

      // Type consistency check
      if (trackType === null) {
        trackType = tv.type
      } else if (tv.type !== trackType) {
        console.warn(
          `[compileScene] Entry "${entry.id}": var "${name}" has inconsistent types ("${trackType}" vs "${tv.type}"), dropping track`,
        )
        valid = false
        break
      }

      const parsed = parseTypedValue(tv, kf.offset)
      if (!parsed) {
        console.warn(
          `[compileScene] Entry "${entry.id}": var "${name}" has unparseable value "${tv.value}", dropping track`,
        )
        valid = false
        break
      }

      // Unit consistency for length and angle
      if (parsed.type === 'length' || parsed.type === 'angle') {
        const unit = (parsed as { unit: string }).unit
        if (trackUnit === null) {
          trackUnit = unit
        } else if (unit !== trackUnit) {
          console.warn(
            `[compileScene] Entry "${entry.id}": var "${name}" has mixed units ("${trackUnit}" vs "${unit}"), dropping track`,
          )
          valid = false
          break
        }
      }

      stops.push(parsed)
    }

    if (!valid || stops.length === 0) continue

    // Sort stops by offset
    stops.sort((a, b) => a.offset - b.offset)

    tracks.push({
      name,
      type: trackType!,
      stops,
    })
  }

  return tracks.length > 0 ? tracks : null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compileSceneEntries(entries: AnimationEntry[]): CompiledEntry[] {
  return entries.map((entry) => ({
    source: entry,
    compiled: {
      scrollRange: compileScrollRange(entry),
      varTracks: compileVarTracks(entry),
    },
  }))
}
