import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { TypographyParagraph } from '~/shared/tiptap/extensions/TypographyParagraph'
import { InlineTypographyPreset } from '~/shared/tiptap/extensions/InlineTypographyPreset'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'

const extensions = [
  StarterKit.configure({ paragraph: false }),
  TypographyParagraph,
  Underline,
  Link,
]

const extensionsWithInline = [
  StarterKit.configure({ paragraph: false }),
  TypographyParagraph,
  Underline,
  Link,
  InlineTypographyPreset,
]

describe('TypographyParagraph', () => {
  it('renders plain <p> when no preset is set', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    const html = generateHTML(doc, extensions)
    expect(html).toBe('<p>hello</p>')
  })

  it('renders preset class and data attribute when presetKey is set', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { presetKey: 'body-large' },
        content: [{ type: 'text', text: 'hello' }],
      }],
    }
    const html = generateHTML(doc, extensions)
    expect(html).toContain('class="rt-preset-body-large"')
    expect(html).toContain('data-preset-key="body-large"')
  })

  it('parses data-preset-key attribute from HTML', () => {
    const html = '<p data-preset-key="body-large" class="rt-preset-body-large">hello</p>'
    const json = generateJSON(html, extensions)
    expect(json.content[0].attrs.presetKey).toBe('body-large')
  })

  it('falls back to parsing rt-preset-* class when data attr is missing', () => {
    const html = '<p class="rt-preset-body-large">hello</p>'
    const json = generateJSON(html, extensions)
    expect(json.content[0].attrs.presetKey).toBe('body-large')
  })

  it('parses plain <p> as presetKey null', () => {
    const html = '<p>hello</p>'
    const json = generateJSON(html, extensions)
    expect(json.content[0].attrs.presetKey).toBeNull()
  })

  it('round-trips: JSON → HTML → JSON preserves presetKey', () => {
    const original = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { presetKey: 'caption-small' },
        content: [{ type: 'text', text: 'test' }],
      }],
    }
    const html = generateHTML(original, extensions)
    const parsed = generateJSON(html, extensions)
    expect(parsed.content[0].attrs.presetKey).toBe('caption-small')
  })
})

describe('InlineTypographyPreset', () => {
  it('renders span with class and data attribute', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } }],
          text: 'Featured',
        }],
      }],
    }
    const html = generateHTML(doc, extensionsWithInline)
    expect(html).toContain('<span class="rt-preset-small-caps" data-preset-key="small-caps">Featured</span>')
  })

  it('parses span with data-preset-key', () => {
    const html = '<p><span data-preset-key="small-caps" class="rt-preset-small-caps">Featured</span></p>'
    const json = generateJSON(html, extensionsWithInline)
    const marks = json.content[0].content[0].marks
    expect(marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } }),
      ]),
    )
  })

  it('coexists with bold mark', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'bold' },
            { type: 'inlineTypographyPreset', attrs: { presetKey: 'label' } },
          ],
          text: 'Bold Label',
        }],
      }],
    }
    const html = generateHTML(doc, extensionsWithInline)
    expect(html).toContain('Bold Label')
    expect(html).toContain('rt-preset-label')
    expect(html).toContain('<strong>')
  })

  it('round-trips: JSON → HTML → JSON preserves inline preset', () => {
    const original = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'accent' } }],
          text: 'hi',
        }],
      }],
    }
    const html = generateHTML(original, extensionsWithInline)
    const parsed = generateJSON(html, extensionsWithInline)
    const marks = parsed.content[0].content[0].marks
    expect(marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'inlineTypographyPreset', attrs: { presetKey: 'accent' } }),
      ]),
    )
  })
})

describe('createRichTextExtensions', () => {
  it('returns an array of extensions', () => {
    const exts = createRichTextExtensions()
    expect(Array.isArray(exts)).toBe(true)
    expect(exts.length).toBeGreaterThanOrEqual(4)
  })

  it('produces same HTML as manual extension list', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { presetKey: 'body-large' },
        content: [{ type: 'text', text: 'test' }],
      }],
    }
    const fromBuilder = generateHTML(doc, createRichTextExtensions())
    const fromManual = generateHTML(doc, extensionsWithInline)
    expect(fromBuilder).toBe(fromManual)
  })
})

describe('Link extension — isAllowedUri (XSS prevention)', () => {
  const exts = createRichTextExtensions()

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(document.cookie)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['file:///etc/passwd'],
  ])('parseHTML drops link mark for disallowed href: %s', (href) => {
    const html = `<p><a href="${href}">click</a></p>`
    const json = generateJSON(html, exts)
    const textNode = json.content?.[0]?.content?.[0]
    const marks: any[] = textNode?.marks ?? []
    const linkMark = marks.find((m: any) => m.type === 'link')
    expect(linkMark).toBeUndefined()
  })

  it.each([
    ['https://example.com'],
    ['http://example.com'],
    ['mailto:user@example.com'],
    ['tel:+15551234567'],
    ['/relative/path'],
    ['#fragment'],
  ])('parseHTML preserves link mark for safe href: %s', (href) => {
    const html = `<p><a href="${href}">click</a></p>`
    const json = generateJSON(html, exts)
    const textNode = json.content?.[0]?.content?.[0]
    const marks: any[] = textNode?.marks ?? []
    const linkMark = marks.find((m: any) => m.type === 'link')
    expect(linkMark).toBeDefined()
    expect(linkMark.attrs.href).toBe(href)
  })
})
