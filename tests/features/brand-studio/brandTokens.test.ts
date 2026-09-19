import { describe, it, expect } from 'vitest'
import { buildBrandRenderTokens, asCssString } from '~/shared/features/brand-studio/brandTokens'
import { BRAND_RENDER_TOKENS_FALLBACK } from '~/shared/types/brandFormat'
import type { BrandIdentity } from '~/shared/types/brand'

const IDENTITY: BrandIdentity = {
  brandName: 'Test Studio',
  tagline: 'Small practice, long horizon',
  toneWords: 'quiet, precise',
  doRules: 'Say less.',
  dontRules: 'No exclamation marks.',
  brandPrimary: 'primaryColor',
  brandSecondary: 'secondaryColor',
  brandSurface: 'backgroundColor',
  brandOnSurface: 'textColor',
  headlineRole: 'heading1',
  bodyRole: 'body',
  logoPrimary: null,
  logoInverse: null,
  logoMark: null,
}

const RESOLVED = {
  primaryColor: '#1E3D4F',
  secondaryColor: '#C8A15A',
  backgroundColor: '#FFF',
  textColor: '#222222',
}

const PRESETS = [
  {
    key: 'display',
    isActive: true,
    fontFamily: 'Test Serif, serif',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    textTransform: 'uppercase',
    lineHeight: 1.1,
  },
  { key: 'copy', isActive: true, fontFamily: 'Test Sans, sans-serif' },
  { key: 'retired', isActive: false, fontFamily: 'Should Not Appear' },
]

const ROLES = [
  { role: 'heading1', presetKey: 'display' },
  { role: 'body', presetKey: 'copy' },
]

describe('asCssString', () => {
  it('passes through non-blank strings', () => {
    expect(asCssString('1.4em', 'x')).toBe('1.4em')
  })

  it('stringifies finite numbers so CSS never receives a number', () => {
    expect(asCssString(600, 'x')).toBe('600')
    expect(asCssString(0, 'x')).toBe('0')
  })

  it('falls back for blank, non-finite and non-scalar values', () => {
    expect(asCssString('   ', 'fb')).toBe('fb')
    expect(asCssString(Number.NaN, 'fb')).toBe('fb')
    expect(asCssString(Number.POSITIVE_INFINITY, 'fb')).toBe('fb')
    expect(asCssString(null, 'fb')).toBe('fb')
    expect(asCssString(undefined, 'fb')).toBe('fb')
    expect(asCssString({}, 'fb')).toBe('fb')
  })
})

describe('buildBrandRenderTokens', () => {
  it('resolves palette ROLE KEYS through the theme cascade and canonicalises hex', () => {
    const { tokens, warnings } = buildBrandRenderTokens(IDENTITY, RESOLVED, PRESETS, ROLES)

    expect(tokens.primary).toBe('#1e3d4f')
    expect(tokens.secondary).toBe('#c8a15a')
    // Shorthand hex is expanded, not passed through.
    expect(tokens.surface).toBe('#ffffff')
    expect(tokens.onSurface).toBe('#222222')
    expect(warnings).toEqual([])
  })

  it('resolves typography roles through the role → preset mapping', () => {
    const { tokens } = buildBrandRenderTokens(IDENTITY, RESOLVED, PRESETS, ROLES)

    expect(tokens.headline).toEqual({
      fontFamily: 'Test Serif, serif',
      fontWeight: '500',
      letterSpacing: '-0.01em',
      textTransform: 'uppercase',
      lineHeight: '1.1',
    })
    expect(tokens.body.fontFamily).toBe('Test Sans, sans-serif')
    expect(tokens.body.fontWeight).toBe('400')
    expect(tokens.body.letterSpacing).toBe('0em')
    expect(tokens.body.textTransform).toBe('none')
    expect(tokens.body.lineHeight).toBe('1.2')
  })

  it('refuses a palette value that is not parseable hex and names it', () => {
    const { tokens, warnings } = buildBrandRenderTokens(
      IDENTITY,
      { ...RESOLVED, textColor: 'var(--brand-ink)' },
      PRESETS,
      ROLES,
    )

    expect(tokens.onSurface).toBe(BRAND_RENDER_TOKENS_FALLBACK.onSurface)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('textColor')
    expect(warnings[0]).toContain('var(--brand-ink)')
  })

  it('ignores presets that are not active', () => {
    const { tokens, warnings } = buildBrandRenderTokens(
      IDENTITY,
      RESOLVED,
      PRESETS,
      [{ role: 'heading1', presetKey: 'retired' }, { role: 'body', presetKey: 'copy' }],
    )

    expect(tokens.headline).toEqual(BRAND_RENDER_TOKENS_FALLBACK.headline)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('heading1')
  })

  it('keeps a preset whose isActive flag is simply absent', () => {
    const { tokens } = buildBrandRenderTokens(
      IDENTITY,
      RESOLVED,
      [{ key: 'display', fontFamily: 'Undeclared, serif' }],
      [{ role: 'heading1', presetKey: 'display' }],
    )
    expect(tokens.headline.fontFamily).toBe('Undeclared, serif')
  })

  it('falls back to system type and warns once per unmapped role', () => {
    const { tokens, warnings } = buildBrandRenderTokens(IDENTITY, RESOLVED, PRESETS, [])

    expect(tokens.headline).toEqual(BRAND_RENDER_TOKENS_FALLBACK.headline)
    expect(tokens.body).toEqual(BRAND_RENDER_TOKENS_FALLBACK.body)
    expect(warnings).toHaveLength(2)
  })

  it('falls back for a palette role the theme does not define at all', () => {
    const { tokens, warnings } = buildBrandRenderTokens(IDENTITY, {}, PRESETS, ROLES)

    expect(tokens.primary).toBe(BRAND_RENDER_TOKENS_FALLBACK.primary)
    expect(tokens.secondary).toBe(BRAND_RENDER_TOKENS_FALLBACK.secondary)
    expect(tokens.surface).toBe(BRAND_RENDER_TOKENS_FALLBACK.surface)
    expect(tokens.onSurface).toBe(BRAND_RENDER_TOKENS_FALLBACK.onSurface)
    // An absent role resolves straight to the fallback hex, which parses — so
    // it is not a warning, unlike a value that is present but unusable.
    expect(warnings).toEqual([])
  })
})
