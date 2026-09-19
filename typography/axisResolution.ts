/**
 * Pure axis resolution for variable fonts (Phase C).
 *
 * No DOM, no DB, no Vue. Takes a font family + stored preset overrides + the
 * theme variant registry and returns the resolved axis list, ready for CSS
 * emission. Clamping happens at emit time only; stored values are never
 * mutated.
 */

export interface ThemeAxisDef {
  min: number
  max: number
  default: number
  step?: number
  label?: string
  order?: number
  experimental?: boolean
}

export interface ThemeVariant {
  name: string
  file: string
  family?: string
  weight?: number
  style?: string
  variable?: boolean
  axes?: Record<string, ThemeAxisDef>
}

export interface ResolvedAxis {
  tag: string
  value: number          // post-clamp value emitted to CSS
  storedValue: number    // pre-clamp value the editor authored (for UI surfacing)
  order: number
  outOfRange: boolean    // true when stored !== value due to clamping
}

/**
 * Infer step when the registry omits one.
 * Integer ranges → 1. Any non-integer in min/max/default → 0.1.
 * Explicit step always wins.
 */
export function inferStep(axis: ThemeAxisDef): number {
  if (axis.step !== undefined) return axis.step
  const allInt = Number.isInteger(axis.min)
    && Number.isInteger(axis.max)
    && Number.isInteger(axis.default)
  return allInt ? 1 : 0.1
}

/**
 * Validate a single axis registry entry. Returns a human-readable error
 * string or null when well-formed. Used by resolveAxes to drop malformed
 * axes from emission, and by diagnostics to surface registry issues.
 */
export function validateAxisDef(tag: string, axis: ThemeAxisDef): string | null {
  if (typeof axis?.min !== 'number') return `Theme axis ${tag} is malformed: min must be a number`
  if (typeof axis?.max !== 'number') return `Theme axis ${tag} is malformed: max must be a number`
  if (typeof axis?.default !== 'number') return `Theme axis ${tag} is malformed: default must be a number`
  if (axis.min > axis.max) return `Theme axis ${tag} is malformed: min ${axis.min} > max ${axis.max}. Axis ignored until corrected in theme.json`
  if (axis.default < axis.min || axis.default > axis.max) return `Theme axis ${tag} is malformed: default ${axis.default} outside range [${axis.min}, ${axis.max}]`
  if (axis.step !== undefined && axis.step <= 0) return `Theme axis ${tag} is malformed: step must be > 0`
  return null
}

/**
 * Resolve a fontFamily string to its declared variant.
 * Matches `family` first (canonical name post FEAT-01), then `name` (slug)
 * for legacy variants. Returns null when no match.
 */
export function findVariant(
  fontFamily: string | null | undefined,
  variants: ThemeVariant[],
): ThemeVariant | null {
  if (!fontFamily) return null
  return variants.find(v => v.family === fontFamily)
    ?? variants.find(v => v.name === fontFamily)
    ?? null
}

/**
 * Resolve final axis values for a preset against the theme registry.
 *
 *   - Returns [] for non-variable fonts, missing fonts, or variants with no
 *     declared axes (callers fall through to legacy CSS path).
 *   - Each declared axis starts at its theme default; preset overrides win.
 *   - Preset-stored axes the variant doesn't declare are dropped from the
 *     resolved output but the input object is never mutated (recoverability).
 *   - Out-of-range stored values are clamped at emit time; storedValue
 *     retains the original so admin can warn the editor.
 *   - Malformed axis entries (validateAxisDef returns non-null) are skipped
 *     so emission stays predictable; valid sibling axes still resolve.
 *
 * Pure function — no DOM, no DB, no I/O.
 */
export function resolveAxes(
  fontFamily: string | null | undefined,
  presetAxes: Record<string, number> | null | undefined,
  variants: ThemeVariant[],
): ResolvedAxis[] {
  const variant = findVariant(fontFamily, variants)
  if (!variant?.variable) return []
  if (!variant.axes || Object.keys(variant.axes).length === 0) return []

  const resolved: ResolvedAxis[] = []

  for (const tag of Object.keys(variant.axes)) {
    const axis = variant.axes[tag]
    if (validateAxisDef(tag, axis) !== null) continue

    const stored = presetAxes?.[tag]
    const storedValue = typeof stored === 'number' ? stored : axis.default
    // Clamp at emit time; keep storedValue for UI/diagnostics.
    const value = Math.max(axis.min, Math.min(axis.max, storedValue))
    // Axes without explicit order tie — sort falls through to alphabetical.
    const order = typeof axis.order === 'number' ? axis.order : Number.POSITIVE_INFINITY

    resolved.push({
      tag,
      value,
      storedValue,
      order,
      outOfRange: storedValue !== value,
    })
  }

  // Deterministic order — explicit `order` first, alphabetical for ties.
  resolved.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.tag.localeCompare(b.tag)
  })

  return resolved
}

/**
 * Format a resolved axis list as the value of `font-variation-settings`.
 * Output is ordered per the input array (caller chose the order).
 *
 * Always emits every axis including zero values — variable-font renderers
 * need the full axis list to interpolate cleanly when axes animate later
 * (C3 deferred scope) and to avoid falling back to single-value glyphs.
 */
export function formatFontVariationSettings(axes: ResolvedAxis[]): string {
  return axes.map(a => `"${a.tag}" ${a.value}`).join(', ')
}

/**
 * Derive legacy CSS properties from resolved axes. Matches the spec's
 * precedence rule for ital/slnt: ital=1 emits italic; ital=0 with slnt≠0
 * emits oblique; ital=0 with slnt=0 emits no font-style at all.
 *
 * `font-variation-settings` remains the source of truth for the variable
 * renderer; these legacy properties are the fallback path for non-VF UAs
 * and accessibility tooling.
 */
export function axisToLegacyProperties(axes: ResolvedAxis[]): Record<string, string> {
  const out: Record<string, string> = {}
  const byTag = new Map(axes.map(a => [a.tag, a]))

  const wght = byTag.get('wght')
  if (wght) out['font-weight'] = String(wght.value)

  const wdth = byTag.get('wdth')
  if (wdth) out['font-stretch'] = `${wdth.value}%`

  if (byTag.has('opsz')) out['font-optical-sizing'] = 'none'

  // ital wins over slnt; ital=0 + slnt=0 emits nothing
  const ital = byTag.get('ital')
  const slnt = byTag.get('slnt')
  if (ital?.value === 1) {
    out['font-style'] = 'italic'
  } else if (slnt && slnt.value !== 0) {
    out['font-style'] = `oblique ${slnt.value}deg`
  }

  return out
}

export interface AxisTransitionDiff {
  previousAxes: ResolvedAxis[]
  nextAxes: ResolvedAxis[]
  /** Axis tags that resolved on the old family but are absent on the new one. */
  lostTags: string[]
  /** Axis tags that resolve on the new family but were absent on the old one. */
  gainedTags: string[]
}

/**
 * Diff axis resolution across a font-family transition.
 *
 * Returns which axis tags were resolved before the change and are gone after,
 * and which are newly resolved. The diff is purely based on resolved-axis tags;
 * clamped values are irrelevant to the warning decision.
 *
 * Used by the editor to detect when a family switch silently kills authored
 * axes so the UI can warn the author before they save.
 *
 * Pure function — no DOM, no DB, no I/O.
 */
export function diffResolvedAxes(
  previousFontFamily: string | null | undefined,
  nextFontFamily: string | null | undefined,
  presetAxes: Record<string, number> | null | undefined,
  variants: ThemeVariant[],
): AxisTransitionDiff {
  const previousAxes = resolveAxes(previousFontFamily, presetAxes, variants)
  const nextAxes = resolveAxes(nextFontFamily, presetAxes, variants)
  const previousTagSet = new Set(previousAxes.map(a => a.tag))
  const nextTagSet = new Set(nextAxes.map(a => a.tag))
  return {
    previousAxes,
    nextAxes,
    lostTags: previousAxes.map(a => a.tag).filter(t => !nextTagSet.has(t)),
    gainedTags: nextAxes.map(a => a.tag).filter(t => !previousTagSet.has(t)),
  }
}

export interface AxisDiagnostic {
  variantName: string
  tag: string
  message: string
}

/**
 * Walk the theme variant registry and collect all malformed-axis warnings.
 * Used at theme-load time (server console) and in admin PresetEditor
 * (surfaced when the affected font is selected). Non-blocking — never
 * prevents publish.
 */
export function collectAxisDiagnostics(variants: ThemeVariant[]): AxisDiagnostic[] {
  const out: AxisDiagnostic[] = []
  for (const variant of variants) {
    if (!variant.variable || !variant.axes) continue
    for (const [tag, axis] of Object.entries(variant.axes)) {
      const error = validateAxisDef(tag, axis)
      if (error) out.push({ variantName: variant.name, tag, message: error })
    }
  }
  return out
}
