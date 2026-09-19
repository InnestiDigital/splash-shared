import { escapeCssString, isSafeFontUrl } from '~/shared/utils/cssEscape'

/**
 * `@font-face` rule generation, shared by every surface that has to render the
 * brand's real type.
 *
 * Three surfaces need identical rules or the Brand Content Studio lies to the
 * author: the admin studio preview, the headless render page that Chromium
 * screenshots, and the admin typography editor. This module is the one
 * implementation; `admin/composables/useAdminFontFaces.ts` delegates to it.
 *
 * Inputs are treated as WIRE DATA (theme `theme.json` fragments, DB rows), so
 * every field is narrowed with a guard instead of asserted — a malformed
 * variant is skipped, never emitted as `url('/fonts/undefined.woff2')`.
 *
 * Pure, synchronous, no `import.meta.glob` ⇒ safe to import from `server/`.
 */

/** A theme-bundled variant, served from `/fonts/<file>.woff2`. */
export interface ThemeFontVariant {
  /** Family name; falls back to `name` when absent (theme.json convention). */
  family?: string
  name?: string
  /** Basename under `public/fonts`, without extension. */
  file: string
  weight?: number
  style?: string
  variable?: boolean
  axes?: Record<string, { min?: number; max?: number }>
}

/** An editor-uploaded font, served from `/api/fonts/<siteId>/<fontId>`. */
export interface UploadedFontFace {
  name: string
  url: string
  weight?: number | null
  style?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readAxisRange(axes: unknown, axis: string): { min: number; max: number } | null {
  if (!isRecord(axes)) return null
  const range = axes[axis]
  if (!isRecord(range)) return null
  const { min, max } = range
  if (typeof min !== 'number' || typeof max !== 'number') return null
  return { min, max }
}

function readWeight(source: Record<string, unknown>): number {
  const weight = source.weight
  return typeof weight === 'number' && Number.isFinite(weight) ? weight : 400
}

/** Derives the CSS `format()` hint from a URL. Uploads are woff2 in practice. */
function formatHint(src: string): string {
  const lower = src.toLowerCase()
  if (lower.includes('.woff2')) return 'woff2'
  if (lower.includes('.woff')) return 'woff'
  if (lower.includes('.ttf')) return 'truetype'
  if (lower.includes('.otf')) return 'opentype'
  return 'woff2'
}

/**
 * Theme-declared variants.
 *
 * Variable variants get `format('woff2-variations')` plus a `font-weight` RANGE
 * derived from the `wght` axis (and an oblique range from `slnt` when declared)
 * — without the range the browser picks one static instance and silently
 * ignores `font-variation-settings`. Static variants get the woff2+woff pair.
 */
export function renderThemeVariantFaces(variants: readonly unknown[]): string {
  const rules: string[] = []

  for (const variant of variants) {
    if (!isRecord(variant)) continue
    const file = readString(variant, 'file')
    if (file === null) continue

    const family = readString(variant, 'family') ?? readString(variant, 'name')
    if (family === null) continue

    const style = readString(variant, 'style') ?? 'normal'
    const woff2 = `/fonts/${file}.woff2`
    const woff = `/fonts/${file}.woff`
    // A theme file name with a quote or paren would break out of url(); skip it
    // rather than emit injectable CSS.
    if (!isSafeFontUrl(woff2) || !isSafeFontUrl(woff)) continue

    const wght = variant.variable === true ? readAxisRange(variant.axes, 'wght') : null
    if (variant.variable === true) {
      const wghtRange = wght ? `${wght.min} ${wght.max}` : '100 900'
      const slnt = readAxisRange(variant.axes, 'slnt')
      const styleDecl = slnt
        ? `font-style: oblique ${slnt.min}deg ${slnt.max}deg;`
        : `font-style: ${style};`
      rules.push(`@font-face {
  font-family: '${escapeCssString(family)}';
  src: url('${woff2}') format('woff2-variations');
  font-weight: ${wghtRange};
  ${styleDecl}
  font-display: swap;
}`)
      continue
    }

    rules.push(`@font-face {
  font-family: '${escapeCssString(family)}';
  src: url('${woff2}') format('woff2'),
       url('${woff}') format('woff');
  font-weight: ${readWeight(variant)};
  font-style: ${style};
  font-display: swap;
}`)
  }

  return rules.join('\n')
}

/**
 * Editor-uploaded fonts. `url` is already fully qualified
 * (`/api/fonts/<siteId>/<fontId>`), so it is NOT prefixed with `/fonts/`.
 * Unsafe URLs are dropped — `isSafeFontUrl` is an allowlist, not a sanitiser.
 */
export function renderUploadedFontFaces(fonts: readonly unknown[]): string {
  const rules: string[] = []

  for (const font of fonts) {
    if (!isRecord(font)) continue
    const name = readString(font, 'name')
    const url = readString(font, 'url')
    if (name === null || url === null || !isSafeFontUrl(url)) continue

    rules.push(`@font-face {
  font-family: '${escapeCssString(name)}';
  src: url('${url}') format('${formatHint(url)}');
  font-weight: ${readWeight(font)};
  font-style: ${readString(font, 'style') ?? 'normal'};
  font-display: swap;
}`)
  }

  return rules.join('\n')
}

/** Theme variants first, uploads second — uploads win on a family-name clash. */
export function buildFontFaceCss(
  variants: readonly unknown[],
  uploaded: readonly unknown[] = [],
): string {
  return [renderThemeVariantFaces(variants), renderUploadedFontFaces(uploaded)]
    .filter(part => part.length > 0)
    .join('\n')
}
