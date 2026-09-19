import { describe, it, expect } from 'vitest'
import { generateJSON, generateHTML } from '@tiptap/html'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'
import { stripPresetMetadata } from '~/shared/tiptap/extensions/pasteSanitization'
import type { TipTapDocument } from '~/shared/tiptap/types'

const extensions = createRichTextExtensions()

describe('stripPresetMetadata', () => {
  it('removes paragraph presetKey attrs', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { presetKey: 'body-large' },
        content: [{ type: 'text', text: 'hello' }],
      }],
    }
    const cleaned = stripPresetMetadata(doc)
    expect(cleaned.content[0].attrs?.presetKey).toBeNull()
  })

  it('removes inlineTypographyPreset marks', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'bold' },
            { type: 'inlineTypographyPreset', attrs: { presetKey: 'accent' } },
          ],
          text: 'styled',
        }],
      }],
    }
    const cleaned = stripPresetMetadata(doc)
    const marks = cleaned.content[0].content![0].marks
    expect(marks).toHaveLength(1)
    expect(marks![0].type).toBe('bold')
  })

  it('preserves bold, italic, underline, link marks', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'bold' },
            { type: 'italic' },
            { type: 'underline' },
            { type: 'link', attrs: { href: 'https://example.com' } },
          ],
          text: 'rich',
        }],
      }],
    }
    const cleaned = stripPresetMetadata(doc)
    const marks = cleaned.content[0].content![0].marks
    expect(marks).toHaveLength(4)
  })

  it('preserves paragraphs and list structure', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'para' }] },
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
          }],
        },
      ],
    }
    const cleaned = stripPresetMetadata(doc)
    expect(cleaned.content).toHaveLength(2)
    expect(cleaned.content[0].type).toBe('paragraph')
    expect(cleaned.content[1].type).toBe('bulletList')
  })

  it('handles empty document', () => {
    const doc: TipTapDocument = { type: 'doc', content: [] }
    const cleaned = stripPresetMetadata(doc)
    expect(cleaned).toEqual({ type: 'doc', content: [] })
  })
})
