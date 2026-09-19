import type {
  CompositionTemplate, CompositionItem, CompositionKnobs,
  ResolvedLayout, ResolvedRect, LayoutGroup, FloatingPlacement,
  Region, Emphasis,
} from './types'

// ---------------------------------------------------------------------------
// Continuous-knob helpers (SPL-120)
// ---------------------------------------------------------------------------
//
// EditorialComposition gained 0–1 sliders for `dominance` and `overlap`.
// Legacy enum strings ("text/balanced/media", "tight/normal/spacious") are
// still accepted via the shim tables below so pre-SPL-120 content keeps
// rendering at the 0.5 midpoint.
//
// Polarity (locked):
//   dominance = 0   → text-dominant   (multiplier ≈ 0.80)
//   dominance = 0.5 → balanced        (multiplier ≈ 1.025)
//   dominance = 1   → media-dominant  (multiplier ≈ 1.25)
//   overlap   = 0   → tight spacing   (multiplier ≈ 0.30)
//   overlap   = 0.5 → normal spacing  (multiplier ≈ 0.95)
//   overlap   = 1   → spacious        (multiplier ≈ 1.60)

/** Linear interpolation between `a` and `b` by factor `t` (no clamp). */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Clamp a number into the [0, 1] range. */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Legacy `dominance` enum strings → normalized float. */
export const DOMINANCE_ENUM: Record<string, number> = {
  text: 0,
  balanced: 0.5,
  media: 1,
}

/** Legacy `overlap` enum strings → normalized float. */
export const OVERLAP_ENUM: Record<string, number> = {
  tight: 0,
  normal: 0.5,
  spacious: 1,
}

/** Allowed `alignment` values (enum-only — not continuous). */
const ALIGNMENT_VALUES = ['left', 'balanced', 'right'] as const
type AlignmentValue = typeof ALIGNMENT_VALUES[number]

/**
 * Coerce an unknown input (number, enum string, null/undefined, garbage) into
 * a clamped 0–1 float. Falls back to `fallback` (default 0.5 = neutral).
 */
export function toFloat(
  value: unknown,
  table: Record<string, number>,
  fallback = 0.5,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value)
  if (typeof value === 'string' && value in table) return table[value]
  return fallback
}

/** Dominance multiplier range — scales media/text sizing in the composition. */
export const DOMINANCE_MIN = 0.80
export const DOMINANCE_MAX = 1.25

/** Overlap multiplier range — scales gap/margin spacing. */
export const OVERLAP_MIN = 0.3
export const OVERLAP_MAX = 1.6

/** Map `dominance` knob (0–1 float or legacy enum) to a layout multiplier. */
export function dominanceMultiplier(value: unknown): number {
  return lerp(DOMINANCE_MIN, DOMINANCE_MAX, toFloat(value, DOMINANCE_ENUM))
}

/** Map `overlap` knob (0–1 float or legacy enum) to a spacing multiplier. */
export function overlapMultiplier(value: unknown): number {
  return lerp(OVERLAP_MIN, OVERLAP_MAX, toFloat(value, OVERLAP_ENUM))
}

/**
 * Map `overlap` knob (0–1 float or legacy enum) to a floater offset multiplier.
 *
 * Polarity is INVERTED vs. `overlapMultiplier`:
 *   t=0 (tight)    → OVERLAP_MAX (floater pulled further over the anchor edge)
 *   t=1 (spacious) → OVERLAP_MIN (floater sits closer to the anchor edge)
 *
 * Consumed internally by `overlapScale(knobs)` in the solver's Phase 2 floater
 * loop. Exported for direct testability (mirrors the `dominanceMultiplier` /
 * `dominanceScale` pattern).
 */
export function overlapOffsetScale(value: unknown): number {
  return lerp(OVERLAP_MAX, OVERLAP_MIN, toFloat(value, OVERLAP_ENUM))
}

/**
 * Validate / passthrough for `alignment` (semantic enum — not interpolated).
 * Unknown values fall back to `'balanced'` so the renderer stays safe.
 */
export function alignmentValue(value: unknown): AlignmentValue {
  if (typeof value === 'string' && (ALIGNMENT_VALUES as readonly string[]).includes(value)) {
    return value as AlignmentValue
  }
  return 'balanced'
}

// ── Topological Sort (groups) ──

export function topologicalSortGroups(groups: LayoutGroup[]): string[] {
  const byId = new Map(groups.map(g => [g.id, g]))
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const order: string[] = []

  function visit(id: string) {
    if (inStack.has(id)) throw new Error(`Group anchor cycle detected involving "${id}"`)
    if (visited.has(id)) return
    inStack.add(id)
    const group = byId.get(id)
    if (group && group.anchor !== 'canvas' && byId.has(group.anchor)) {
      visit(group.anchor)
    }
    inStack.delete(id)
    visited.add(id)
    order.push(id)
  }

  for (const g of groups) visit(g.id)
  return order
}

// ── Region Positioning ──

interface Rect { left: number; top: number; width: number; height: number }

function canvasPosition(region: Region, canvasWidth: number, groupWidth: number): { left: number; top: number } {
  switch (region) {
    case 'left': case 'top-left': case 'bottom-left': return { left: 0, top: 0 }
    case 'right': case 'top-right': case 'bottom-right': return { left: canvasWidth - groupWidth, top: 0 }
    case 'center': return { left: (canvasWidth - groupWidth) / 2, top: 0 }
    default: return { left: 0, top: 0 }
  }
}

function anchoredPosition(
  region: Region, anchorRect: Rect, width: number, height: number,
  overlap: { x: number; y: number },
): { left: number; top: number } {
  const ox = overlap.x * width
  const oy = overlap.y * width // width-based for intrinsic-text safety

  switch (region) {
    case 'bottom-left': return { left: anchorRect.left - ox, top: anchorRect.top + anchorRect.height - oy }
    case 'bottom-right': return { left: anchorRect.left + anchorRect.width - width + ox, top: anchorRect.top + anchorRect.height - oy }
    case 'bottom': return { left: anchorRect.left, top: anchorRect.top + anchorRect.height }
    case 'top-left': return { left: anchorRect.left - ox, top: anchorRect.top - oy }
    case 'top-right': return { left: anchorRect.left + anchorRect.width - width + ox, top: anchorRect.top - oy }
    case 'top': return { left: anchorRect.left, top: anchorRect.top }
    case 'left': return { left: anchorRect.left - ox, top: anchorRect.top }
    case 'right': return { left: anchorRect.left + anchorRect.width - width + ox, top: anchorRect.top }
    case 'center': return { left: anchorRect.left + (anchorRect.width - width) / 2, top: anchorRect.top + (anchorRect.height - height) / 2 }
    default: return { left: anchorRect.left, top: anchorRect.top }
  }
}

// ── Knob Multipliers ──

function dominanceScale(knobs: CompositionKnobs, isMedia: boolean): number {
  // Uses continuous-value helpers with enum backward compat (SPL-120).
  // Media-dominant (t=1) → media group wider; text-dominant (t=0) → text group wider.
  const t = toFloat(knobs.dominance as unknown, DOMINANCE_ENUM)
  return isMedia ? lerp(DOMINANCE_MIN, DOMINANCE_MAX, t) : lerp(DOMINANCE_MAX, DOMINANCE_MIN, t)
}

function overlapScale(knobs: CompositionKnobs): number {
  // Continuous-aware (SPL-002 fix for SPL-120 regression). Previously this
  // function only matched legacy enum strings, so numeric slider values from
  // EditorialComposition silently fell through to the default 1.0 and the
  // overlap slider had no visible effect. Delegates to `overlapOffsetScale`
  // which accepts both numeric (0–1) and legacy enum inputs, with inverted
  // polarity vs. `overlapMultiplier` (high t = spacious = smaller offset
  // multiplier so floaters sit closer to their anchor edge).
  return overlapOffsetScale(knobs.overlap as unknown)
}

function alignmentShift(region: Region, knobs: CompositionKnobs): Region {
  if (knobs.alignment === 'balanced') return region
  const shifts: Record<string, Record<string, Region>> = {
    left: { right: 'center', 'top-right': 'top', 'bottom-right': 'bottom' },
    right: { left: 'center', 'top-left': 'top', 'bottom-left': 'bottom' },
  }
  return shifts[knobs.alignment]?.[region] ?? region
}

// ── Is group media-dominant? ──

function isMediaGroup(group: LayoutGroup, template: CompositionTemplate): boolean {
  return group.roles.some(r => template.roles[r]?.contentType === 'media')
}

// ── Main Solver ──

export function compositionSolver(
  template: CompositionTemplate,
  items: CompositionItem[],
  knobs: CompositionKnobs,
  containerWidth: number,
): ResolvedLayout {
  const visibleRoles = new Set(items.filter(i => i.visible).map(i => i.role))
  const result: ResolvedLayout = {}
  const groupRects = new Map<string, Rect>()

  // Phase 1: Place groups
  const groupOrder = topologicalSortGroups(template.groups)

  for (const gid of groupOrder) {
    const group = template.groups.find(g => g.id === gid)!

    // Skip groups with no visible roles
    const hasVisibleRole = group.roles.some(r => visibleRoles.has(r))
    if (!hasVisibleRole) continue

    const media = isMediaGroup(group, template)
    const domMul = dominanceScale(knobs, media)
    const width = Math.round(group.baseSize.w * containerWidth * domMul)

    let left: number
    let top: number

    if (group.anchor === 'canvas') {
      const region = alignmentShift(group.region, knobs)
      const pos = canvasPosition(region, containerWidth, width)
      left = pos.left
      top = pos.top
    } else {
      const anchorRect = groupRects.get(group.anchor)
      if (!anchorRect) { left = 0; top = 0 }
      else {
        const pos = anchoredPosition(group.region, anchorRect, width, 0, { x: 0, y: 0 })
        left = pos.left
        top = pos.top
      }
    }

    if (group.overflowPolicy === 'clamp') {
      left = Math.max(0, Math.min(left, containerWidth - width))
      if (top < 0) top = 0
    }

    // Groups always have height=auto (content determines height via CSS)
    const rect: Rect = { left, top, width, height: 0 }
    groupRects.set(gid, rect)

    const leftPct = (left / containerWidth) * 100
    const widthPct = (width / containerWidth) * 100

    result[`group:${gid}`] = {
      left: `${leftPct.toFixed(2)}%`,
      top: `${top}px`,
      width: `${widthPct.toFixed(2)}%`,
      height: 'auto',
      zIndex: group.layer,
    }
  }

  // Phase 2: Place floating items
  const oMul = overlapScale(knobs)

  for (const [role, placement] of Object.entries(template.floaters)) {
    const roleItems = items.filter(i => i.role === role && i.visible)
    if (!roleItems.length) continue

    const anchorRect = groupRects.get(placement.anchor)
    if (!anchorRect) continue

    for (const item of roleItems) {
      const emphMul = placement.emphasisScale[item.emphasis as Emphasis]
      const width = Math.round(placement.baseSize.w * containerWidth * emphMul)
      let height: number | 'auto'

      if (placement.sizeMode === 'intrinsic-text') {
        height = 'auto'
      } else if (placement.sizeMode === 'aspect-ratio' && placement.baseSize.aspect) {
        height = Math.round(width / placement.baseSize.aspect)
      } else {
        height = Math.round((placement.baseSize.h ?? 0.3) * containerWidth * emphMul)
      }

      const scaledOverlap = { x: placement.overlap.x * oMul, y: placement.overlap.y * oMul }
      const numH = height === 'auto' ? 0 : height
      const pos = anchoredPosition(placement.region, anchorRect, width, numH, scaledOverlap)
      let { left, top } = pos

      if (placement.overflowPolicy === 'clamp') {
        left = Math.max(0, Math.min(left, containerWidth - width))
        if (top < 0) top = 0
      }

      const leftPct = (left / containerWidth) * 100
      const widthPct = (width / containerWidth) * 100

      result[item.id] = {
        left: `${leftPct.toFixed(2)}%`,
        top: `${top}px`,
        width: `${widthPct.toFixed(2)}%`,
        height: height === 'auto' ? 'auto' : `${height}px`,
        zIndex: placement.layer,
      }
    }
  }

  return result
}
