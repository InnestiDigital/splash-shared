import { describe, it, expect } from 'vitest'
import { transformRichtextFields } from '~/shared/tiptap/transformRichtextFields'
import type { TipTapDocument } from '~/shared/tiptap/types'

const doc = (text: string, presetKey?: string): TipTapDocument => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      ...(presetKey ? { attrs: { presetKey } } : {}),
      content: [{ type: 'text', text }],
    },
  ],
})

const simpleSchema = {
  settings: [
    { id: 'body', type: 'richtext' },
    { id: 'title', type: 'text' },
  ],
}

describe('transformRichtextFields (shared)', () => {
  it('converts a direct TipTap doc to HTML', () => {
    const result = transformRichtextFields(
      { body: doc('Hello'), title: 'Title' },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toBe('<p>Hello</p>')
    expect(result.title).toBe('Title')
  })

  it('converts each locale in a translatable locale map', () => {
    const result = transformRichtextFields(
      { body: { 'en-US': doc('Hello'), 'fr-CA': doc('Bonjour') } },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toEqual({
      'en-US': '<p>Hello</p>',
      'fr-CA': '<p>Bonjour</p>',
    })
  })

  it('applies preset class when key is in validPresetKeys', () => {
    const result = transformRichtextFields(
      { body: doc('Hello', 'body-large') },
      simpleSchema,
      new Set(['body-large']),
    )
    expect(result.body).toBe('<p class="rt-preset-body-large">Hello</p>')
  })

  it('omits preset class when key is not in validPresetKeys', () => {
    const result = transformRichtextFields(
      { body: doc('Hello', 'nonexistent') },
      simpleSchema,
      new Set(['body-large']),
    )
    expect(result.body).toBe('<p>Hello</p>')
  })

  it('converts richtext even when validPresetKeys is empty (regression)', () => {
    // Regression: previously both admin and server bailed out early when
    // no preset keys were provided, shipping raw TipTap JSON to renderers.
    const result = transformRichtextFields(
      { body: doc('Hello') },
      simpleSchema,
      new Set(),
    )
    expect(typeof result.body).toBe('string')
    expect(result.body).toBe('<p>Hello</p>')
  })

  it('returns settings unchanged when schema is null', () => {
    const original = { body: doc('Hello') }
    const result = transformRichtextFields(original, null, new Set())
    expect(result).toBe(original)
  })

  it('handles richtext inside repeater sub-fields', () => {
    const schemaWithRepeater = {
      settings: [
        {
          id: 'items',
          type: 'repeater',
          fields: [
            { id: 'label', type: 'text' },
            { id: 'content', type: 'richtext' },
          ],
        },
      ],
    }
    const result = transformRichtextFields(
      {
        items: [
          { label: 'One', content: doc('First') },
          { label: 'Two', content: doc('Second') },
        ],
      },
      schemaWithRepeater,
      new Set(),
    )
    expect(result.items).toEqual([
      { label: 'One', content: '<p>First</p>' },
      { label: 'Two', content: '<p>Second</p>' },
    ])
  })

  it('handles translatable richtext inside repeater sub-fields', () => {
    const schemaWithRepeater = {
      settings: [
        {
          id: 'items',
          type: 'repeater',
          fields: [{ id: 'body', type: 'richtext' }],
        },
      ],
    }
    const result = transformRichtextFields(
      {
        items: [
          { body: { 'en-US': doc('Hello'), 'fr-CA': doc('Bonjour') } },
        ],
      },
      schemaWithRepeater,
      new Set(),
    )
    expect(result.items[0].body).toEqual({
      'en-US': '<p>Hello</p>',
      'fr-CA': '<p>Bonjour</p>',
    })
  })

  it('leaves null/undefined richtext values untouched', () => {
    const result = transformRichtextFields(
      { body: null, title: 'Title' },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toBeNull()
    expect(result.title).toBe('Title')
  })

  // ── String passthrough sanitization (bypass-path hardening) ──────────────

  it('sanitizes a raw HTML string richtext value (strips disallowed tags)', () => {
    const result = transformRichtextFields(
      { body: '<p>Hello</p><script>alert(1)</script>' },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toBe('<p>Hello</p>alert(1)')
  })

  it('sanitizes a raw HTML string richtext value (strips disallowed attributes)', () => {
    const result = transformRichtextFields(
      { body: '<p onclick="evil()">text</p>' },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toBe('<p>text</p>')
  })

  it('passes through clean HTML string richtext value unchanged', () => {
    const result = transformRichtextFields(
      { body: '<p>Plain paragraph</p>' },
      simpleSchema,
      new Set(),
    )
    expect(result.body).toBe('<p>Plain paragraph</p>')
  })

  it('sanitizes string values in a locale map richtext field', () => {
    const result = transformRichtextFields(
      {
        body: {
          'en-US': '<p>Hello</p><script>xss</script>',
          'fr-CA': '<p>Bonjour</p>',
        },
      },
      simpleSchema,
      new Set(),
    )
    expect(result.body['en-US']).toBe('<p>Hello</p>xss')
    expect(result.body['fr-CA']).toBe('<p>Bonjour</p>')
  })

  it('sanitizes string richtext values inside repeater sub-fields', () => {
    const schemaWithRepeater = {
      settings: [
        {
          id: 'items',
          type: 'repeater',
          fields: [
            { id: 'label', type: 'text' },
            { id: 'content', type: 'richtext' },
          ],
        },
      ],
    }
    const result = transformRichtextFields(
      {
        items: [
          { label: 'One', content: '<p>Safe</p>' },
          { label: 'Two', content: '<p>Text</p><script>bad()</script>' },
        ],
      },
      schemaWithRepeater,
      new Set(),
    )
    expect(result.items[0].content).toBe('<p>Safe</p>')
    expect(result.items[1].content).toBe('<p>Text</p>bad()')
  })

  it('sanitizes string locale values inside repeater richtext sub-fields', () => {
    const schemaWithRepeater = {
      settings: [
        {
          id: 'items',
          type: 'repeater',
          fields: [{ id: 'body', type: 'richtext' }],
        },
      ],
    }
    const result = transformRichtextFields(
      {
        items: [
          {
            body: {
              'en-US': '<p>Safe</p>',
              'fr-CA': '<p>Bon</p><iframe src="evil"></iframe>',
            },
          },
        ],
      },
      schemaWithRepeater,
      new Set(),
    )
    expect(result.items[0].body['en-US']).toBe('<p>Safe</p>')
    expect(result.items[0].body['fr-CA']).toBe('<p>Bon</p>')
  })
})
