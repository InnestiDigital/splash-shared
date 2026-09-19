import type { AnimationScene } from '~/shared/types/animation'

/**
 * Structural deep-equality helper for plain JSON-like values.
 *
 * Handles primitives, arrays, and plain objects. Key order is irrelevant.
 * Intentionally scoped to the shapes used by `AnimationScene` (no Map/Set/Date
 * support) to keep the comparison predictable and cheap.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return false

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray !== bIsArray) return false

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length) return false

  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false
    if (!deepEqual(aObj[k], bObj[k])) return false
  }
  return true
}

/**
 * Structural equality check for two `AnimationScene` objects.
 *
 * Compares only the fields that can change across renders:
 *   - `trigger` (discriminated union, nested refs/anchors)
 *   - `entries` (array of keyframe-bearing entries)
 *   - `conditions` (optional flat object)
 *   - `defaults` (optional flat object)
 *   - `allowCrossBlock` (optional boolean)
 *   - `disabled` (optional boolean; engine skips scene when true)
 *   - `sectionId` (optional string; links scene to a section)
 *   - `choreographyMeta` (optional admin provenance: `name`, `templateId`)
 *   - `sectionChoreography` (optional runtime choreography: `sectionId`,
 *     `meta` with mode/baseDelay/order, optional `orderedBlockIds`)
 *
 * Stable identity fields (`id`, `pageId`, `versionId`) are skipped — they are
 * assigned once and never mutated in place.
 *
 * Unlike `JSON.stringify`-based comparison this is key-order agnostic, so
 * scenes rebuilt via object spread across different sources do not trigger
 * spurious `upsertScene` calls (which tear down and recreate the adapter).
 *
 * All nested fields go through `deepEqual` so key-order insensitivity and
 * undefined/missing equivalence are preserved for every compared field.
 */
export function scenesEqual(a: AnimationScene, b: AnimationScene): boolean {
  if (a === b) return true
  return (
    a.allowCrossBlock === b.allowCrossBlock &&
    a.disabled === b.disabled &&
    a.sectionId === b.sectionId &&
    deepEqual(a.trigger, b.trigger) &&
    deepEqual(a.entries, b.entries) &&
    deepEqual(a.conditions, b.conditions) &&
    deepEqual(a.defaults, b.defaults) &&
    deepEqual(a.choreographyMeta, b.choreographyMeta) &&
    deepEqual(a.sectionChoreography, b.sectionChoreography)
  )
}
