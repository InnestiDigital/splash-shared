// shared/features/cms/sectionDividers.ts
//
// Section shape dividers — decorative SVG separators rendered at the top and/or
// bottom edge of a section by SectionRenderer. The shape is filled with the
// section's own `--section-bg`, so the section's colour appears to flow into the
// adjacent section (the signature "wave / angle separator" look from Webflow,
// Wix Studio and Framer that splash previously lacked).
//
// Pure geometry only — no Vue, no DOM. Each shape is authored for a BOTTOM
// divider in a `0 0 1200 120` viewBox drawn with `preserveAspectRatio="none"`
// so it stretches to the full section width. The filled region occupies the TOP
// of the box and the contour drops toward y=120; SectionRenderer flips the path
// vertically (CSS `scaleY(-1)`) to produce the TOP-edge variant, and mirrors it
// horizontally (`scaleX(-1)`) when the author opts into flip.
//
// Colour comes exclusively from existing section CSS tokens (`--section-bg`) —
// no freeform hex control is introduced, per the Color Override Freeze.

export type DividerShape =
  | 'none'
  | 'wave'
  | 'curve'
  | 'tilt'
  | 'triangle'
  | 'zigzag'
  | 'arrow'

export type DividerHeight = 'sm' | 'md' | 'lg'

/** SVG `d` for the bottom-edge orientation of each shape, viewBox `0 0 1200 120`. */
const DIVIDER_PATHS: Record<Exclude<DividerShape, 'none'>, string> = {
  // Smooth double S-wave — the soft, organic default.
  wave: 'M0 0 H1200 V58 C1040 112 880 14 600 58 C320 102 160 14 0 58 Z',
  // Single convex bulge dipping into the next section.
  curve: 'M0 0 H1200 V34 Q600 116 0 34 Z',
  // Straight diagonal — clean architectural slant.
  tilt: 'M0 0 H1200 V14 L0 92 Z',
  // Centre spike pointing down into the next section.
  triangle: 'M0 0 H1200 V30 L600 104 L0 30 Z',
  // Sawtooth across the full width.
  zigzag:
    'M0 36 L100 92 L200 36 L300 92 L400 36 L500 92 L600 36 L700 92 L800 36 L900 92 L1000 36 L1100 92 L1200 36 V0 H0 Z',
  // Centre chevron — the next section pokes up into this one.
  arrow: 'M0 0 H1200 V92 L600 30 L0 92 Z',
}

/** Author-facing pixel height per height token. */
export const DIVIDER_HEIGHTS: Record<DividerHeight, number> = {
  sm: 40,
  md: 80,
  lg: 140,
}

/** Selectable shapes in author order (excludes the `none` sentinel). */
export const DIVIDER_SHAPES: ReadonlyArray<Exclude<DividerShape, 'none'>> = [
  'wave',
  'curve',
  'tilt',
  'triangle',
  'zigzag',
  'arrow',
]

const VALID_SHAPES = new Set<DividerShape>(['none', ...DIVIDER_SHAPES])

/** Narrow an arbitrary config value to a known shape, defaulting to `none`. */
export function normalizeDividerShape(value: unknown): DividerShape {
  return typeof value === 'string' && VALID_SHAPES.has(value as DividerShape)
    ? (value as DividerShape)
    : 'none'
}

/** Narrow an arbitrary config value to a known height token, defaulting to `md`. */
export function normalizeDividerHeight(value: unknown): DividerHeight {
  return value === 'sm' || value === 'lg' ? value : 'md'
}

/**
 * SVG path string for a shape, or `null` for `none`/unknown.
 * The returned `d` is the bottom-edge orientation; callers flip for the top edge.
 */
export function getDividerPath(shape: DividerShape): string | null {
  return shape === 'none' ? null : DIVIDER_PATHS[shape] ?? null
}

/** Pixel height for a divider given its height token. */
export function getDividerHeight(height: DividerHeight): number {
  return DIVIDER_HEIGHTS[height]
}
