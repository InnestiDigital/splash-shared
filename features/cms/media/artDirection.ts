/**
 * Media art direction — one focal-point map, one aspect-ratio convention.
 *
 * Every block that crops media into a frame has to answer the same two
 * questions: which part of the image survives the crop, and what shape the
 * frame is. Before this module each block answered them privately —
 * ImageBanner and CanvasImage carried two different object-position maps (nine
 * entries vs five), and `aspectRatio` was spelled three incompatible ways
 * across ten schemas. The maps below are the single source of truth for both.
 *
 * TWO-TIER FOCAL MODEL. `resolveFocalPoint` is the bridge between them:
 *   - ENUM tier — a named token (`top-left` … `bottom-right`) chosen from a
 *     select. This is the authoring control for a block rendering ONE piece of
 *     media into a frame the author does not otherwise position. It is owned by
 *     the `media-art-direction` settings fragment.
 *   - NUMERIC tier — normalized x/y, authored by dragging:
 *     `admin/components/blocks/composition/FocalPointPicker.vue` (0-1) and
 *     ScatterCollage's per-item `focalX`/`focalY` (0-100). This is PER-ITEM
 *     collage geometry, where the author already places the item by hand.
 * Both tiers land on the same `{ x, y }` percentages, so both end up as one
 * `object-position` expression.
 */

/**
 * The nine named crop positions, in reading order.
 *
 * A superset of every vocabulary that preceded it, which is what made adoption
 * value-safe: a block that previously offered only the five edge/center tokens
 * cannot have an authored value fall outside this list.
 */
export const FOCAL_POINT_TOKENS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const

export type FocalPointToken = typeof FOCAL_POINT_TOKENS[number]

/** The native crop: dead centre, what `object-position` does with no value at all. */
export const DEFAULT_FOCAL_POINT: FocalPointToken = 'center'

/** A point on the image, in percent of its own width/height. */
export interface FocalPoint {
  x: number
  y: number
}

const FOCAL_POINT_PERCENTAGES: Record<FocalPointToken, FocalPoint> = {
  'top-left': { x: 0, y: 0 },
  'top': { x: 50, y: 0 },
  'top-right': { x: 100, y: 0 },
  'left': { x: 0, y: 50 },
  'center': { x: 50, y: 50 },
  'right': { x: 100, y: 50 },
  'bottom-left': { x: 0, y: 100 },
  'bottom': { x: 50, y: 100 },
  'bottom-right': { x: 100, y: 100 },
}

export function isFocalPointToken(value: unknown): value is FocalPointToken {
  return typeof value === 'string' && value in FOCAL_POINT_PERCENTAGES
}

/**
 * A focal token as `{ x, y }` percentages. Unknown input resolves to centre —
 * settings arrive from stored JSON, and a frame cropped somewhere arbitrary is
 * a worse failure than a frame cropped centrally.
 */
export function resolveFocalPoint(token: unknown): FocalPoint {
  return isFocalPointToken(token)
    ? FOCAL_POINT_PERCENTAGES[token]
    : FOCAL_POINT_PERCENTAGES[DEFAULT_FOCAL_POINT]
}

/** A focal token as a CSS `object-position` value (`"50% 0%"`). */
export function focalPointToObjectPosition(token: unknown): string {
  const { x, y } = resolveFocalPoint(token)
  return `${x}% ${y}%`
}

/** `{ x, y }` percentages as a CSS `object-position` value — the numeric tier's path in. */
export function focalPercentagesToObjectPosition(point: Partial<FocalPoint> | null | undefined): string {
  return `${point?.x ?? 50}% ${point?.y ?? 50}%`
}

/**
 * The keyword ratio vocabulary CanvasImage authored against. Retained verbatim
 * — `portrait` is 4/5 and `classic` is 4/3 because that is what those stored
 * values have always painted, and re-spelling them would change existing pages.
 */
const KEYWORD_ASPECT_RATIOS: Record<string, string> = {
  square: '1 / 1',
  portrait: '4 / 5',
  classic: '4 / 3',
  landscape: '3 / 2',
  wide: '16 / 9',
}

/** Ratios spelled `w:h`, the convention the other nine schemas authored against. */
const COLON_RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/

/** Ratios already spelled the CSS-native way (`16 / 9`), which is what we emit. */
const CSS_RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/

/**
 * A stored ratio value as a CSS `aspect-ratio` value, or null when the frame
 * should keep the media's natural ratio.
 *
 * Accepts all three spellings in circulation — CSS-native (`"16 / 9"`), colon
 * (`"16:9"`) and CanvasImage's keywords (`"wide"`) — and normalizes to the
 * CSS-native form. That is the whole convergence for now: the schemas still
 * disagree on which vocabulary they offer (see the `media-art-direction`
 * fragment for why converging the ids needs a value migration first), but every
 * adopter runs the same resolver, so they cannot disagree on what a value MEANS.
 *
 * Returns null — not a fallback ratio — for `auto`, empty and unrecognized
 * input: "no aspect-ratio declaration" is the honest rendering of "natural".
 */
export function resolveAspectRatio(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'auto') return null

  const keyword = KEYWORD_ASPECT_RATIOS[trimmed]
  if (keyword) return keyword

  const css = CSS_RATIO_RE.exec(trimmed)
  if (css) return `${css[1]} / ${css[2]}`

  const colon = COLON_RATIO_RE.exec(trimmed)
  if (colon) return `${colon[1]} / ${colon[2]}`

  return null
}

/**
 * The style object a cropped-media element needs: how it fills its frame and
 * where it crops. Ratio is deliberately absent — it belongs on the FRAME
 * element, not the media, and callers set it from `resolveAspectRatio`.
 */
export function mediaArtDirectionStyle(settings: {
  objectFit?: string
  focalPoint?: unknown
}): Record<string, string> {
  return {
    objectFit: settings.objectFit === 'contain' ? 'contain' : 'cover',
    objectPosition: focalPointToObjectPosition(settings.focalPoint),
  }
}
