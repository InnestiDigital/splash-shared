import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TypographyParagraph } from '~/shared/tiptap/extensions/TypographyParagraph'
import { TextColor } from '~/shared/tiptap/extensions/TextColor'
import { FontWeight } from '~/shared/tiptap/extensions/FontWeight'
import { FontSize } from '~/shared/tiptap/extensions/FontSize'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'

const exts = [
  StarterKit.configure({ paragraph: false }),
  TypographyParagraph,
  Underline,
  TextColor,
]

const extsWithWeight = [
  StarterKit.configure({ paragraph: false }),
  TypographyParagraph,
  Underline,
  TextColor,
  FontWeight,
]

const extsWithSize = [
  StarterKit.configure({ paragraph: false }),
  TypographyParagraph,
  Underline,
  TextColor,
  FontWeight,
  FontSize,
]

describe('TextColor mark', () => {
  it('renders span with style="color: <hex>"', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'textColor', attrs: { color: '#ff0000' } }],
          text: 'hi',
        }],
      }],
    }
    const html = generateHTML(doc, exts)
    // DOM serialization appends trailing `;` to style declarations; tolerate either form.
    expect(html).toMatch(/style="color: #ff0000;?"/)
    expect(html).toContain('hi')
  })

  it('parses span style="color: ..." back into textColor mark', () => {
    const html = '<p><span style="color: #112233">hi</span></p>'
    const json = generateJSON(html, exts)
    const marks = json.content[0].content[0].marks
    expect(marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'textColor', attrs: { color: '#112233' } }),
      ]),
    )
  })

  it('round-trips JSON → HTML → JSON preserving textColor', () => {
    const original = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'textColor', attrs: { color: '#abcdef' } }],
          text: 'hi',
        }],
      }],
    }
    const html = generateHTML(original, exts)
    const back = generateJSON(html, exts)
    expect(back.content[0].content[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'textColor', attrs: { color: '#abcdef' } }),
      ]),
    )
  })
})

describe('FontWeight mark', () => {
  it('renders span with style="font-weight: <n>"', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontWeight', attrs: { weight: '700' } }],
          text: 'bold-ish',
        }],
      }],
    }
    const html = generateHTML(doc, extsWithWeight)
    // DOM serialization appends trailing `;` to style declarations; tolerate either form.
    expect(html).toMatch(/style="font-weight: 700;?"/)
    expect(html).toContain('bold-ish')
  })

  it('parses span style="font-weight: ..." back into fontWeight mark', () => {
    const html = '<p><span style="font-weight: 600">x</span></p>'
    const json = generateJSON(html, extsWithWeight)
    const marks = json.content[0].content[0].marks
    expect(marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fontWeight', attrs: { weight: '600' } }),
      ]),
    )
  })

  it('round-trips JSON → HTML → JSON preserving fontWeight', () => {
    const original = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontWeight', attrs: { weight: '500' } }],
          text: 'hi',
        }],
      }],
    }
    const html = generateHTML(original, extsWithWeight)
    const back = generateJSON(html, extsWithWeight)
    expect(back.content[0].content[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fontWeight', attrs: { weight: '500' } }),
      ]),
    )
  })
})

describe('FontSize mark', () => {
  it('renders span with style="font-size: <enum>"', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontSize', attrs: { size: '1.5rem' } }],
          text: 'big',
        }],
      }],
    }
    const html = generateHTML(doc, extsWithSize)
    expect(html).toMatch(/style="font-size: 1\.5rem;?"/)
  })

  it('parses span style="font-size: ..." back into fontSize mark', () => {
    const html = '<p><span style="font-size: 2rem">x</span></p>'
    const json = generateJSON(html, extsWithSize)
    const marks = json.content[0].content[0].marks
    expect(marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fontSize', attrs: { size: '2rem' } }),
      ]),
    )
  })

  it('round-trips fontSize through JSON → HTML → JSON', () => {
    const original = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontSize', attrs: { size: '1.25rem' } }],
          text: 'med',
        }],
      }],
    }
    const html = generateHTML(original, extsWithSize)
    const back = generateJSON(html, extsWithSize)
    expect(back.content[0].content[0].marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fontSize', attrs: { size: '1.25rem' } }),
      ]),
    )
  })
})

describe('createRichTextExtensions includes new override marks', () => {
  it('registers textColor / fontWeight / fontSize / strike', () => {
    const exts = createRichTextExtensions()
    const names = exts.map((e: any) => e.name).filter(Boolean)
    expect(names).toContain('textColor')
    expect(names).toContain('fontWeight')
    expect(names).toContain('fontSize')
    // Strike ships with StarterKit (no separate registration); confirm it's
    // available in the assembled editor by parsing a <s> tag and checking
    // the strike mark survives.
    const html = '<p><s>gone</s></p>'
    const json = generateJSON(html, exts)
    const marks = json.content?.[0]?.content?.[0]?.marks ?? []
    expect(marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'strike' })]),
    )
  })

  it('preserves existing TypographyParagraph + InlineTypographyPreset behavior', () => {
    const exts = createRichTextExtensions()
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { presetKey: 'body-large' },
        content: [{
          type: 'text',
          marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } }],
          text: 'x',
        }],
      }],
    }
    const html = generateHTML(doc, exts)
    expect(html).toContain('rt-preset-body-large')
    expect(html).toContain('rt-preset-small-caps')
  })
})
