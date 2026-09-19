import type { BrandRenderTokens } from '~/shared/types/brandFormat'

/**
 * Format-local surface resolution.
 *
 * A template's `surfaceRole` field stores a BRAND CONTRACT role key (never a
 * colour). This maps that key onto the resolved palette and derives a legible
 * foreground + accent for it, so no template ever picks a literal colour.
 */
export type BrandSurfaceRole = 'brandSurface' | 'brandPrimary' | 'brandOnSurface'

export interface ResolvedSurface {
  background: string
  foreground: string
  /** Used for rules, eyebrows and the accent bar. */
  accent: string
  /** Legible foreground for a fill of `accent` (bottom-bar bands). */
  onAccent: string
  /** True when the surface is dark — drives logo variant + scrim direction. */
  isDark: boolean
  /**
   * True when no brand colour cleared the contrast floor against this surface
   * and the accent fell back to the plain foreground. Surfaced by the studio so
   * "why is my accent white?" is answerable instead of mysterious.
   */
  accentIsFallback: boolean
}

const SURFACE_ROLES: ReadonlySet<string> = new Set<BrandSurfaceRole>([
  'brandSurface',
  'brandPrimary',
  'brandOnSurface',
])

export function isBrandSurfaceRole(value: unknown): value is BrandSurfaceRole {
  return typeof value === 'string' && SURFACE_ROLES.has(value)
}

const HEX_RE = /^[0-9a-f]{6}$/

/**
 * Canonicalises `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` to `#rrggbb`.
 * Returns null for anything else (named colours, `rgb()`, CSS vars) so callers
 * must decide explicitly rather than inheriting a wrong-polarity guess.
 */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '').toLowerCase()
  const rgb = raw.length === 3 || raw.length === 4
    ? raw.slice(0, 3).split('').map(c => c + c).join('')
    : raw.length === 8
      ? raw.slice(0, 6)
      : raw
  return HEX_RE.test(rgb) ? `#${rgb}` : null
}

/**
 * Relative luminance (sRGB, WCAG 2.x). Null when the colour is not parseable
 * hex — an unknown luminance must not masquerade as "light".
 */
export function luminance(hex: string): number | null {
  const normalized = normalizeHex(hex)
  if (normalized === null) return null
  const digits = normalized.slice(1)
  const channel = (offset: number): number => {
    const value = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** WCAG contrast ratio (1–21), or null when either colour is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Minimum accent-vs-surface contrast. Deliberately far below the 4.5 text floor:
 * an accent rule is decoration, it only has to be *seen*. A ratio is the right
 * metric here — an absolute luminance delta systematically erases the brand on
 * dark surfaces, where all real luminances are crowded near zero.
 */
export const ACCENT_MIN_CONTRAST = 1.5

/** Dark-surface threshold on relative luminance. */
const DARK_SURFACE_LUMINANCE = 0.4

function pickForeground(background: string, tokens: BrandRenderTokens, isDark: boolean): string {
  const preferred = isDark ? tokens.surface : tokens.onSurface
  const alternate = isDark ? tokens.onSurface : tokens.surface
  // A foreground identical to the background is never an answer, whatever the
  // ratios say (they are unknowable when the colour is not parseable hex).
  if (preferred === background) return alternate
  if (alternate === background) return preferred
  const preferredRatio = contrastRatio(preferred, background) ?? 0
  const alternateRatio = contrastRatio(alternate, background) ?? 0
  return alternateRatio > preferredRatio ? alternate : preferred
}

export function resolveSurface(role: string, tokens: BrandRenderTokens): ResolvedSurface {
  const surfaceRole: BrandSurfaceRole = isBrandSurfaceRole(role) ? role : 'brandSurface'

  // Exhaustive over the surface-role union; `never` default is compiler-enforced.
  let background: string
  switch (surfaceRole) {
    case 'brandSurface': background = tokens.surface; break
    case 'brandPrimary': background = tokens.primary; break
    case 'brandOnSurface': background = tokens.onSurface; break
    default: {
      const exhaustive: never = surfaceRole
      throw new Error(`Unhandled brand surface role: ${String(exhaustive)}`)
    }
  }

  const backgroundLuminance = luminance(background)
  // Unparseable background => treat as dark. Light-on-dark stays readable if the
  // guess is wrong; dark-on-dark does not.
  const isDark = backgroundLuminance === null || backgroundLuminance < DARK_SURFACE_LUMINANCE
  const foreground = pickForeground(background, tokens, isDark)

  // Try the brand's own colours in preference order before giving up on colour.
  // A single absolute-delta test would drop the brand entirely on dark surfaces.
  const candidates = isDark
    ? [tokens.secondary, tokens.primary, tokens.surface]
    : [tokens.primary, tokens.secondary, tokens.onSurface]
  const survivor = candidates.find(candidate => (contrastRatio(candidate, background) ?? 0) >= ACCENT_MIN_CONTRAST)
  const accentIsFallback = survivor === undefined || survivor === foreground
  const accent = survivor ?? foreground

  return {
    background,
    foreground,
    accent,
    onAccent: pickForeground(accent, tokens, (luminance(accent) ?? 0) < DARK_SURFACE_LUMINANCE),
    isDark,
    accentIsFallback,
  }
}

/** Picks the logo asset that survives on this surface, or null for a wordmark. */
export function logoForSurface(
  surface: ResolvedSurface,
  logoPrimary: string | null,
  logoInverse: string | null,
): string | null {
  if (surface.isDark) return logoInverse ?? logoPrimary
  return logoPrimary ?? logoInverse
}
