import type { AnimationEntry, Keyframe } from '~/shared/types/animation'
import { presetRegistry, entrancePresets, hoverPresets, scrollPresets } from './presets'
import type { PresetMeta } from './presets'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetachmentInfo {
  isDetached: boolean
  presetId: string | null
  presetVersion: string | null
  label: string // "Fade In", "Modified from Fade In", or "Custom"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All preset metadata lists combined for name lookup. */
const allPresetMeta: PresetMeta[] = [
  ...entrancePresets,
  ...hoverPresets,
  ...scrollPresets,
]

function findPresetName(presetId: string): string | null {
  return allPresetMeta.find((m) => m.id === presetId)?.name ?? null
}

/**
 * Deep-compare two keyframe arrays, ignoring array order.
 * Each keyframe is matched by `offset`; property values are compared structurally.
 */
function keyframesEqual(a: Keyframe[], b: Keyframe[]): boolean {
  if (a.length !== b.length) return false

  const sortedA = [...a].sort((x, y) => x.offset - y.offset)
  const sortedB = [...b].sort((x, y) => x.offset - y.offset)

  for (let i = 0; i < sortedA.length; i++) {
    if (!keyframeEqual(sortedA[i], sortedB[i])) return false
  }
  return true
}

function keyframeEqual(a: Keyframe, b: Keyframe): boolean {
  if (a.offset !== b.offset) return false
  if (a.opacity !== b.opacity) return false
  if (a.blur !== b.blur) return false
  if (a.clipPath !== b.clipPath) return false

  const ta = a.transform
  const tb = b.transform

  if (ta == null && tb == null) return true
  if (ta == null || tb == null) return false

  return ta.x === tb.x && ta.y === tb.y && ta.scale === tb.scale && ta.rotate === tb.rotate
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare entry's keyframes against what the preset would generate.
 * Returns detachment status and a human-readable label.
 */
export function detectDetachment(entry: AnimationEntry): DetachmentInfo {
  if (!entry.presetId) {
    return { isDetached: false, presetId: null, presetVersion: null, label: 'Custom' }
  }

  const factory = presetRegistry[entry.presetId]
  if (!factory) {
    // Preset no longer exists in registry — treat as detached with unknown origin
    return {
      isDetached: true,
      presetId: entry.presetId,
      presetVersion: entry.presetVersion ?? null,
      label: `Modified from ${entry.presetId}`,
    }
  }

  const presetOutput = factory()
  const presetName = findPresetName(entry.presetId) ?? entry.presetId

  if (keyframesEqual(entry.keyframes, presetOutput.keyframes)) {
    return {
      isDetached: false,
      presetId: entry.presetId,
      presetVersion: entry.presetVersion ?? null,
      label: presetName,
    }
  }

  return {
    isDetached: true,
    presetId: entry.presetId,
    presetVersion: entry.presetVersion ?? null,
    label: `Modified from ${presetName}`,
  }
}

/**
 * Revert entry keyframes (and duration/easing) to preset defaults.
 * Returns a new entry with preset values restored, or null if the preset is unknown.
 */
export function revertToPreset(entry: AnimationEntry): AnimationEntry | null {
  if (!entry.presetId) return null

  const factory = presetRegistry[entry.presetId]
  if (!factory) return null

  const presetOutput = factory()

  return {
    ...entry,
    keyframes: presetOutput.keyframes,
    duration: presetOutput.duration ?? entry.duration,
    easing: presetOutput.easing ?? entry.easing,
    presetVersion: presetOutput.presetVersion,
  }
}
