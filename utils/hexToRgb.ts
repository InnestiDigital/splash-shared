/**
 * Hex color → "r, g, b" channel string for use inside CSS rgba() expressions,
 * e.g. `rgba(${hexToRgb('#1B8AB7')}, 0.4)`.
 *
 * Accepts (with or without a leading '#'):
 *   - 3-digit shorthand   (#fff)        → expanded per-nibble
 *   - 4-digit shorthand   (#fff8)       → alpha nibble dropped
 *   - 6-digit             (#rrggbb)
 *   - 8-digit             (#rrggbbaa)   → alpha byte dropped
 *
 * Alpha is intentionally discarded — callers supply opacity separately as the
 * rgba() fourth argument. Any malformed input (wrong length, non-hex chars,
 * null/empty) falls back to black so a bad authored color can never emit an
 * invalid CSS value.
 */
const FALLBACK = '0, 0, 0'
const HEX_RE = /^[0-9a-fA-F]+$/

export function hexToRgb(hex: string | null | undefined): string {
  if (!hex) return FALLBACK
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (!HEX_RE.test(clean)) return FALLBACK

  let r: string, g: string, b: string
  if (clean.length === 3 || clean.length === 4) {
    // Shorthand: each nibble is doubled; trailing alpha nibble (len 4) ignored.
    r = clean[0] + clean[0]
    g = clean[1] + clean[1]
    b = clean[2] + clean[2]
  } else if (clean.length === 6 || clean.length === 8) {
    // Full form; trailing alpha byte (len 8) ignored.
    r = clean.slice(0, 2)
    g = clean.slice(2, 4)
    b = clean.slice(4, 6)
  } else {
    return FALLBACK
  }

  return `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}`
}
