import { describe, it, expect } from 'vitest'
import {
  CANVAS_FALLBACK_LAYOUT_ID,
  CANVAS_SECTION_FALLBACK,
  canvasPresetOptions,
  canvasSectionDefaults,
  isCanvasInsetMismatch,
  isCanvasPresetOption,
  isLayoutCanvasPreset,
  readCanvasPreset,
  resolveCanvasLayoutId,
} from '~/shared/features/layout/canvasPresets'
import type { CanvasInitialSection, LayoutCanvasPreset, ThemeLayout } from '~/shared/types/layout'

/**
 * The `canvasPreset` marker is three things at once — the creation radio list,
 * the create-time allow-list, and the canvas layout picker's filter. What is
 * pinned here is that all three read the SAME answer, and that a theme which
 * declares nothing behaves exactly as it did before presets existed.
 */

const EDGE: CanvasInitialSection = {
  containerMode: 'full-bleed', containerInsetX: 'none', sectionSpaceY: 'none',
}

function preset(overrides: Partial<LayoutCanvasPreset> = {}): LayoutCanvasPreset {
  return { hint: { 'en-US': 'A sheet' }, initialSection: EDGE, ...overrides }
}

function layout(id: string, canvasPreset?: LayoutCanvasPreset): ThemeLayout {
  return { id, label: { 'en-US': id }, allowedBlocks: [], ...(canvasPreset ? { canvasPreset } : {}) }
}

describe('isLayoutCanvasPreset', () => {
  it('accepts a complete marker', () => {
    expect(isLayoutCanvasPreset(preset({ label: { 'en-US': 'Plain' }, order: 1, default: true }))).toBe(true)
  })

  it('rejects a marker with no hint — the option would render an unexplained radio', () => {
    expect(isLayoutCanvasPreset({ initialSection: EDGE })).toBe(false)
    expect(isLayoutCanvasPreset({ hint: {}, initialSection: EDGE })).toBe(false)
    expect(isLayoutCanvasPreset({ hint: 'plain text', initialSection: EDGE })).toBe(false)
  })

  it('rejects a HALF-declared initialSection rather than seeding from undefined', () => {
    // A partial section would fall back to the repository's own `measure` /
    // `md` defaults — the exact margin the preset exists to remove.
    expect(isLayoutCanvasPreset({ hint: { 'en-US': 'x' }, initialSection: { containerMode: 'full-bleed' } })).toBe(false)
    expect(isLayoutCanvasPreset({ hint: { 'en-US': 'x' } })).toBe(false)
  })

  it('rejects illegal enum values in initialSection', () => {
    expect(isLayoutCanvasPreset({
      hint: { 'en-US': 'x' },
      initialSection: { ...EDGE, containerMode: 'edge-to-edge' },
    })).toBe(false)
    expect(isLayoutCanvasPreset({
      hint: { 'en-US': 'x' },
      initialSection: { ...EDGE, sectionSpaceY: 'huge' },
    })).toBe(false)
  })

  it('rejects wrongly-typed order / default / label', () => {
    expect(isLayoutCanvasPreset(preset({ order: '1' as unknown as number }))).toBe(false)
    expect(isLayoutCanvasPreset(preset({ default: 'yes' as unknown as boolean }))).toBe(false)
    expect(isLayoutCanvasPreset(preset({ label: 'Plain' as unknown as Record<string, string> }))).toBe(false)
  })
})

describe('readCanvasPreset', () => {
  it('reads the marker off a manifest layout entry', () => {
    expect(readCanvasPreset(layout('blank', preset()))).toEqual(preset())
  })

  it('answers null for a layout with no marker, an id-less entry, or a non-object', () => {
    expect(readCanvasPreset(layout('default'))).toBeNull()
    expect(readCanvasPreset({ canvasPreset: preset() })).toBeNull()
    expect(readCanvasPreset(null)).toBeNull()
    expect(readCanvasPreset('blank')).toBeNull()
  })
})

describe('canvasPresetOptions', () => {
  const layouts = [
    layout('default'),
    layout('poster', preset({ label: { 'en-US': 'Poster sheet' }, order: 3 })),
    layout('blank', preset({ label: { 'en-US': 'Plain sheet' }, order: 1, default: true })),
    layout('branded', preset({ order: 2 })),
  ]

  it('offers only marked layouts, ordered by `order`', () => {
    expect(canvasPresetOptions(layouts).map(o => o.layoutId)).toEqual(['blank', 'branded', 'poster'])
  })

  it('falls back to the layout label when the preset declares none', () => {
    const branded = canvasPresetOptions(layouts).find(o => o.layoutId === 'branded')
    expect(branded?.label).toEqual({ 'en-US': 'branded' })
    expect(canvasPresetOptions(layouts)[0]?.label).toEqual({ 'en-US': 'Plain sheet' })
  })

  it('marks as default whatever the SERVER would resolve for a request naming no layout', () => {
    const marked = canvasPresetOptions(layouts).filter(o => o.isDefault).map(o => o.layoutId)
    expect(marked).toEqual([resolveCanvasLayoutId(layouts, undefined)])
    expect(marked).toEqual(['blank'])
  })

  it('sorts an absent `order` last and breaks ties on layout id', () => {
    const ties = [
      layout('zulu', preset({ order: 1 })),
      layout('unordered', preset()),
      layout('alpha', preset({ order: 1 })),
    ]
    expect(canvasPresetOptions(ties).map(o => o.layoutId)).toEqual(['alpha', 'zulu', 'unordered'])
  })

  it('returns an empty list for a theme that declares no presets — every surface then behaves as before', () => {
    expect(canvasPresetOptions([layout('default'), layout('editorial')])).toEqual([])
    expect(canvasPresetOptions([])).toEqual([])
  })

  it('ignores a malformed marker instead of offering an option that cannot be seeded', () => {
    const broken = [{ id: 'oops', label: { 'en-US': 'Oops' }, allowedBlocks: [], canvasPreset: { hint: {} } }]
    expect(canvasPresetOptions(broken as unknown as ThemeLayout[])).toEqual([])
  })
})

describe('resolveCanvasLayoutId', () => {
  const layouts = [
    layout('default'),
    layout('branded', preset({ order: 2 })),
    layout('blank', preset({ order: 1 })),
  ]

  it('passes a requested id through when it is a declared preset', () => {
    expect(resolveCanvasLayoutId(layouts, 'branded')).toBe('branded')
  })

  it('answers null for a requested id that is not a preset — the caller 400s, it never falls back', () => {
    // 'default' is a real layout, and a chrome-bearing one; being real is not
    // enough. Silently giving someone a chrome-free canvas when they asked for
    // a branded one is the failure class this whole design removes.
    expect(resolveCanvasLayoutId(layouts, 'default')).toBeNull()
    expect(resolveCanvasLayoutId(layouts, 'nonsense')).toBeNull()
    expect(resolveCanvasLayoutId(layouts, '')).toBeNull()
  })

  it('picks the FIRST declared default when nothing was requested', () => {
    const marked = [
      layout('branded', preset({ order: 2, default: true })),
      layout('blank', preset({ order: 1, default: true })),
    ]
    expect(resolveCanvasLayoutId(marked, undefined)).toBe('branded')
  })

  it('picks the lowest `order` when nothing was requested and no preset is marked default', () => {
    expect(resolveCanvasLayoutId(layouts, undefined)).toBe('blank')
  })

  it('falls back to blank when the theme declares no presets at all', () => {
    expect(resolveCanvasLayoutId([layout('default')], undefined)).toBe(CANVAS_FALLBACK_LAYOUT_ID)
    expect(resolveCanvasLayoutId([], undefined)).toBe('blank')
  })
})

describe('isCanvasPresetOption', () => {
  const valid = { layoutId: 'branded', label: { 'en-US': 'Branded sheet' }, hint: { 'en-US': 'A frame' }, isDefault: true }

  it('accepts a well-formed wire option', () => {
    expect(isCanvasPresetOption(valid)).toBe(true)
  })

  it('rejects a missing or empty layoutId', () => {
    expect(isCanvasPresetOption({ ...valid, layoutId: undefined })).toBe(false)
    expect(isCanvasPresetOption({ ...valid, layoutId: '' })).toBe(false)
  })

  it('rejects a missing label or hint', () => {
    expect(isCanvasPresetOption({ ...valid, label: undefined })).toBe(false)
    expect(isCanvasPresetOption({ ...valid, hint: undefined })).toBe(false)
    expect(isCanvasPresetOption({ ...valid, hint: 'plain string' })).toBe(false)
  })

  it('rejects a non-boolean isDefault', () => {
    expect(isCanvasPresetOption({ ...valid, isDefault: undefined })).toBe(false)
    expect(isCanvasPresetOption({ ...valid, isDefault: 'true' })).toBe(false)
  })

  it('rejects a non-object value', () => {
    expect(isCanvasPresetOption(null)).toBe(false)
    expect(isCanvasPresetOption('branded')).toBe(false)
  })
})

describe('canvasSectionDefaults', () => {
  const branded = preset({
    initialSection: { containerMode: 'content', containerInsetX: 'sm', sectionSpaceY: 'lg' },
  })
  const layouts = [layout('default'), layout('branded', branded)]

  it('answers the layout preset initialSection', () => {
    expect(canvasSectionDefaults(layouts, 'branded'))
      .toEqual({ containerMode: 'content', containerInsetX: 'sm', sectionSpaceY: 'lg' })
  })

  it('falls back to edge-to-edge for an unmarked layout, an unknown id, or no layout at all', () => {
    expect(canvasSectionDefaults(layouts, 'default')).toEqual(CANVAS_SECTION_FALLBACK)
    expect(canvasSectionDefaults(layouts, 'gone')).toEqual(CANVAS_SECTION_FALLBACK)
    expect(canvasSectionDefaults(layouts, null)).toEqual(CANVAS_SECTION_FALLBACK)
    expect(canvasSectionDefaults([], 'blank')).toEqual(CANVAS_SECTION_FALLBACK)
  })

  it('the fallback is edge-to-edge with no vertical rhythm', () => {
    expect(CANVAS_SECTION_FALLBACK).toEqual({
      containerMode: 'full-bleed', containerInsetX: 'none', sectionSpaceY: 'none',
    })
  })

  it('never hands back the manifest object itself — a caller spread must not mutate theme data', () => {
    const answer = canvasSectionDefaults(layouts, 'branded')
    answer.containerMode = 'full-bleed'
    expect(branded.initialSection.containerMode).toBe('content')
  })
})

describe('isCanvasInsetMismatch', () => {
  it('flags Full Width paired with any inset other than None', () => {
    expect(isCanvasInsetMismatch('full-bleed', 'sm')).toBe(true)
    expect(isCanvasInsetMismatch('full-bleed', 'md')).toBe(true)
    expect(isCanvasInsetMismatch('full-bleed', 'lg')).toBe(true)
    expect(isCanvasInsetMismatch('full-bleed', 'xl')).toBe(true)
  })

  it('is clean when Full Width has no inset', () => {
    expect(isCanvasInsetMismatch('full-bleed', 'none')).toBe(false)
  })

  it('never fires for a non-full-bleed container, regardless of inset', () => {
    expect(isCanvasInsetMismatch('measure', 'md')).toBe(false)
    expect(isCanvasInsetMismatch('content', 'sm')).toBe(false)
    expect(isCanvasInsetMismatch('wide', 'none')).toBe(false)
  })
})
