import { isBrandCanvasDimension, isBrandCanvasOverrides, isBrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import { isBrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import { isRecord } from '~/shared/types/guards'
import type { BrandCanvasOverrides, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'

/**
 * Brand Content Studio — the render wire contract.
 *
 * The compiled-format tier (a compiled `.vue` painted from authored field
 * values, `POST .../brand-formats/render` with a `formatId` body) has been
 * retired. `BrandTemplateGenerateRequest` — generate from a stored template's
 * approved canvas — is the only render request left, and `BrandCanvasRenderPayload`
 * is the only payload the headless render page (and the admin preview iframe)
 * ever receives, injected into `window.__BRAND_RENDER__` by
 * `page.evaluateOnNewDocument()` BEFORE any page script runs.
 *
 * Why a window global rather than a query string: the payload carries a full
 * approved tree and per-generation overrides, which blows past what is safe to
 * put through a URL (proxy length caps, encoding traps, and it would land in
 * access logs). It is data only — the page validates it and NEVER evaluates it.
 */

// ─── Render request (admin → server) ─────────────────────────────────────────

/**
 * 1 = the canvas's native pixel size ("exported 1:1"). Higher scales are the
 * poster/print story: an author composes at a WEB-NATIVE design size (where
 * blocks and typography look right) and multiplies at export — 1240×1754 at
 * 2× is an A-series print PDF's raster, 3×/4× cover large-format needs.
 * A fixed allowlist, never an arbitrary number: that would turn a bounded
 * Chromium job into an unbounded one. `BRAND_RENDER_MAX_OUTPUT_SIDE` bounds
 * the multiplied result — 4096 (the canvas cap) × 2 exactly, and safely below
 * Chromium's ~16k texture ceiling for the tall-poster × 4 case.
 */
export const BRAND_RENDER_SCALES = [1, 2, 3, 4] as const
export type BrandRenderScale = typeof BRAND_RENDER_SCALES[number]

export const BRAND_RENDER_MAX_OUTPUT_SIDE = 8192

const SCALE_SET: ReadonlySet<number> = new Set<number>(BRAND_RENDER_SCALES)

export function isBrandRenderScale(value: unknown): value is BrandRenderScale {
  return typeof value === 'number' && SCALE_SET.has(value)
}

/**
 * The scales actually offerable for one canvas — every allowlisted scale whose
 * multiplied output stays inside `BRAND_RENDER_MAX_OUTPUT_SIDE`. The UI builds
 * its select from this; the render service enforces the same rule, so an
 * out-of-range scale is impossible to request honestly and refused otherwise.
 */
export function offerableRenderScales(width: number, height: number): BrandRenderScale[] {
  const side = Math.max(width, height)
  return BRAND_RENDER_SCALES.filter(scale => side * scale <= BRAND_RENDER_MAX_OUTPUT_SIDE)
}

/**
 * `POST .../brand-formats/render` and `.../save`'s body: generate from a
 * stored template's approved canvas.
 *
 * It carries no canvas size on purpose — a template IS its approved snapshot,
 * and its width and height are stored on the row. Letting the request restate
 * them would let a caller render an approved tree at a size nobody approved.
 */
export interface BrandTemplateGenerateRequest {
  templateId: string
  scale?: BrandRenderScale
  presetId?: string
  /**
   * Per-generation setting values, keyed by the snapshot's block ids.
   *
   * Applied over the snapshot at render time and never stored back, so two
   * assets can be generated from one approved template with different content.
   * Omitted = the approved settings, unchanged.
   */
  overrides?: BrandCanvasOverrides
}

/** The render endpoint's body. */
export type BrandRenderRequest = BrandTemplateGenerateRequest

// ─── Save response (server → admin) ──────────────────────────────────────────

/**
 * The media-library row a saved render becomes. Structurally the server's
 * `MediaRecord`, restated here because it crosses the wire: the admin must not
 * reach into `server/storage/types` for a shape the API happens to return today.
 */
export interface BrandFormatSavedAsset {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  createdAt: string
}

/**
 * `POST /api/admin/s/:siteId/brand-formats/save`'s reply. Unlike the PNG
 * render, this response is JSON, so non-fatal warnings ride in the body rather
 * than a header.
 *
 * `templateVersion` names the approval the bytes came from, so the saved asset
 * traces to specific reviewed content rather than to "that template".
 *
 * `kind` is the same discriminant `BrandGenerationRecord` carries — kept even
 * though the compiled-format producer it once distinguished from is gone, so a
 * consumer that switches on one keeps switching on the other for free if a
 * second producer ever returns.
 */
export interface BrandSaveResponse {
  kind: 'template'
  media: BrandFormatSavedAsset
  templateId: string
  /** Approved version rendered — the same value `X-Brand-Template-Version` reports. */
  templateVersion: number
  /** Output pixel size — the template row's canvas × scale. */
  width: number
  height: number
  warnings: string[]
}

// ─── Generation history (server → admin) ─────────────────────────────────────

/**
 * What every past "save to library" carries whatever produced it: identity,
 * when, and just enough of the joined media row to paint a thumbnail.
 *
 * `mediaId` / `url` / `filename` are nullable because the asset can be deleted
 * from the media library independently (`ON DELETE SET NULL`) — the recipe
 * outlives it and stays re-openable. The storage key never crosses this wire.
 */
interface BrandGenerationBase {
  id: string
  createdAt: string
  mediaId: string | null
  url: string | null
  filename: string | null
  /** Brand preset the recipe was generated under; null = pre-preset legacy row. */
  presetId: string | null
}

/**
 * A render of a stored template's approved canvas. It carries no canvas size —
 * the template row is the canvas — but it does carry the two halves of the
 * recipe: the approved `templateVersion` the bytes came from, and the
 * `overrides` applied over that snapshot. Together they reproduce the pixels;
 * the version alone only reproduces the approved content.
 *
 * `templateName` is LEFT JOINed at read time, not copied at write time — one
 * source of truth for the name. `null` means the template has been deleted; the
 * recipe survives it (there is no FK) and the gallery says so.
 */
export interface BrandTemplateGenerationRecord extends BrandGenerationBase {
  kind: 'template'
  templateId: string
  templateVersion: number
  /** Effective per-block setting overrides the render used; null = the approved content. */
  overrides: BrandCanvasOverrides | null
  templateName: string | null
  /** The template's CURRENT version, or null if it is gone. Compare to pin staleness. */
  currentTemplateVersion: number | null
}

/**
 * Kept as its own name (rather than folded into `BrandTemplateGenerationRecord`
 * directly) so a future second producer can widen this back into a union
 * without every existing consumer's import needing to change.
 */
export type BrandGenerationRecord = BrandTemplateGenerationRecord

/** `GET /api/admin/s/:siteId/brand-formats/generations[?templateId=…]`. */
export interface BrandGenerationListResponse {
  generations: BrandGenerationRecord[]
}

// ─── Render payload (server → headless page) ─────────────────────────────────

/**
 * The CANVAS arm of the same window-key mechanism: what the SPA canvas route
 * renders, whether it is driven by Chromium (export) or by the admin iframe
 * (preview). One route, one payload shape, so the preview cannot drift from
 * the thing that actually gets exported.
 *
 * `overrides` is a REQUIRED key that may be `null`, so "this generation applied
 * nothing" is distinguishable from "the field never made it across".
 */
export interface BrandCanvasRenderPayload {
  kind: 'canvas'
  snapshot: BrandCanvasSnapshot
  overrides: BrandCanvasOverrides | null
  /** Canvas pixel size before `scale` — the template row's, never the request's. */
  width: number
  height: number
  /**
   * The LIVE site shell — theme name, theme settings, type, tokens, motion —
   * resolved per generation by `resolveBrandCanvasTheme`.
   *
   * REQUIRED, not optional. An optional field means a build that forgot to send
   * it silently exports a theme-less asset in system-ui and default colours,
   * which is exactly the failure this contract exists to remove: such a PNG has
   * no diff, no reviewer and no later signal — it just ships wrong.
   */
  theme: BrandCanvasThemeLayer
}

/** The window property the render page reads its payload from. */
export const BRAND_RENDER_WINDOW_KEY = '__BRAND_RENDER__'

declare global {
  interface Window {
    /** Injected by puppeteer before navigation. `unknown` on purpose — the page guards it. */
    __BRAND_RENDER__?: unknown
  }
}

// ─── Guards ──────────────────────────────────────────────────────────────────

export function isBrandTemplateGenerateRequest(value: unknown): value is BrandTemplateGenerateRequest {
  if (!isRecord(value)) return false
  if (typeof value.templateId !== 'string' || value.templateId.length === 0) return false
  if (value.scale !== undefined && !isBrandRenderScale(value.scale)) return false
  if (value.presetId !== undefined && (typeof value.presetId !== 'string' || value.presetId.length === 0)) return false
  if (value.overrides !== undefined && !isBrandCanvasOverrides(value.overrides)) return false
  return true
}

/**
 * A failure must be visible (the route paints an error and flags the document)
 * rather than producing a plausible-looking but wrong PNG.
 *
 * Dimensions go through `isBrandCanvasDimension` — the same integer,
 * `BRAND_CANVAS_MIN_SIZE`..`BRAND_CANVAS_MAX_SIZE` bound the snapshot's own
 * `canvas.width`/`height` are held to — rather than a loose finite-positive
 * check, so `0.5` or `99999` fail here instead of reaching Chromium.
 */
export function isBrandCanvasRenderPayload(value: unknown): value is BrandCanvasRenderPayload {
  if (!isRecord(value)) return false
  if (value.kind !== 'canvas') return false
  // Before the snapshot: a payload with no usable theme cannot produce a
  // correct asset no matter how good its tree is, and the route must say so
  // rather than paint the canvas in fallback type.
  if (!isBrandCanvasThemeLayer(value.theme)) return false
  if (!isBrandCanvasDimension(value.width)) return false
  if (!isBrandCanvasDimension(value.height)) return false
  if (value.overrides !== null && !isBrandCanvasOverrides(value.overrides)) return false
  return isBrandCanvasSnapshot(value.snapshot)
}
