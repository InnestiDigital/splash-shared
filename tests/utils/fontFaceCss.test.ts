import { describe, it, expect } from 'vitest'
import {
  buildFontFaceCss,
  renderThemeVariantFaces,
  renderUploadedFontFaces,
} from '~/shared/utils/fontFaceCss'

describe('renderThemeVariantFaces', () => {
  it('emits a weight range and woff2-variations source for a variable variant', () => {
    const css = renderThemeVariantFaces([{
      name: 'fraunces-vf',
      family: 'Fraunces',
      file: 'Fraunces-VF',
      variable: true,
      axes: { wght: { min: 200, max: 900 }, slnt: { min: -10, max: 0 } },
    }])

    expect(css).toContain("font-family: 'Fraunces'")
    expect(css).toContain("url('/fonts/Fraunces-VF.woff2') format('woff2-variations')")
    expect(css).toContain('font-weight: 200 900')
    expect(css).toContain('font-style: oblique -10deg 0deg')
  })

  it('defaults a variable variant with no wght axis to the full 100–900 range', () => {
    const css = renderThemeVariantFaces([{ family: 'Axisless', file: 'Axisless-VF', variable: true }])
    expect(css).toContain('font-weight: 100 900')
    expect(css).toContain('font-style: normal')
  })

  it('emits the woff2 + woff pair for a static variant', () => {
    const css = renderThemeVariantFaces([{
      family: 'Heebo', file: 'heebo-italic', weight: 500, style: 'italic',
    }])

    expect(css).toContain("url('/fonts/heebo-italic.woff2') format('woff2')")
    expect(css).toContain("url('/fonts/heebo-italic.woff') format('woff')")
    expect(css).toContain('font-weight: 500')
    expect(css).toContain('font-style: italic')
  })

  it('falls back to weight 400 and normal style', () => {
    const css = renderThemeVariantFaces([{ family: 'Plain', file: 'plain' }])
    expect(css).toContain('font-weight: 400')
    expect(css).toContain('font-style: normal')
  })

  it('uses `name` when `family` is absent', () => {
    const css = renderThemeVariantFaces([{ name: 'display', file: 'display-regular' }])
    expect(css).toContain("font-family: 'display'")
  })

  it('skips malformed entries instead of emitting url(/fonts/undefined.woff2)', () => {
    const css = renderThemeVariantFaces([
      null,
      'nope',
      { family: 'NoFile' },
      { file: 'no-family' },
      { family: 'Good', file: 'good' },
    ])
    expect(css).not.toContain('undefined')
    expect(css.match(/@font-face/g)).toHaveLength(1)
    expect(css).toContain("font-family: 'Good'")
  })

  it('drops a file name that would break out of url()', () => {
    expect(renderThemeVariantFaces([{ family: 'Evil', file: "x') ; body { display: none } ('" }])).toBe('')
  })

  it('returns an empty string for no variants', () => {
    expect(renderThemeVariantFaces([])).toBe('')
  })
})

describe('renderUploadedFontFaces', () => {
  it('uses the stored URL verbatim and derives the format hint from it', () => {
    const css = renderUploadedFontFaces([
      { name: 'Author Sans', url: '/fonts/author-font.WOFF2', weight: 400, style: 'normal' },
      { name: 'Wide Sans', url: '/fonts/wide-sans.woff', weight: 500, style: 'italic' },
      { name: 'Old Serif', url: '/fonts/fallback-serif.ttf', weight: 600, style: 'normal' },
    ])

    expect(css).toContain("src: url('/fonts/author-font.WOFF2') format('woff2')")
    expect(css).toContain("src: url('/fonts/wide-sans.woff') format('woff')")
    expect(css).toContain("src: url('/fonts/fallback-serif.ttf') format('truetype')")
  })

  it('escapes the family name so a quote cannot terminate the declaration', () => {
    const css = renderUploadedFontFaces([{ name: "Author's \\Font", url: '/fonts/a.woff2' }])
    expect(css).toContain("font-family: 'Author\\'s \\\\Font'")
  })

  it('rejects URLs outside the allowlist', () => {
    const css = renderUploadedFontFaces([
      { name: 'Evil', url: 'https://evil.test/evil.woff2' },
      { name: 'Data', url: 'data:font/woff2;base64,AAAA' },
      { name: 'Fine', url: '/fonts/fine.woff2' },
    ])
    expect(css).not.toContain('evil.test')
    expect(css).not.toContain('data:')
    expect(css.match(/@font-face/g)).toHaveLength(1)
  })

  it('accepts the uploaded-font API URL shape', () => {
    const css = renderUploadedFontFaces([{
      name: 'Uploaded',
      url: '/api/fonts/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
    }])
    expect(css).toContain('/api/fonts/11111111-1111-1111-1111-111111111111/')
    // No extension in the path — the default hint applies.
    expect(css).toContain("format('woff2')")
  })

  it('defaults weight and style when the row omits them', () => {
    const css = renderUploadedFontFaces([{ name: 'Bare', url: '/fonts/bare.woff2', weight: null, style: null }])
    expect(css).toContain('font-weight: 400')
    expect(css).toContain('font-style: normal')
  })
})

describe('buildFontFaceCss', () => {
  it('concatenates theme variants before uploads', () => {
    const css = buildFontFaceCss(
      [{ family: 'ThemeFace', file: 'theme-face' }],
      [{ name: 'UploadFace', url: '/fonts/upload-face.woff2' }],
    )
    expect(css.indexOf('ThemeFace')).toBeLessThan(css.indexOf('UploadFace'))
  })

  it('omits the uploads section entirely when there are none', () => {
    expect(buildFontFaceCss([{ family: 'Only', file: 'only' }])).not.toMatch(/\n\n/)
  })

  it('returns an empty string when nothing is declared', () => {
    expect(buildFontFaceCss([], [])).toBe('')
  })
})
