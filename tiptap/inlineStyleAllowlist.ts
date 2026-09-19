/**
 * Per-property validators for the inline style attribute. Each validator
 * either returns the canonicalized value (string) or null when the input is
 * not in the strict Phase 1 allowlist. Sanitizer + renderer both trust
 * `null` to mean "drop this declaration entirely".
 *
 * Phase 1 keeps the surface small: color, font-weight, font-size only.
 * Italic / underline / strikethrough live on semantic tags (<em>, <u>,
 * <s>) and are NOT exposed via inline style — duplicating them as
 * font-style / text-decoration would double the sanitizer surface for no
 * authoring win. font-family / letter-spacing / line-height /
 * text-transform are also deliberately deferred.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_RE = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/
const RGBA_RE = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/
const HSL_RE = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/
const HSLA_RE = /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*(0|1|0?\.\d+)\s*\)$/

export function validateColor(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (HEX_RE.test(v)) return v
  const m = RGB_RE.exec(v)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    if ([r, g, b].every(n => n >= 0 && n <= 255)) return v
    return null
  }
  const ma = RGBA_RE.exec(v)
  if (ma) {
    const [r, g, b] = [ma[1], ma[2], ma[3]].map(Number)
    if ([r, g, b].every(n => n >= 0 && n <= 255)) return v
    return null
  }
  const mh = HSL_RE.exec(v)
  if (mh) {
    const h = Number(mh[1])
    const s = Number(mh[2])
    const l = Number(mh[3])
    if (h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100) return v
    return null
  }
  const mha = HSLA_RE.exec(v)
  if (mha) {
    const h = Number(mha[1])
    const s = Number(mha[2])
    const l = Number(mha[3])
    if (h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100) return v
    return null
  }
  return null
}

export function validateFontWeight(input: string): string | null {
  const v = input.trim()
  if (!/^[1-9]00$/.test(v)) return null
  return v
}

export const ALLOWED_FONT_SIZES = [
  '0.75rem',
  '0.875rem',
  '1rem',
  '1.125rem',
  '1.25rem',
  '1.5rem',
  '2rem',
  '3rem',
] as const

export type AllowedFontSize = typeof ALLOWED_FONT_SIZES[number]

export function validateFontSize(input: string): string | null {
  const v = input.trim()
  return (ALLOWED_FONT_SIZES as readonly string[]).includes(v) ? v : null
}

/**
 * Validator dispatch table. Lets sanitizer/renderer iterate properties
 * generically. Property names are CSS-canonical (kebab-case).
 *
 * Phase 1 surface: color, font-weight, font-size. Nothing else.
 */
export const STYLE_VALIDATORS: Readonly<Record<string, (input: string) => string | null>> = {
  'color': validateColor,
  'font-weight': validateFontWeight,
  'font-size': validateFontSize,
}

export const ALLOWED_STYLE_PROPS = Object.freeze(Object.keys(STYLE_VALIDATORS))
