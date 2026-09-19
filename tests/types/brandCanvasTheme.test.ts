import { describe, it, expect } from 'vitest'
import { isBrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'

/**
 * The theme layer crosses two boundaries (the injected render payload and the
 * admin template read) and is parsed once on each. What is worth pinning is the
 * DELIBERATE ASYMMETRY of the guard: `theme` and `themeSettings` hard-fail,
 * everything else is shape-checked and never deep-validated. A malformed preset
 * degrades one CSS rule; a wrong theme degrades the whole asset.
 */

const MINIMAL = { theme: 'standalone', themeSettings: {} }

describe('isBrandCanvasThemeLayer — the two fields that hard-fail', () => {
  it('accepts the minimum: a theme name and a settings record', () => {
    expect(isBrandCanvasThemeLayer(MINIMAL)).toBe(true)
  })

  it('rejects a missing, empty or non-string theme name', () => {
    expect(isBrandCanvasThemeLayer({ themeSettings: {} })).toBe(false)
    expect(isBrandCanvasThemeLayer({ theme: '', themeSettings: {} })).toBe(false)
    expect(isBrandCanvasThemeLayer({ theme: 3, themeSettings: {} })).toBe(false)
  })

  it('rejects themeSettings that is not a record', () => {
    expect(isBrandCanvasThemeLayer({ theme: 'standalone' })).toBe(false)
    expect(isBrandCanvasThemeLayer({ theme: 'standalone', themeSettings: [] })).toBe(false)
    expect(isBrandCanvasThemeLayer({ theme: 'standalone', themeSettings: null })).toBe(false)
  })

  it('rejects anything that is not a record at all', () => {
    expect(isBrandCanvasThemeLayer(null)).toBe(false)
    expect(isBrandCanvasThemeLayer('standalone')).toBe(false)
    expect(isBrandCanvasThemeLayer([MINIMAL])).toBe(false)
  })
})

describe('isBrandCanvasThemeLayer — the optional shell keys', () => {
  it('accepts a fully populated layer', () => {
    expect(isBrandCanvasThemeLayer({
      ...MINIMAL,
      themeVars: { '--color-accent': '#123456' },
      typography: { variants: [{ name: 'a', file: 'a' }], fontFaces: [] },
      typographyPresets: [{ key: 'body', name: 'Body' }],
      typographyRoles: { body: 'body' },
      spacingTokens: { comfortable: { '--space-md': '16px' } },
      layout: { layouts: [{ id: 'blank', label: 'Blank' }] },
      motion: { defaultDuration: 600 },
      brand: {
        brandName: 'Studio',
        tagline: 'Build clearly',
        logoPrimary: '/logo.svg',
        logoInverse: null,
        logoMark: '/mark.svg',
        tokens: {
          primary: '#112233', secondary: '#445566', surface: '#ffffff', onSurface: '#111111',
          headline: { fontFamily: 'sans-serif', fontWeight: '700', letterSpacing: '0', textTransform: 'none', lineHeight: '1.1' },
          body: { fontFamily: 'sans-serif', fontWeight: '400', letterSpacing: '0', textTransform: 'none', lineHeight: '1.4' },
        },
      },
    })).toBe(true)
  })

  it('treats every optional key as absent-is-fine', () => {
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, themeVars: undefined, motion: undefined })).toBe(true)
  })

  it('rejects an optional key of the wrong SHAPE', () => {
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, themeVars: { a: 1 } })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, typography: [] })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, typographyPresets: {} })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, typographyPresets: ['body'] })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, typographyRoles: { body: 3 } })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, spacingTokens: { md: '16px' } })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, layout: [] })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, layout: { layouts: 'blank' } })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, motion: [] })).toBe(false)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, brand: { brandName: 'Studio' } })).toBe(false)
  })

  it('does NOT deep-validate a preset — that contract lives in one place only', () => {
    // A preset missing every field still passes: re-implementing the typography
    // contract here would give it a second definition to disagree with.
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, typographyPresets: [{}] })).toBe(true)
    expect(isBrandCanvasThemeLayer({ ...MINIMAL, layout: { layouts: [{}] } })).toBe(true)
  })
})
