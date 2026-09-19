/**
 * OKLCH color parsing, interpolation, and formatting utilities.
 * Used by VarAnimator to interpolate CSS custom properties of type 'color'.
 *
 * Pipeline: input string → sRGB → linear RGB → OKLab → OKLCH
 */

export interface OklchColor {
  l: number  // lightness 0–1
  c: number  // chroma ≥ 0
  h: number  // hue 0–360
  alpha: number // 0–1
}

// ---------------------------------------------------------------------------
// sRGB ↔ Linear RGB
// ---------------------------------------------------------------------------

function srgbToLinear(c: number): number {
  return c <= 0.04045
    ? c / 12.92
    : Math.pow((c + 0.055) / 1.055, 2.4)
}

// function linearToSrgb(c: number): number {
//   return c <= 0.0031308
//     ? c * 12.92
//     : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
// }

// ---------------------------------------------------------------------------
// Linear RGB → OKLab (using standard matrix math)
// ---------------------------------------------------------------------------

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  // Step 1: linear RGB → LMS (cone response)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  // Step 2: cube root
  const lc = Math.cbrt(l)
  const mc = Math.cbrt(m)
  const sc = Math.cbrt(s)

  // Step 3: LMS → OKLab
  const L = 0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc
  const a = 1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc
  const bLab = 0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc

  return [L, a, bLab]
}

// ---------------------------------------------------------------------------
// OKLab → OKLCH
// ---------------------------------------------------------------------------

function oklabToOklch(L: number, a: number, b: number): OklchColor {
  const c = Math.sqrt(a * a + b * b)
  let h = Math.atan2(b, a) * (180 / Math.PI)
  if (h < 0) h += 360
  return { l: L, c, h, alpha: 1 }
}

// ---------------------------------------------------------------------------
// Color string → sRGB components
// ---------------------------------------------------------------------------

function parseHex(input: string): [number, number, number, number] | null {
  const hex = input.replace('#', '')
  let r: number, g: number, b: number, a = 1

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255
    g = parseInt(hex[1] + hex[1], 16) / 255
    b = parseInt(hex[2] + hex[2], 16) / 255
  } else if (hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16) / 255
    g = parseInt(hex[1] + hex[1], 16) / 255
    b = parseInt(hex[2] + hex[2], 16) / 255
    a = parseInt(hex[3] + hex[3], 16) / 255
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16) / 255
    g = parseInt(hex.slice(2, 4), 16) / 255
    b = parseInt(hex.slice(4, 6), 16) / 255
  } else if (hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16) / 255
    g = parseInt(hex.slice(2, 4), 16) / 255
    b = parseInt(hex.slice(4, 6), 16) / 255
    a = parseInt(hex.slice(6, 8), 16) / 255
  } else {
    return null
  }

  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null
  return [r, g, b, a]
}

function parseRgb(input: string): [number, number, number, number] | null {
  const match = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (!match) return null
  const r = parseFloat(match[1]) / 255
  const g = parseFloat(match[2]) / 255
  const b = parseFloat(match[3]) / 255
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1
  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null
  return [r, g, b, a]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // h in degrees, s and l in 0–1
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  return [r + m, g + m, b + m]
}

function parseHsl(input: string): [number, number, number, number] | null {
  const match = input.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (!match) return null
  const h = parseFloat(match[1])
  const s = parseFloat(match[2]) / 100
  const l = parseFloat(match[3]) / 100
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1
  if (isNaN(h) || isNaN(s) || isNaN(l) || isNaN(a)) return null
  const [r, g, b] = hslToRgb(h, s, l)
  return [r, g, b, a]
}

function parseOklchDirect(input: string): OklchColor | null {
  const match = input.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/)
  if (!match) return null
  const l = parseFloat(match[1])
  const c = parseFloat(match[2])
  const h = parseFloat(match[3])
  const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1
  if (isNaN(l) || isNaN(c) || isNaN(h) || isNaN(alpha)) return null
  return { l, c, h, alpha }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a CSS color string to OKLCH.
 * Supports: hex (#rgb, #rrggbb, #rrggbbaa, #rgba), rgb(), rgba(), hsl(), hsla(), oklch().
 * Returns null on invalid input (no throw).
 */
export function parseToOklch(input: string): OklchColor | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try oklch() direct parse first
  if (trimmed.startsWith('oklch(')) {
    return parseOklchDirect(trimmed)
  }

  // Parse to sRGB components
  let srgb: [number, number, number, number] | null = null

  if (trimmed.startsWith('#')) {
    srgb = parseHex(trimmed)
  } else if (trimmed.startsWith('rgb')) {
    srgb = parseRgb(trimmed)
  } else if (trimmed.startsWith('hsl')) {
    srgb = parseHsl(trimmed)
  }

  if (!srgb) return null

  const [r, g, b, a] = srgb

  // sRGB → linear RGB
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  // linear RGB → OKLab → OKLCH
  const [L, labA, labB] = linearRgbToOklab(lr, lg, lb)
  const result = oklabToOklch(L, labA, labB)
  result.alpha = a

  return result
}

/**
 * Linear interpolation between two OKLCH colors.
 * Lerps each channel (l, c, h, alpha) independently.
 */
export function lerpOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: a.h + (b.h - a.h) * t,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  }
}

/**
 * Format an OKLCH color as a CSS oklch() string.
 * Omits alpha when alpha === 1.
 */
export function formatOklch(color: OklchColor): string {
  const l = round(color.l, 6)
  const c = round(color.c, 6)
  const h = round(color.h, 4)
  if (color.alpha >= 1) {
    return `oklch(${l} ${c} ${h})`
  }
  const a = round(color.alpha, 4)
  return `oklch(${l} ${c} ${h} / ${a})`
}

function round(n: number, digits: number): number {
  const factor = Math.pow(10, digits)
  return Math.round(n * factor) / factor
}
