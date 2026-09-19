import { describe, it, expect } from 'vitest'
import {
  createEmptyUsageIndex,
  indexBlockSettings,
  indexTipTapDocument,
  buildUsageIndex,
  getKeyUsage,
} from '~/shared/typography/usageIndex'
import type { TipTapDocument } from '~/shared/tiptap/types'

describe('createEmptyUsageIndex', () => {
  it('returns an empty index with all three maps', () => {
    const idx = createEmptyUsageIndex()
    expect(idx.blockSlot).toEqual({})
    expect(idx.richTextParagraph).toEqual({})
    expect(idx.richTextInline).toEqual({})
  })
})

describe('indexBlockSettings — block slot references', () => {
  it('counts a simple {slot}PresetKey field', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({ headingPresetKey: 'display-xl' }, idx)
    expect(idx.blockSlot).toEqual({ 'display-xl': 1 })
  })

  it('counts multiple distinct slot keys on one block', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      headingPresetKey: 'display-xl',
      bodyPresetKey: 'body-large',
      eyebrowPresetKey: 'eyebrow-caps',
    }, idx)
    expect(idx.blockSlot).toEqual({
      'display-xl': 1,
      'body-large': 1,
      'eyebrow-caps': 1,
    })
  })

  it('increments when the same key is used on multiple slots', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({ headingPresetKey: 'x', subheadingPresetKey: 'x' }, idx)
    expect(idx.blockSlot).toEqual({ x: 2 })
  })

  it('ignores PresetKey fields with non-string or empty values', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      headingPresetKey: null,
      bodyPresetKey: '',
      captionPresetKey: undefined,
    }, idx)
    expect(idx.blockSlot).toEqual({})
  })

  it('ignores unrelated fields', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      title: 'Hello',
      presetKey: 'not-a-slot',
      fontSize: '16px',
    }, idx)
    expect(idx.blockSlot).toEqual({})
  })

  it('handles null/undefined settings gracefully', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings(null, idx)
    indexBlockSettings(undefined, idx)
    expect(idx.blockSlot).toEqual({})
  })
})

describe('indexBlockSettings — repeater and nested blocks', () => {
  it('counts slot keys inside repeater items', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      items: [
        { title: 'A', titlePresetKey: 'heading-a' },
        { title: 'B', titlePresetKey: 'heading-b' },
        { title: 'C', titlePresetKey: 'heading-a' },
      ],
    }, idx)
    expect(idx.blockSlot).toEqual({ 'heading-a': 2, 'heading-b': 1 })
  })

  it('counts slot keys inside nested blocks arrays ({type, settings} shape)', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      tiles: [
        { type: 'tile', settings: { headingPresetKey: 'display' } },
        { type: 'tile', settings: { headingPresetKey: 'display' } },
      ],
    }, idx)
    expect(idx.blockSlot).toEqual({ display: 2 })
  })
})

describe('indexBlockSettings — richtext references', () => {
  const docWithParagraphPreset: TipTapDocument = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { presetKey: 'body-lead' }, content: [{ type: 'text', text: 'Hi' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'No preset' }] },
    ],
  }

  const docWithInlinePreset: TipTapDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Normal ' },
          {
            type: 'text',
            text: 'fancy',
            marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'highlight' } }],
          },
        ],
      },
    ],
  }

  it('counts paragraph preset references', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({ body: docWithParagraphPreset }, idx)
    expect(idx.richTextParagraph).toEqual({ 'body-lead': 1 })
  })

  it('counts inline typography preset mark references', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({ body: docWithInlinePreset }, idx)
    expect(idx.richTextInline).toEqual({ highlight: 1 })
  })

  it('counts both paragraph and inline references in one doc', () => {
    const combined: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { presetKey: 'body-lead' },
          content: [
            { type: 'text', text: 'a ' },
            {
              type: 'text',
              text: 'b',
              marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'highlight' } }],
            },
          ],
        },
      ],
    }
    const idx = createEmptyUsageIndex()
    indexBlockSettings({ body: combined }, idx)
    expect(idx.richTextParagraph).toEqual({ 'body-lead': 1 })
    expect(idx.richTextInline).toEqual({ highlight: 1 })
  })

  it('walks TipTap docs inside translatable locale maps', () => {
    const idx = createEmptyUsageIndex()
    indexBlockSettings({
      body: {
        'en-US': docWithParagraphPreset,
        'fr-CA': docWithInlinePreset,
      },
    }, idx)
    expect(idx.richTextParagraph).toEqual({ 'body-lead': 1 })
    expect(idx.richTextInline).toEqual({ highlight: 1 })
  })
})

describe('buildUsageIndex', () => {
  it('aggregates counts across multiple blocks', () => {
    const idx = buildUsageIndex([
      { settings: { headingPresetKey: 'display' } },
      { settings: { headingPresetKey: 'display', bodyPresetKey: 'body' } },
      { settings: { headingPresetKey: 'other' } },
    ])
    expect(idx.blockSlot).toEqual({ display: 2, body: 1, other: 1 })
  })

  it('handles blocks with missing settings gracefully', () => {
    const idx = buildUsageIndex([
      { settings: null },
      { settings: undefined },
      {},
      { settings: { headingPresetKey: 'a' } },
    ])
    expect(idx.blockSlot).toEqual({ a: 1 })
  })
})

describe('getKeyUsage', () => {
  it('returns per-category counts and total for a specific key', () => {
    const idx = createEmptyUsageIndex()
    idx.blockSlot['foo'] = 3
    idx.richTextParagraph['foo'] = 2
    idx.richTextInline['foo'] = 5
    idx.blockSlot['bar'] = 1

    const foo = getKeyUsage(idx, 'foo')
    expect(foo).toEqual({
      blockSlot: 3,
      richTextParagraph: 2,
      richTextInline: 5,
      total: 10,
    })

    const bar = getKeyUsage(idx, 'bar')
    expect(bar).toEqual({
      blockSlot: 1,
      richTextParagraph: 0,
      richTextInline: 0,
      total: 1,
    })
  })

  it('returns zero for keys that do not appear in the index', () => {
    const idx = createEmptyUsageIndex()
    const result = getKeyUsage(idx, 'nope')
    expect(result).toEqual({
      blockSlot: 0,
      richTextParagraph: 0,
      richTextInline: 0,
      total: 0,
    })
  })
})
