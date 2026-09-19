import { describe, it, expect } from 'vitest'
import {
  BRAND_CANVAS_MAX_SIZE,
  BRAND_CANVAS_MIN_SIZE,
  BRAND_CANVAS_OVERRIDE_MAX_BLOCKS,
  BRAND_CANVAS_OVERRIDE_MAX_CHARS,
  BRAND_CANVAS_REVEAL_PRESET,
  applyCanvasOverrides,
  isBrandCanvasOverrides,
  isBrandCanvasPageMeta,
  isBrandCanvasSnapshot,
} from '~/shared/types/brandCanvas'
import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'

/**
 * The snapshot guard is the only parse of a `brand_format_templates.snapshot`
 * column and of the payload the canvas render route receives, and the overrides
 * guard is the only parse of the generate body. Nothing downstream re-checks
 * either, so the bounds are tested as pairs (last rejected value beside first
 * accepted one).
 */

function block(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'block-1',
    type: 'hero',
    position: 0,
    sectionId: 'section-1',
    layoutRole: 'section-heading',
    settings: { headline: 'Approved' },
    options: null,
    placement: null,
    ...overrides,
  }
}

function section(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'section-1',
    name: 'Stage',
    position: 0,
    sectionType: 'stacked',
    anchor: null,
    isHidden: false,
    colorScheme: 'light',
    sectionRole: null,
    containerMode: 'measure',
    sectionSpaceY: 'md',
    containerInsetX: 'md',
    revealPreset: BRAND_CANVAS_REVEAL_PRESET,
    revealOverrides: null,
    defaultBlockEntrance: null,
    layoutConfig: null,
    ...overrides,
  }
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas: { width: 1200, height: 630 },
    sections: [section()],
    blocks: [block()],
    ...overrides,
  }
}

describe('isBrandCanvasSnapshot', () => {
  it('accepts a minimal snapshot and a fully-populated one', () => {
    expect(isBrandCanvasSnapshot({ canvas: { width: 1080, height: 1080 }, sections: [], blocks: [] })).toBe(true)
    expect(isBrandCanvasSnapshot(snapshot({
      sections: [section({
        anchor: 'stage',
        isHidden: true,
        colorScheme: 'custom',
        sectionRole: 'hero',
        containerMode: 'full-bleed',
        sectionSpaceY: 'xl',
        containerInsetX: 'none',
        layoutConfig: { stackGap: 'tight' },
      })],
      blocks: [block({
        options: { legacy: true },
        placement: {
          marginTop: { mode: 'custom', value: 24, unit: 'px' },
          marginBottom: { mode: 'token', value: 'lg' },
          alignSelf: 'center',
          widthMode: 'content',
          maxWidth: { mode: 'token', value: 'md' },
          wrapperStyle: 'card',
          wrapperOverrides: {
            borderRadius: { custom: 12, unit: 'px' },
            shadow: 'md',
            backgroundColor: 'surface',
            borderColor: { custom: '#123456' },
          },
          hiddenViewports: ['mobile'],
          visibleTo: 'guest',
          canvas: {
            x: 50, y: 50, width: 80, height: 40,
            rotation: -4, zIndex: 3, locked: true,
          },
        },
      })],
    }))).toBe(true)
  })

  it('rejects non-records and missing collections', () => {
    expect(isBrandCanvasSnapshot(null)).toBe(false)
    expect(isBrandCanvasSnapshot([snapshot()])).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: undefined }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: {} }))).toBe(false)
  })

  it('clamps the canvas the same way the template row does', () => {
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: BRAND_CANVAS_MIN_SIZE - 1, height: 630 } }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: BRAND_CANVAS_MIN_SIZE, height: 630 } }))).toBe(true)
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: 1200, height: BRAND_CANVAS_MAX_SIZE } }))).toBe(true)
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: 1200, height: BRAND_CANVAS_MAX_SIZE + 1 } }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: 1200.5, height: 630 } }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ canvas: { width: '1200', height: 630 } }))).toBe(false)
  })

  it('rejects a section whose type is not one the renderer can lay out', () => {
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ sectionType: 'scatter' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ sectionType: undefined })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ id: '' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ position: 1.5 })] }))).toBe(false)
  })

  it('requires every section field SectionRenderer reads, in a vocabulary it has styles for', () => {
    for (const missing of ['isHidden', 'colorScheme', 'containerMode', 'sectionSpaceY', 'containerInsetX', 'anchor']) {
      expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ [missing]: undefined })] }))).toBe(false)
    }
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ colorScheme: 'brand' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ containerMode: 'bleed' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ sectionSpaceY: 'huge' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ containerInsetX: 2 })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ sectionRole: 'sidebar' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ isHidden: 'true' })] }))).toBe(false)
  })

  it('rejects live motion state — a one-shot capture would export the pre-reveal frame', () => {
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ revealPreset: 'fade-up' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ revealPreset: null })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ revealOverrides: { startOpacity: 0 } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ sections: [section({ defaultBlockEntrance: 'fade-in' })] }))).toBe(false)
  })

  it('requires every block field that the override key or the renderer depends on', () => {
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ id: '' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ type: '' })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ settings: null })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ settings: undefined })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ options: undefined })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: undefined })] }))).toBe(false)
  })

  it('rejects a placement value the wrapper would resolve into CSS it does not own', () => {
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { marginTop: { mode: 'token', value: 'huge' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { marginTop: { mode: 'custom', value: 24, unit: 'vh' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { marginBottom: { mode: 'custom', value: '24', unit: 'px' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { alignSelf: 'middle' } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { widthMode: 'wide' } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { maxWidth: { mode: 'token', value: 'xxl' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { wrapperStyle: 'floating' } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { wrapperOverrides: { shadow: 'xl' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { wrapperOverrides: { borderRadius: 'round' } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { wrapperOverrides: { backgroundColor: { custom: 12 } } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { hiddenViewports: ['watch'] } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { visibleTo: 'admins' } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { canvas: { x: 126 } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { canvas: { width: 4 } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { canvas: { rotation: Number.NaN } } })] }))).toBe(false)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { canvas: { locked: 'yes' } } })] }))).toBe(false)
  })

  it('accepts a partial placement — every field of it is optional', () => {
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: {} })] }))).toBe(true)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { wrapperStyle: 'inset' } })] }))).toBe(true)
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ placement: { hiddenViewports: [] } })] }))).toBe(true)
  })

  it('accepts the nullable block relationships — a block need not be in a section or a slot', () => {
    expect(isBrandCanvasSnapshot(snapshot({ blocks: [block({ sectionId: null, layoutRole: null })] }))).toBe(true)
  })
})

describe('isBrandCanvasOverrides', () => {
  it('accepts an empty map and a block-keyed map of arbitrary setting values', () => {
    expect(isBrandCanvasOverrides({})).toBe(true)
    expect(isBrandCanvasOverrides({
      'block-1': { headline: 'Generated', items: [{ label: 'a' }], count: 3, hidden: false },
    })).toBe(true)
  })

  it('rejects the old flat slot shape — settings must nest under a block id', () => {
    expect(isBrandCanvasOverrides({ headline: 'Generated' })).toBe(false)
    expect(isBrandCanvasOverrides({ 'block-1': null })).toBe(false)
    expect(isBrandCanvasOverrides({ 'block-1': ['x'] })).toBe(false)
  })

  it('rejects non-records', () => {
    expect(isBrandCanvasOverrides(null)).toBe(false)
    expect(isBrandCanvasOverrides(undefined)).toBe(false)
    expect(isBrandCanvasOverrides('block-1')).toBe(false)
    expect(isBrandCanvasOverrides([{ 'block-1': {} }])).toBe(false)
  })

  it('bounds the block count at the declared cap', () => {
    const atCap = Object.fromEntries(
      Array.from({ length: BRAND_CANVAS_OVERRIDE_MAX_BLOCKS }, (_, i) => [`block-${i}`, { headline: 'x' }]),
    )
    expect(isBrandCanvasOverrides(atCap)).toBe(true)
    expect(isBrandCanvasOverrides({ ...atCap, extra: { headline: 'x' } })).toBe(false)
  })

  it('bounds the SERIALIZED size, not a per-value length', () => {
    const underCap = { 'block-1': { body: 'x'.repeat(BRAND_CANVAS_OVERRIDE_MAX_CHARS - 100) } }
    expect(isBrandCanvasOverrides(underCap)).toBe(true)
    expect(JSON.stringify(underCap).length).toBeLessThanOrEqual(BRAND_CANVAS_OVERRIDE_MAX_CHARS)

    const overCap = { 'block-1': { body: 'x'.repeat(BRAND_CANVAS_OVERRIDE_MAX_CHARS) } }
    expect(isBrandCanvasOverrides(overCap)).toBe(false)
  })

  it('rejects a value that cannot be serialized at all', () => {
    const cyclic: Record<string, unknown> = { headline: 'x' }
    cyclic.self = cyclic
    expect(isBrandCanvasOverrides({ 'block-1': cyclic })).toBe(false)
    expect(isBrandCanvasOverrides({ 'block-1': { big: 1n } })).toBe(false)
  })
})

describe('applyCanvasOverrides', () => {
  const APPROVED: BrandCanvasSnapshot = {
    canvas: { width: 1200, height: 630 },
    layout: null,
    layoutOverrides: null,
    sections: [{
      id: 'section-1',
      name: 'Stage',
      position: 0,
      sectionType: 'stacked',
      anchor: null,
      isHidden: false,
      colorScheme: 'light',
      sectionRole: null,
      containerMode: 'measure',
      sectionSpaceY: 'md',
      containerInsetX: 'md',
      revealPreset: BRAND_CANVAS_REVEAL_PRESET,
      revealOverrides: null,
      defaultBlockEntrance: null,
      layoutConfig: null,
    }],
    blocks: [
      {
        id: 'block-1',
        type: 'hero',
        position: 0,
        sectionId: 'section-1',
        layoutRole: null,
        settings: { headline: 'Approved', eyebrow: 'Keep me' },
        options: null,
        placement: null,
      },
      {
        id: 'block-2',
        type: 'text',
        position: 1,
        sectionId: 'section-1',
        layoutRole: null,
        settings: { body: 'Approved body' },
        options: null,
        placement: { marginTop: { mode: 'token', value: 'lg' } },
      },
    ],
  }

  it('merges per-block settings shallowly, leaving unnamed settings and blocks alone', () => {
    const result = applyCanvasOverrides(APPROVED, { 'block-1': { headline: 'Generated' } })

    expect(result.blocks[0].settings).toEqual({ headline: 'Generated', eyebrow: 'Keep me' })
    expect(result.blocks[1].settings).toEqual({ body: 'Approved body' })
  })

  it('replaces a setting whole rather than deep-merging its contents', () => {
    const nested: BrandCanvasSnapshot = {
      ...APPROVED,
      blocks: [{ ...APPROVED.blocks[0], settings: { items: [{ label: 'a' }, { label: 'b' }] } }],
    }
    const result = applyCanvasOverrides(nested, { 'block-1': { items: [{ label: 'z' }] } })

    expect(result.blocks[0].settings.items).toEqual([{ label: 'z' }])
  })

  it('ignores override keys naming blocks the snapshot does not contain', () => {
    const result = applyCanvasOverrides(APPROVED, { 'block-gone': { headline: 'Generated' } })

    expect(result.blocks.map(b => b.settings)).toEqual([
      { headline: 'Approved', eyebrow: 'Keep me' },
      { body: 'Approved body' },
    ])
  })

  it('never mutates the input snapshot, so the same approval renders twice identically', () => {
    const first = applyCanvasOverrides(APPROVED, { 'block-1': { headline: 'First' } })
    const second = applyCanvasOverrides(APPROVED, { 'block-1': { headline: 'Second' } })

    expect(APPROVED.blocks[0].settings).toEqual({ headline: 'Approved', eyebrow: 'Keep me' })
    expect(first.blocks[0].settings.headline).toBe('First')
    expect(second.blocks[0].settings.headline).toBe('Second')
    expect(first.blocks[0]).not.toBe(APPROVED.blocks[0])
  })

  it('returns an equal but detached snapshot when there is nothing to apply', () => {
    for (const nothing of [null, undefined, {}]) {
      const result = applyCanvasOverrides(APPROVED, nothing)
      expect(result).toEqual(APPROVED)
      expect(result).not.toBe(APPROVED)
      expect(result.blocks).not.toBe(APPROVED.blocks)
    }
  })

  it('detaches every block, section and settings map even on the nothing-to-apply paths', () => {
    // A cached snapshot is rendered many times; a consumer annotating a returned
    // block must not write through to the cache for the NEXT generation.
    for (const nothing of [null, undefined, {}]) {
      const result = applyCanvasOverrides(APPROVED, nothing)

      result.blocks.forEach((block, i) => {
        expect(block).not.toBe(APPROVED.blocks[i])
        expect(block.settings).not.toBe(APPROVED.blocks[i].settings)
      })
      result.sections.forEach((section, i) => {
        expect(section).not.toBe(APPROVED.sections[i])
      })

      result.blocks[0].settings.headline = 'Mutated'
      expect(APPROVED.blocks[0].settings.headline).toBe('Approved')
    }
  })

  it('detaches the settings of blocks no override names', () => {
    const result = applyCanvasOverrides(APPROVED, { 'block-1': { headline: 'Generated' } })

    expect(result.blocks[1].settings).not.toBe(APPROVED.blocks[1].settings)
  })

  it('does not treat an inherited key as an override', () => {
    const inherited = Object.create({ 'block-1': { headline: 'Injected' } }) as Record<string, Record<string, unknown>>

    expect(applyCanvasOverrides(APPROVED, inherited).blocks[0].settings.headline).toBe('Approved')
  })
})

describe('isBrandCanvasPageMeta', () => {
  it('accepts a complete backlink', () => {
    expect(isBrandCanvasPageMeta({ templateId: 'tpl-1', width: 1200, height: 630 })).toBe(true)
  })

  it('rejects a partial or out-of-range backlink', () => {
    expect(isBrandCanvasPageMeta({ templateId: '', width: 1200, height: 630 })).toBe(false)
    expect(isBrandCanvasPageMeta({ templateId: 'tpl-1', width: 1200 })).toBe(false)
    expect(isBrandCanvasPageMeta({ templateId: 'tpl-1', width: 1200, height: BRAND_CANVAS_MAX_SIZE + 1 })).toBe(false)
    expect(isBrandCanvasPageMeta(null)).toBe(false)
  })
})

describe('snapshot layout field', () => {
  const base = () => ({
    canvas: { width: 100, height: 100 },
    sections: [],
    blocks: [],
  })

  it('accepts absent (pre-layout snapshots), null and a real layout id', async () => {
    const { isBrandCanvasSnapshot } = await import('~/shared/types/brandCanvas')
    expect(isBrandCanvasSnapshot(base())).toBe(true)
    expect(isBrandCanvasSnapshot({ ...base(), layout: null })).toBe(true)
    expect(isBrandCanvasSnapshot({ ...base(), layout: 'default' })).toBe(true)
  })

  it('rejects an empty string and a non-string', async () => {
    const { isBrandCanvasSnapshot } = await import('~/shared/types/brandCanvas')
    expect(isBrandCanvasSnapshot({ ...base(), layout: '' })).toBe(false)
    expect(isBrandCanvasSnapshot({ ...base(), layout: 7 })).toBe(false)
  })
})

describe('applyCanvasOverrides — layout passthrough', () => {
  it('carries the layout choice through an override repaint verbatim', async () => {
    const { applyCanvasOverrides } = await import('~/shared/types/brandCanvas')
    const snapshot = {
      canvas: { width: 100, height: 100 },
      layout: 'default',
      sections: [],
      blocks: [],
    }
    expect(applyCanvasOverrides(snapshot, null).layout).toBe('default')
    expect(applyCanvasOverrides(snapshot, {}).layout).toBe('default')
    // A pre-layout snapshot normalizes to the explicit null (= blank).
    const { layout: _drop, ...legacy } = snapshot
    expect(applyCanvasOverrides(legacy, null).layout).toBeNull()
  })
})
