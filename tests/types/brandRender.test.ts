import { describe, it, expect } from 'vitest'
import {
  isBrandTemplateGenerateRequest,
  isBrandRenderScale,
  isBrandCanvasRenderPayload,
  BRAND_RENDER_SCALES,
} from '~/shared/types/brandRender'
import { BRAND_CANVAS_OVERRIDE_MAX_BLOCKS } from '~/shared/types/brandCanvas'

describe('isBrandRenderScale', () => {
  it('accepts every declared scale', () => {
    for (const scale of BRAND_RENDER_SCALES) expect(isBrandRenderScale(scale)).toBe(true)
  })

  it('rejects anything else, including numeric strings and out-of-range factors', () => {
    for (const bad of [0, 5, 1.5, -1, '1', null, undefined, Number.NaN]) {
      expect(isBrandRenderScale(bad)).toBe(false)
    }
  })
})

describe('isBrandTemplateGenerateRequest', () => {
  it('accepts the minimal body and the fully-specified one', () => {
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1' })).toBe(true)
    expect(isBrandTemplateGenerateRequest({
      templateId: 'tpl-1', scale: 2, presetId: 'p1', overrides: { 'block-1': { headline: 'x' } },
    })).toBe(true)
  })

  it('rejects overrides that are not a block-keyed map of settings maps', () => {
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: 'x' })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: null })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: ['x'] })).toBe(false)
    // A flat map is the OLD slot shape: settings must be nested under a block id.
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: { 'block-1': 'x' } })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: { 'block-1': null } })).toBe(false)
  })

  it('rejects overrides past the block-count cap', () => {
    const atCap = Object.fromEntries(
      Array.from({ length: BRAND_CANVAS_OVERRIDE_MAX_BLOCKS }, (_, i) => [`b${i}`, { headline: 'x' }]),
    )
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', overrides: atCap })).toBe(true)
    expect(isBrandTemplateGenerateRequest({
      templateId: 'tpl-1',
      overrides: { ...atCap, extra: { headline: 'x' } },
    })).toBe(false)
  })

  it('rejects a missing or empty templateId', () => {
    expect(isBrandTemplateGenerateRequest({})).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: '' })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 7 })).toBe(false)
  })

  it('rejects an out-of-contract scale or an empty presetId', () => {
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', scale: 5 })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', scale: '2' })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', presetId: '' })).toBe(false)
    expect(isBrandTemplateGenerateRequest({ templateId: 'tpl-1', presetId: 5 })).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isBrandTemplateGenerateRequest(null)).toBe(false)
    expect(isBrandTemplateGenerateRequest('tpl-1')).toBe(false)
    expect(isBrandTemplateGenerateRequest([{ templateId: 'tpl-1' }])).toBe(false)
  })

  it('rejects a body with no templateId even if it carries other keys', () => {
    expect(isBrandTemplateGenerateRequest({ formatId: 'og-card', settings: {} })).toBe(false)
  })
})

describe('isBrandCanvasRenderPayload', () => {
  const SNAPSHOT = {
    canvas: { width: 1200, height: 630 },
    sections: [],
    blocks: [{
      id: 'block-1',
      type: 'hero',
      position: 0,
      sectionId: null,
      layoutRole: null,
      settings: { headline: 'Approved' },
      options: null,
      placement: null,
    }],
  }

  const THEME = { theme: 'standalone', themeSettings: { siteName: 'Studio' } }

  const CANVAS_PAYLOAD = {
    kind: 'canvas',
    snapshot: SNAPSHOT,
    overrides: null,
    width: 1200,
    height: 630,
    theme: THEME,
  }

  it('accepts a payload with and without overrides', () => {
    expect(isBrandCanvasRenderPayload(CANVAS_PAYLOAD)).toBe(true)
    expect(isBrandCanvasRenderPayload({
      ...CANVAS_PAYLOAD,
      overrides: { 'block-1': { headline: 'Generated' } },
    })).toBe(true)
  })

  it('requires the overrides key even when nothing is overridden', () => {
    const { overrides: _dropped, ...rest } = CANVAS_PAYLOAD
    expect(isBrandCanvasRenderPayload(rest)).toBe(false)
  })

  it('rejects a missing kind, a malformed snapshot and a non-positive size', () => {
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, kind: 'format' })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, snapshot: {} })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, width: 0 })).toBe(false)
    expect(isBrandCanvasRenderPayload(null)).toBe(false)
  })

  it('REQUIRES the theme layer — an omitted one would export a theme-less asset', () => {
    // Not optional on purpose: a build that forgot to send it must fail loudly
    // rather than ship a plausible PNG in system-ui and default colours.
    const { theme: _dropped, ...rest } = CANVAS_PAYLOAD
    expect(isBrandCanvasRenderPayload(rest)).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, theme: { themeSettings: {} } })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, theme: { theme: '', themeSettings: {} } })).toBe(false)
  })

  it('accepts a theme layer carrying the optional shell keys', () => {
    expect(isBrandCanvasRenderPayload({
      ...CANVAS_PAYLOAD,
      theme: {
        ...THEME,
        themeVars: { '--color-accent': '#123456' },
        typography: { variants: [] },
        typographyPresets: [{ key: 'body' }],
        typographyRoles: { body: 'body' },
        spacingTokens: { md: { '--space': '16px' } },
        layout: { layouts: [{ id: 'blank', label: 'Blank' }] },
        motion: { defaultDuration: 600 },
      },
    })).toBe(true)
  })

  it('holds width/height to the same bounded-integer check the snapshot canvas uses', () => {
    // Non-integer and out-of-range sizes must fail, not just non-positive ones —
    // this is `isBrandCanvasDimension`, not a loose finite-positive check.
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, width: 0.5 })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, width: 99999 })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, height: 0.5 })).toBe(false)
    expect(isBrandCanvasRenderPayload({ ...CANVAS_PAYLOAD, height: 99999 })).toBe(false)
  })

})

describe('offerableRenderScales', () => {
  it('offers every scale whose output stays inside the ceiling', async () => {
    const { offerableRenderScales } = await import('~/shared/types/brandRender')
    expect(offerableRenderScales(1080, 1080)).toEqual([1, 2, 3, 4])
    expect(offerableRenderScales(2048, 1024)).toEqual([1, 2, 3, 4])
    expect(offerableRenderScales(2480, 3508)).toEqual([1, 2])
    expect(offerableRenderScales(4096, 4096)).toEqual([1, 2])
    expect(offerableRenderScales(8192, 100)).toEqual([1])
  })
})
