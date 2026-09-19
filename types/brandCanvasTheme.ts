import { isRecord } from '~/shared/types/guards'
import type { BrandRenderTokens } from '~/shared/types/brandFormat'
import type {
  TypographySnapshotPreset,
  TypographySnapshotRoles,
} from '~/server/services/typography/typographyTypes'

/**
 * Brand Content Studio — the SHELL half of a site's `ClientConfig`.
 *
 * Everything that decides how a canvas LOOKS, and nothing that decides what a
 * site CONTAINS. It rides in the render payload and in the admin arm's template
 * read, so one resolver feeds both transports and the iframe preview cannot
 * drift from the PNG the same template exports.
 *
 * Field names are identical to `ClientConfig`'s ON PURPOSE: the render page
 * spreads this straight into a `ClientConfig`, so a rename here is a silent
 * fidelity loss there. The three composables `app.vue` mounts on every route —
 * `useCssOverridesFromConfig`, `useFontFaces`, `useTypographyPresets` — are all
 * `computed` over that config, which is why no new CSS or font injection
 * machinery exists anywhere in this feature: supplying the keys IS the wiring.
 *
 * ── Explicit non-members (never add) ─────────────────────────────────────────
 * `pages`, `navigation`, `templates`, `childSites`, `configVersion`, `api`.
 * Those are the unbounded parts, and a `client` session can trigger a
 * generation whose admin arm returns this over HTTP — shipping them would push
 * whole-site draft content into a client-visible response. The resolver builds
 * by explicit key allowlist, never by spreading a full config.
 */
export interface BrandCanvasThemeLayer {
  /** Theme NAME (e.g. 'standalone'). Selects layouts, block registry, schemas. */
  theme: string
  themeSettings: Record<string, unknown>
  themeVars?: Record<string, string>
  /** variants + defaults + tokens + fontFaces, exactly as the client config carries them. */
  typography?: Record<string, unknown>
  typographyPresets?: TypographySnapshotPreset[]
  typographyRoles?: TypographySnapshotRoles
  spacingTokens?: Record<string, Record<string, string>>
  layout?: { layouts?: Array<{ id: string; label: string | Record<string, string> }> }
  motion?: Record<string, unknown>
  /**
   * The visual subset of Brand Identity that canvas primitives may bind to.
   * Voice rules and palette ROLE KEYS stay server-side; the renderer receives
   * only display copy, approved logo assets and already-resolved tokens.
   */
  brand?: BrandCanvasBrandLayer
}

export interface BrandCanvasBrandLayer {
  brandName: string
  tagline: string
  logoPrimary: string | null
  logoInverse: string | null
  logoMark: string | null
  tokens: BrandRenderTokens
}

function isRecordOfStrings(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(entry => typeof entry === 'string')
}

function isArrayOfRecords(value: unknown): boolean {
  return Array.isArray(value) && value.every(isRecord)
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isBrandFontToken(value: unknown): boolean {
  return isRecord(value)
    && typeof value.fontFamily === 'string'
    && typeof value.fontWeight === 'string'
    && typeof value.letterSpacing === 'string'
    && typeof value.textTransform === 'string'
    && typeof value.lineHeight === 'string'
}

function isBrandLayer(value: unknown): value is BrandCanvasBrandLayer {
  if (!isRecord(value)) return false
  if (typeof value.brandName !== 'string' || typeof value.tagline !== 'string') return false
  if (!isNullableString(value.logoPrimary)) return false
  if (!isNullableString(value.logoInverse)) return false
  if (!isNullableString(value.logoMark)) return false
  if (!isRecord(value.tokens)) return false
  return typeof value.tokens.primary === 'string'
    && typeof value.tokens.secondary === 'string'
    && typeof value.tokens.surface === 'string'
    && typeof value.tokens.onSurface === 'string'
    && isBrandFontToken(value.tokens.headline)
    && isBrandFontToken(value.tokens.body)
}

/**
 * Shape guard for the theme layer, run at BOTH ingress points (the injected
 * render payload and the admin template read).
 *
 * ── Guard strictness is deliberate ───────────────────────────────────────────
 * Only `theme` and `themeSettings` HARD-FAIL. Everything else is shape-checked
 * (record / array-of-records / record-of-strings) and never deep-validated.
 *
 * Deep-validating `typographyPresets` would re-implement the typography
 * contract in a second place, where it could disagree with the first; and the
 * blast radii are not comparable. A malformed preset degrades one CSS rule. A
 * wrong `theme` picks the wrong layouts, the wrong block registry and the wrong
 * schemas — it degrades the entire asset, which is why it is the one field that
 * must be right before anything paints.
 */
export function isBrandCanvasThemeLayer(value: unknown): value is BrandCanvasThemeLayer {
  if (!isRecord(value)) return false
  if (typeof value.theme !== 'string' || value.theme.length === 0) return false
  if (!isRecord(value.themeSettings)) return false

  if (value.themeVars !== undefined && !isRecordOfStrings(value.themeVars)) return false
  if (value.typography !== undefined && !isRecord(value.typography)) return false
  if (value.typographyPresets !== undefined && !isArrayOfRecords(value.typographyPresets)) return false
  if (value.typographyRoles !== undefined && !isRecordOfStrings(value.typographyRoles)) return false
  if (value.motion !== undefined && !isRecord(value.motion)) return false
  if (value.brand !== undefined && !isBrandLayer(value.brand)) return false

  if (value.spacingTokens !== undefined) {
    if (!isRecord(value.spacingTokens)) return false
    if (!Object.values(value.spacingTokens).every(isRecordOfStrings)) return false
  }

  if (value.layout !== undefined) {
    if (!isRecord(value.layout)) return false
    if (value.layout.layouts !== undefined && !isArrayOfRecords(value.layout.layouts)) return false
  }

  return true
}
