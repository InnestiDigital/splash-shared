import { describe, it, expect } from 'vitest'
import {
  effectiveCuration,
  isSettingCurated,
  nonCuratedOverrideKeys,
} from '~/shared/features/brand-studio/curation'
import type { BrandCanvasBlockSnapshot, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'

/**
 * Curation, as pure logic.
 *
 * The property under test is the INTERSECTION: curation is only ever reported
 * narrowed to what the snapshot beside it contains. That is the whole safety
 * argument for storing curation on the row instead of pinning it into the
 * approval, so a regression here is not cosmetic — it is a client being offered
 * a field the approved tree does not have.
 */

function block(id: string): BrandCanvasBlockSnapshot {
  return {
    id,
    type: 'hero',
    position: 0,
    sectionId: null,
    layoutRole: null,
    settings: {},
    options: null,
    placement: null,
  }
}

function snapshot(...ids: string[]): BrandCanvasSnapshot {
  return {
    canvas: { width: 1080, height: 1080 },
    sections: [],
    blocks: ids.map(block),
  }
}

describe('effectiveCuration', () => {
  it('is empty when there is no snapshot to intersect against', () => {
    expect(effectiveCuration(null, { 'b-1': ['title'] })).toEqual({})
  })

  it('is empty when nothing has been curated', () => {
    expect(effectiveCuration(snapshot('b-1'), null)).toEqual({})
  })

  it('keeps the setting ids of blocks the snapshot contains', () => {
    const result = effectiveCuration(snapshot('b-1', 'b-2'), { 'b-1': ['title', 'body'] })
    expect(result).toEqual({ 'b-1': ['title', 'body'] })
  })

  it('drops a block a re-approval deleted, rather than reporting it', () => {
    // The row keeps a key for a block that is gone; the read must not.
    const result = effectiveCuration(snapshot('b-2'), { 'b-1': ['title'], 'b-2': ['heading'] })
    expect(result).toEqual({ 'b-2': ['heading'] })
  })

  it('drops a curated block whose setting list is empty', () => {
    // "Curated with nothing editable" and "not curated" are the same statement,
    // so only one of them is ever reported.
    expect(effectiveCuration(snapshot('b-1'), { 'b-1': [] })).toEqual({})
  })

  it('ignores an inherited key rather than treating it as an authored one', () => {
    const hostile = Object.create({ 'b-1': ['title'] }) as Record<string, string[]>
    expect(effectiveCuration(snapshot('b-1'), hostile)).toEqual({})
  })

  it('copies the setting ids, so a caller cannot mutate the stored row through the result', () => {
    const curation = { 'b-1': ['title'] }
    const result = effectiveCuration(snapshot('b-1'), curation)
    result['b-1']?.push('body')
    expect(curation['b-1']).toEqual(['title'])
  })
})

describe('isSettingCurated', () => {
  it('is true for a listed setting on a listed block', () => {
    expect(isSettingCurated({ 'b-1': ['title'] }, 'b-1', 'title')).toBe(true)
  })

  it('is false for an unlisted setting on a listed block', () => {
    expect(isSettingCurated({ 'b-1': ['title'] }, 'b-1', 'body')).toBe(false)
  })

  it('is false for an unlisted block', () => {
    expect(isSettingCurated({ 'b-1': ['title'] }, 'b-2', 'title')).toBe(false)
  })

  it('is false for an inherited key', () => {
    const hostile = Object.create({ 'b-1': ['title'] }) as Record<string, string[]>
    expect(isSettingCurated(hostile, 'b-1', 'title')).toBe(false)
  })
})

describe('nonCuratedOverrideKeys', () => {
  it('is clean when there are no overrides at all', () => {
    expect(nonCuratedOverrideKeys(snapshot('b-1'), { 'b-1': ['title'] }, undefined)).toEqual([])
    expect(nonCuratedOverrideKeys(snapshot('b-1'), { 'b-1': ['title'] }, null)).toEqual([])
  })

  it('is clean when every override names a curated setting', () => {
    const blocked = nonCuratedOverrideKeys(
      snapshot('b-1'),
      { 'b-1': ['title', 'body'] },
      { 'b-1': { title: 'New', body: 'Copy' } },
    )
    expect(blocked).toEqual([])
  })

  it('blocks one non-curated setting and names it', () => {
    const blocked = nonCuratedOverrideKeys(
      snapshot('b-1'),
      { 'b-1': ['title'] },
      { 'b-1': { title: 'New', body: 'Copy' } },
    )
    expect(blocked).toEqual(['b-1.body'])
  })

  it('blocks an override naming a block the snapshot does not contain', () => {
    // Deliberately UNLIKE `applyCanvasOverrides`, which ignores unknown ids: for
    // a customer, "not in the snapshot" and "not curated" are the same refusal,
    // and answering differently would make the endpoint a probe for block ids.
    const blocked = nonCuratedOverrideKeys(
      snapshot('b-1'),
      { 'b-1': ['title'] },
      { 'b-ghost': { title: 'New' } },
    )
    expect(blocked).toEqual(['b-ghost.title'])
  })

  it('blocks everything when nothing has been curated', () => {
    const blocked = nonCuratedOverrideKeys(snapshot('b-1'), null, { 'b-1': { title: 'New' } })
    expect(blocked).toEqual(['b-1.title'])
  })

  it('blocks a setting curated on a block the snapshot lost', () => {
    const blocked = nonCuratedOverrideKeys(
      snapshot('b-2'),
      { 'b-1': ['title'] },
      { 'b-1': { title: 'New' } },
    )
    expect(blocked).toEqual(['b-1.title'])
  })
})

describe('curatableSettings', () => {
  it('never offers a freeform color setting to customers — the Color Override Freeze', async () => {
    const { curatableSettings } = await import('~/shared/features/brand-studio/curation')
    const settings = [
      { id: 'title', type: 'richtext' },
      { id: 'backgroundColor', type: 'color' },
      { id: 'variant', type: 'select' },
      { id: 'textColor', type: 'color' },
    ]
    expect(curatableSettings(settings).map(field => field.id)).toEqual(['title', 'variant'])
  })
})
