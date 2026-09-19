import { describe, it, expect } from 'vitest'
import {
  ACCENT_MIN_CONTRAST,
  contrastRatio,
  isBrandSurfaceRole,
  logoForSurface,
  luminance,
  normalizeHex,
  resolveSurface,
} from '~/shared/features/brand-studio/surface'
import type { BrandRenderTokens } from '~/shared/types/brandFormat'

const FONT = {
  fontFamily: 'Test Serif, serif',
  fontWeight: '400',
  letterSpacing: '0em',
  textTransform: 'none',
  lineHeight: '1.2',
}

function tokens(overrides: Partial<BrandRenderTokens> = {}): BrandRenderTokens {
  return {
    primary: '#1e3d4f',
    secondary: '#c8a15a',
    surface: '#ffffff',
    onSurface: '#111111',
    headline: FONT,
    body: FONT,
    ...overrides,
  }
}

describe('normalizeHex', () => {
  it.each([
    ['#ABC', '#aabbcc'],
    ['abc', '#aabbcc'],
    ['  #FFF  ', '#ffffff'],
    ['#1E3D4F', '#1e3d4f'],
    ['#abcd', '#aabbcc'],
    ['#aabbccdd', '#aabbcc'],
  ])('canonicalises %s to %s', (input, expected) => {
    expect(normalizeHex(input)).toBe(expected)
  })

  it.each([
    ['rgb(0, 0, 0)'],
    ['rgba(0,0,0,0.5)'],
    ['rebeccapurple'],
    ['var(--color-accent)'],
    ['#12345'],
    ['#gggggg'],
    [''],
  ])('refuses %s', (input) => {
    expect(normalizeHex(input)).toBeNull()
  })
})

describe('luminance', () => {
  it('anchors at the sRGB extremes', () => {
    expect(luminance('#ffffff')).toBe(1)
    expect(luminance('#000000')).toBe(0)
  })

  it('applies the sRGB transfer curve, not a linear ramp', () => {
    // Mid grey is ~0.216 relative luminance, nowhere near 0.5.
    expect(luminance('#808080')).toBeCloseTo(0.2159, 4)
  })

  it('uses the sub-threshold linear segment for very dark channels', () => {
    expect(luminance('#010101')).toBeCloseTo(0.000304, 5)
  })

  it('is null for an unparseable colour rather than guessing "light"', () => {
    expect(luminance('rgb(10, 10, 10)')).toBeNull()
    expect(luminance('var(--brand)')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6)
    expect(contrastRatio('#1e3d4f', '#1e3d4f')).toBeCloseTo(1, 6)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#111111', '#ffffff')).toBe(contrastRatio('#ffffff', '#111111'))
  })

  it('is null when either colour is unparseable', () => {
    expect(contrastRatio('#ffffff', 'rgb(0,0,0)')).toBeNull()
    expect(contrastRatio('nope', '#000000')).toBeNull()
  })
})

describe('isBrandSurfaceRole', () => {
  it('accepts the three contract roles and nothing else', () => {
    expect(isBrandSurfaceRole('brandSurface')).toBe(true)
    expect(isBrandSurfaceRole('brandPrimary')).toBe(true)
    expect(isBrandSurfaceRole('brandOnSurface')).toBe(true)
    expect(isBrandSurfaceRole('brandSecondary')).toBe(false)
    expect(isBrandSurfaceRole('#ffffff')).toBe(false)
  })
})

describe('resolveSurface', () => {
  it('maps each role key onto its palette slot', () => {
    expect(resolveSurface('brandSurface', tokens()).background).toBe('#ffffff')
    expect(resolveSurface('brandPrimary', tokens()).background).toBe('#1e3d4f')
    expect(resolveSurface('brandOnSurface', tokens()).background).toBe('#111111')
  })

  it('falls back to the brand surface for an unknown role', () => {
    expect(resolveSurface('brandTertiary', tokens()).background).toBe('#ffffff')
    expect(resolveSurface('', tokens()).background).toBe('#ffffff')
  })

  it('classifies light and dark surfaces', () => {
    expect(resolveSurface('brandSurface', tokens()).isDark).toBe(false)
    expect(resolveSurface('brandOnSurface', tokens()).isDark).toBe(true)
    expect(resolveSurface('brandPrimary', tokens()).isDark).toBe(true)
  })

  it('treats an unparseable background as dark and gives up on the accent', () => {
    // No luminance means no legibility judgement is possible; guessing "light"
    // would paint dark type on a possibly-dark canvas.
    const resolved = resolveSurface('brandPrimary', tokens({ primary: 'var(--mystery)' }))
    expect(resolved.isDark).toBe(true)
    expect(resolved.foreground).toBe('#ffffff')
    expect(resolved.accent).toBe('#ffffff')
    expect(resolved.accentIsFallback).toBe(true)
  })

  it('never returns a foreground equal to the background', () => {
    const resolved = resolveSurface('brandSurface', tokens({ surface: 'var(--mystery)' }))
    expect(resolved.foreground).not.toBe(resolved.background)
  })

  it('picks the foreground with the most contrast against the surface', () => {
    expect(resolveSurface('brandSurface', tokens()).foreground).toBe('#111111')
    expect(resolveSurface('brandOnSurface', tokens()).foreground).toBe('#ffffff')
  })

  it('keeps a brand colour as the accent when it clears the contrast floor', () => {
    const dark = resolveSurface('brandOnSurface', tokens())
    expect(dark.accent).toBe('#c8a15a')
    expect(dark.accentIsFallback).toBe(false)

    const light = resolveSurface('brandSurface', tokens())
    expect(light.accent).toBe('#1e3d4f')
    expect(light.accentIsFallback).toBe(false)
  })

  it('uses a contrast RATIO, not an absolute luminance delta', () => {
    // #1e3d4f on #222222: luminance delta is only 0.026 — an absolute test would
    // discard it — but the WCAG ratio is 1.39, which is genuinely too low.
    // The point of the ratio is that dark-on-dark pairs are judged on the same
    // scale as light ones, not systematically erased.
    expect(contrastRatio('#1e3d4f', '#222222')).toBeCloseTo(1.39, 2)
    const nearlyBlackOnBlack = contrastRatio('#0a0a0a', '#000000') ?? 0
    expect(nearlyBlackOnBlack).toBeLessThan(ACCENT_MIN_CONTRAST)
  })

  it('tries every brand colour before giving up on colour', () => {
    // On a light surface the primary is tried first. Here it is near-white and
    // collides, so the search must fall through to the secondary.
    const resolved = resolveSurface('brandSurface', tokens({ primary: '#fdfdfd' }))
    expect(resolved.accent).toBe('#c8a15a')
    expect(resolved.accentIsFallback).toBe(false)
  })

  it('flags the fallback when no brand colour survives the surface', () => {
    // A monochrome brand: primary === secondary and both collide with the
    // deep surface. The accent has to become the plain foreground.
    const resolved = resolveSurface('brandOnSurface', tokens({
      primary: '#1e3d4f',
      secondary: '#1e3d4f',
      onSurface: '#222222',
    }))
    expect(resolved.background).toBe('#222222')
    expect(resolved.accent).toBe(resolved.foreground)
    expect(resolved.accentIsFallback).toBe(true)
  })

  it('derives a legible foreground for a fill of the accent', () => {
    const dark = resolveSurface('brandOnSurface', tokens())
    // Gold accent => the dark on-surface colour reads on it, not white.
    expect(dark.onAccent).toBe('#111111')

    const light = resolveSurface('brandSurface', tokens())
    // Deep navy accent => white reads on it.
    expect(light.onAccent).toBe('#ffffff')
  })

  it('is pure — the same inputs always resolve identically', () => {
    expect(resolveSurface('brandPrimary', tokens())).toEqual(resolveSurface('brandPrimary', tokens()))
  })
})

describe('logoForSurface', () => {
  const dark = { background: '#111111', foreground: '#ffffff', accent: '#c8a15a', onAccent: '#111111', isDark: true, accentIsFallback: false }
  const light = { background: '#ffffff', foreground: '#111111', accent: '#1e3d4f', onAccent: '#ffffff', isDark: false, accentIsFallback: false }

  it('prefers the inverse mark on a dark surface', () => {
    expect(logoForSurface(dark, '/primary.svg', '/inverse.svg')).toBe('/inverse.svg')
  })

  it('prefers the primary mark on a light surface', () => {
    expect(logoForSurface(light, '/primary.svg', '/inverse.svg')).toBe('/primary.svg')
  })

  it('falls back to whichever asset exists', () => {
    expect(logoForSurface(dark, '/primary.svg', null)).toBe('/primary.svg')
    expect(logoForSurface(light, null, '/inverse.svg')).toBe('/inverse.svg')
  })

  it('returns null when the brand has no logo assets — the template draws a wordmark', () => {
    expect(logoForSurface(dark, null, null)).toBeNull()
    expect(logoForSurface(light, null, null)).toBeNull()
  })
})
