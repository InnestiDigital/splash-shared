import { describe, it, expect } from 'vitest'
import {
  BRAND_CANVAS_PREVIEW_PAGE_ID,
  buildCanvasPreviewConfig,
  canvasFontPreloadTokens,
  orphanedBlockCount,
  pickCanvasLayoutName,
  unregisteredBlockTypes,
} from '~/shared/features/brand-studio/canvasPreviewConfig'
import type { BrandCanvasBlockSnapshot, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import type { ClientConfig, PreviewPage } from '~/shared/types/previewMessages'

/**
 * The site's real shell, as the server resolver hands it over. Every assertion
 * below is about it reaching the renderer UNCHANGED: `app.vue`'s three
 * composables read these exact key names off the preview config, so a rename or
 * a drop here is a silent fidelity loss with no other symptom.
 */
function themeLayer(overrides: Partial<BrandCanvasThemeLayer> = {}): BrandCanvasThemeLayer {
  return {
    theme: 'standalone',
    themeSettings: { siteName: 'Studio' },
    themeVars: { '--color-accent': '#123456' },
    typography: { variants: [], defaults: {} },
    typographyPresets: [],
    typographyRoles: { body: 'body' },
    spacingTokens: { comfortable: { '--space-md': '16px' } },
    layout: { layouts: [{ id: 'blank', label: 'Blank' }] },
    motion: { defaultDuration: 600 },
    ...overrides,
  }
}

/** Throws rather than asserting non-null: a missing page IS the failure. */
function canvasPage(config: ClientConfig): PreviewPage {
  const page = config.pages[BRAND_CANVAS_PREVIEW_PAGE_ID]
  if (!page) throw new Error('the preview config carries no canvas page')
  return page
}

function block(overrides: Partial<BrandCanvasBlockSnapshot> = {}): BrandCanvasBlockSnapshot {
  return {
    id: 'blk-1',
    type: 'hero-block',
    position: 0,
    sectionId: 'sec-1',
    layoutRole: null,
    settings: { title: 'Hello' },
    options: null,
    placement: null,
    ...overrides,
  }
}

function snapshot(blocks: BrandCanvasBlockSnapshot[] = [block()]): BrandCanvasSnapshot {
  return {
    canvas: { width: 1080, height: 1080 },
    sections: [{
      id: 'sec-1',
      name: 'Poster',
      position: 0,
      sectionType: 'stacked',
      anchor: null,
      isHidden: false,
      colorScheme: 'light',
      sectionRole: null,
      containerMode: 'content',
      sectionSpaceY: 'md',
      containerInsetX: 'md',
      revealPreset: 'none',
      revealOverrides: null,
      defaultBlockEntrance: null,
      layoutConfig: null,
    }],
    blocks,
  }
}

describe('buildCanvasPreviewConfig', () => {
  it('registers the canvas as one page the renderer can look up', () => {
    const config = buildCanvasPreviewConfig(themeLayer(), snapshot())

    expect(Object.keys(config.pages)).toEqual([BRAND_CANVAS_PREVIEW_PAGE_ID])
    expect(config.theme).toBe('standalone')
    expect(canvasPage(config).layout).toBe('blank')
    expect(canvasPage(config).pageType).toBe('brand-canvas')
  })

  it('uses a page id with no slash, so page lookup does not walk into a child tree', () => {
    expect(BRAND_CANVAS_PREVIEW_PAGE_ID).not.toContain('/')
  })

  it('passes the flat snapshot through as blocks and sections', () => {
    const page = canvasPage(buildCanvasPreviewConfig(themeLayer(), snapshot()))

    expect(page.blocks).toHaveLength(1)
    expect(page.blocks[0]).toMatchObject({ type: 'hero-block', settings: { title: 'Hello' } })
    expect(page.sections?.[0]).toMatchObject({ id: 'sec-1', sectionType: 'stacked' })
  })

  it('keys blocks by their durable uuid so an override repaint does not remount them', () => {
    const page = canvasPage(buildCanvasPreviewConfig(themeLayer(), snapshot()))

    expect(page.blocks[0]).toMatchObject({ _previewId: 'blk-1' })
  })

  it('carries the site\'s whole theme layer through to the renderer', () => {
    const theme = themeLayer()
    const config = buildCanvasPreviewConfig(theme, snapshot())

    // Key-by-key rather than one toMatchObject: these are the exact names
    // useDesignTokens / useFontFaces / useTypographyPresets read.
    expect(config.themeSettings).toEqual(theme.themeSettings)
    expect(config.themeVars).toEqual(theme.themeVars)
    expect(config.typography).toEqual(theme.typography)
    expect(config.typographyPresets).toEqual(theme.typographyPresets)
    expect(config.typographyRoles).toEqual(theme.typographyRoles)
    expect(config.spacingTokens).toEqual(theme.spacingTokens)
    expect(config.layout).toEqual(theme.layout)
    expect(config.motion).toEqual(theme.motion)
  })

  it('never ships navigation, whatever the theme layer carried', () => {
    // The blank layout renders no chrome; a site header must not be able to
    // reach an exported asset through the config.
    const config = buildCanvasPreviewConfig(themeLayer(), snapshot())

    expect(config.navigation).toEqual({})
    expect(config.childSites).toEqual({})
  })

  it('declares no scenes: motion is pinned off on every snapshot section', () => {
    const page = canvasPage(buildCanvasPreviewConfig(themeLayer(), snapshot()))

    expect(page.scenes).toEqual([])
  })
})

describe('pickCanvasLayoutName', () => {
  it('picks the theme\'s blank layout', () => {
    expect(pickCanvasLayoutName(['standalone-default', 'standalone-blank'], 'standalone'))
      .toBe('standalone-blank')
  })

  it('refuses to fall back to a layout with chrome', () => {
    // A default layout would bake a site header into an exported brand asset.
    expect(pickCanvasLayoutName(['standalone-default'], 'standalone')).toBeNull()
    expect(pickCanvasLayoutName(['other-blank'], 'standalone')).toBeNull()
    expect(pickCanvasLayoutName([], '')).toBeNull()
  })
})

describe('unregisteredBlockTypes', () => {
  it('names the types this build has no component for, once and sorted', () => {
    const missing = unregisteredBlockTypes(
      snapshot([
        block({ id: 'a', type: 'hero-block' }),
        block({ id: 'b', type: 'zeta-block' }),
        block({ id: 'c', type: 'alpha-block' }),
        block({ id: 'd', type: 'zeta-block' }),
      ]),
      ['hero-block'],
    )

    expect(missing).toEqual(['alpha-block', 'zeta-block'])
  })

  it('is empty when every type resolves', () => {
    expect(unregisteredBlockTypes(snapshot(), ['hero-block'])).toEqual([])
  })
})

describe('orphanedBlockCount', () => {
  it('counts blocks with no sectionId once the snapshot has a section', () => {
    const count = orphanedBlockCount(snapshot([
      block({ id: 'a', sectionId: 'sec-1' }),
      block({ id: 'b', sectionId: null }),
      block({ id: 'c', sectionId: null }),
    ]))

    expect(count).toBe(2)
  })

  it('is zero when every block sits in a section', () => {
    expect(orphanedBlockCount(snapshot([block({ sectionId: 'sec-1' })]))).toBe(0)
  })

  it('is zero with zero sections, even with a null sectionId — the flat-render branch still paints it', () => {
    const flat = { ...snapshot([block({ sectionId: null })]), sections: [] }
    expect(orphanedBlockCount(flat)).toBe(0)
  })
})

describe('canvasFontPreloadTokens', () => {
  it('names every family the theme declares a @font-face for', () => {
    const tokens = canvasFontPreloadTokens(themeLayer({
      typography: {
        variants: [
          // Static: `family` wins over `name`, `weight` is taken literally.
          { name: 'dm-serif-display', family: 'DM Serif Display', file: 'DMSerif', weight: 700 },
          // Variable: no `weight`, so the wght axis DEFAULT is the instance the
          // browser will render — that is what must be force-loaded.
          { name: 'open-sans-vf', family: 'Open Sans', file: 'OpenSans-VF', variable: true, axes: { wght: { min: 300, max: 800, default: 500 } } },
        ],
        fontFaces: [{ name: 'Uploaded Grotesk', src: '/api/fonts/site-1/f1', weight: 300 }],
      },
    }))

    expect(tokens).toEqual([
      { fontFamily: 'DM Serif Display', fontWeight: '700' },
      { fontFamily: 'Open Sans', fontWeight: '500' },
      { fontFamily: 'Uploaded Grotesk', fontWeight: '300' },
    ])
  })

  it('falls back to the variant name and to weight 400', () => {
    const tokens = canvasFontPreloadTokens(themeLayer({
      typography: {
        variants: [{ name: 'Inter', file: 'Inter' }],
        fontFaces: [{ name: 'Uploaded', src: '/api/fonts/site-1/f1' }],
      },
    }))

    expect(tokens).toEqual([
      { fontFamily: 'Inter', fontWeight: '400' },
      { fontFamily: 'Uploaded', fontWeight: '400' },
    ])
  })

  it('deduplicates on weight AND family, so one face is not loaded twice', () => {
    const tokens = canvasFontPreloadTokens(themeLayer({
      typography: {
        variants: [
          { name: 'Inter', family: 'Inter', file: 'a', weight: 400 },
          { name: 'inter-alias', family: 'Inter', file: 'b', weight: 400 },
          { name: 'Inter', family: 'Inter', file: 'c', weight: 700 },
        ],
      },
    }))

    expect(tokens).toEqual([
      { fontFamily: 'Inter', fontWeight: '400' },
      { fontFamily: 'Inter', fontWeight: '700' },
    ])
  })

  it('is empty when the theme declares no faces, and skips unusable entries', () => {
    expect(canvasFontPreloadTokens(themeLayer({ typography: undefined }))).toEqual([])
    expect(canvasFontPreloadTokens(themeLayer({ typography: {} }))).toEqual([])
    expect(canvasFontPreloadTokens(themeLayer({
      typography: { variants: [{ file: 'orphan' }, null], fontFaces: [{ src: '/x' }] },
    }))).toEqual([])
  })
})

describe('buildCanvasPreviewConfig — richtext', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summer Drop 2026' }] }],
  }

  it('converts a locale map of TipTap docs to HTML strings — blocks bind richtext via v-html', () => {
    const config = buildCanvasPreviewConfig(
      themeLayer(),
      snapshot([block({ settings: { title: { 'en-US': doc } } })]),
    )
    const settings = canvasPage(config).blocks[0].settings as Record<string, any>
    expect(typeof settings.title['en-US']).toBe('string')
    expect(settings.title['en-US']).toContain('Summer Drop 2026')
    // The failure mode this guards: a bare doc falling through a locale-map
    // fallback and painting its own type tag.
    expect(settings.title['en-US']).not.toBe('doc')
  })

  it('converts a BARE TipTap doc too — an override form emits exactly this shape', () => {
    const config = buildCanvasPreviewConfig(
      themeLayer(),
      snapshot([block({ settings: { title: doc } })]),
    )
    const settings = canvasPage(config).blocks[0].settings as Record<string, any>
    expect(typeof settings.title).toBe('string')
    expect(settings.title).toContain('Summer Drop 2026')
  })

  it('leaves a plain string value alone apart from sanitization', () => {
    const config = buildCanvasPreviewConfig(
      themeLayer(),
      snapshot([block({ settings: { title: { 'en-US': '<p>Plain</p>' } } })]),
    )
    const settings = canvasPage(config).blocks[0].settings as Record<string, any>
    expect(settings.title['en-US']).toContain('Plain')
  })
})

describe('canvas layout choice', () => {
  it('mounts the snapshot layout when the theme ships it', () => {
    expect(pickCanvasLayoutName(['standalone-blank', 'standalone-default'], 'standalone', 'default'))
      .toBe('standalone-default')
  })

  it('absent/null layout means the chrome-free blank default', () => {
    expect(pickCanvasLayoutName(['standalone-blank'], 'standalone')).toBe('standalone-blank')
    expect(pickCanvasLayoutName(['standalone-blank'], 'standalone', null)).toBe('standalone-blank')
  })

  it('a manifest-only layout id (scale-canvas, editorial) is hosted by the blank FILE — LayoutShell resolves the id itself', () => {
    expect(pickCanvasLayoutName(['standalone-blank'], 'standalone', 'scale-canvas')).toBe('standalone-blank')
  })

  it('null only when even the blank host file is missing — never a chrome-bearing substitute', () => {
    expect(pickCanvasLayoutName(['standalone-default'], 'standalone', 'framed')).toBeNull()
  })

  it('the preview page carries the snapshot layout through to the renderer', () => {
    const withLayout = { ...snapshot(), layout: 'default' }
    expect(canvasPage(buildCanvasPreviewConfig(themeLayer(), withLayout)).layout).toBe('default')
    expect(canvasPage(buildCanvasPreviewConfig(themeLayer(), snapshot())).layout).toBe('blank')
  })
})

describe('canvas layout overrides', () => {
  it('puts the snapshot layoutOverrides exactly where useResolvedLayout reads them', () => {
    const withOverrides = { ...snapshot(), layout: 'default', layoutOverrides: { header: { sticky: false } } }
    expect(canvasPage(buildCanvasPreviewConfig(themeLayer(), withOverrides)).meta)
      .toEqual({ layoutOverrides: { header: { sticky: false } } })
    expect(canvasPage(buildCanvasPreviewConfig(themeLayer(), snapshot())).meta).toEqual({})
  })
})
