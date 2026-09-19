import { describe, it, expect, vi } from 'vitest'
import { renderTipTapToHtml } from '~/shared/tiptap/renderTipTapToHtml'
import type { TipTapDocument } from '~/shared/tiptap/types'
import { sanitizeHtmlString } from '~/shared/tiptap/sanitizeHtmlString'

const validKeys = new Set(['body-large', 'small-caps', 'accent'])

describe('renderTipTapToHtml', () => {
  describe('paragraphs', () => {
    it('renders plain paragraph', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>hello</p>')
    })

    it('renders paragraph with valid preset', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { presetKey: 'body-large' },
          content: [{ type: 'text', text: 'styled' }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p class="rt-preset-body-large">styled</p>')
    })

    it('renders paragraph with invalid preset as plain <p>', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { presetKey: 'nonexistent' },
          content: [{ type: 'text', text: 'text' }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>text</p>')
    })

    it('renders empty paragraph', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p></p>')
    })
  })

  describe('text and marks', () => {
    it('escapes HTML in text nodes', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert("xss")</script>' }] }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('renders bold mark', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'bold' }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><strong>bold</strong></p>')
    })

    it('renders italic mark', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'ital' }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><em>ital</em></p>')
    })

    it('renders underline mark', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: 'under' }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><u>under</u></p>')
    })

    it('renders link mark with href sanitization', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            text: 'click',
          }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><a href="https://example.com">click</a></p>')
    })

    it.each([
      ['javascript:alert(1)', 'javascript:'],
      ['JaVaScRiPt:alert(document.cookie)', 'javaScrip'],
      ['data:text/html,<script>alert(1)</script>', 'data:'],
      ['vbscript:msgbox(1)', 'vbscript:'],
      ['file:///etc/passwd', 'file:'],
      ['  javascript:alert(1)  ', 'javascript:'],
    ])('sanitizes disallowed href %s → strips link wrapper and scheme', (href, dangerousSubstring) => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [{ type: 'link', attrs: { href } }],
            text: 'bad',
          }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).not.toContain(dangerousSubstring)
      // text is still rendered (no link wrapper)
      expect(html).toContain('bad')
    })

    it.each([
      ['mailto:user@example.com'],
      ['tel:+15551234567'],
      ['/relative/path'],
      ['#fragment'],
      ['https://example.com'],
      ['http://example.com'],
    ])('preserves safe href %s', (href) => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [{ type: 'link', attrs: { href } }],
            text: 'link',
          }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).toContain(`href="${href}"`)
    })

    it('renders inline preset mark with valid key', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [{ type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } }],
            text: 'styled',
          }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><span class="rt-preset-small-caps">styled</span></p>')
    })

    it('renders inline preset mark with invalid key as plain text (preserves other marks)', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [
              { type: 'bold' },
              { type: 'inlineTypographyPreset', attrs: { presetKey: 'nonexistent' } },
            ],
            text: 'styled',
          }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).toContain('<strong>styled</strong>')
      expect(html).not.toContain('rt-preset')
    })

    it('enforces deterministic mark nesting: link > strong > em > u > inline preset', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [
              { type: 'inlineTypographyPreset', attrs: { presetKey: 'accent' } },
              { type: 'underline' },
              { type: 'bold' },
              { type: 'italic' },
              { type: 'link', attrs: { href: 'https://x.com' } },
            ],
            text: 'all',
          }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).toBe('<p><a href="https://x.com"><strong><em><u><span class="rt-preset-accent">all</span></u></em></strong></a></p>')
    })
  })

  describe('lists', () => {
    it('renders bullet list', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item 1' }] }],
          }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<ul><li><p>item 1</p></li></ul>')
    })

    it('renders ordered list', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'orderedList',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item 1' }] }],
          }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<ol><li><p>item 1</p></li></ol>')
    })
  })

  describe('hardBreak', () => {
    it('renders hardBreak as <br>', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line 1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line 2' },
          ],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>line 1<br>line 2</p>')
    })
  })

  describe('unknown nodes', () => {
    it('drops unknown node type and renders children', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'unknownWidget',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).toBe('<p>inside</p>')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknownWidget'))
      spy.mockRestore()
    })
  })

  describe('unknown marks', () => {
    it('silently drops unknown mark types and renders text without wrapper', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'styled',
            marks: [{ type: 'unknownHighlight', attrs: {} }],
          }],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>styled</p>')
    })
  })

  describe('empty document', () => {
    it('renders empty doc as empty string', () => {
      const doc: TipTapDocument = { type: 'doc', content: [] }
      expect(renderTipTapToHtml(doc, validKeys)).toBe('')
    })
  })

  describe('backwards compatibility (no inline override marks)', () => {
    it('renders a typical preset+bold paragraph identically to pre-Phase-1', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { presetKey: 'body-large' },
          content: [
            { type: 'text', text: 'Plain ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
            { type: 'text', text: ' tail.' },
          ],
        }],
      }
      expect(renderTipTapToHtml(doc, validKeys)).toBe(
        '<p class="rt-preset-body-large">Plain <strong>bold</strong> tail.</p>',
      )
    })

    it('renders inline preset + link without spurious style spans', () => {
      const doc: TipTapDocument = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            marks: [
              { type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } },
              { type: 'link', attrs: { href: 'https://example.com' } },
            ],
            text: 'Featured',
          }],
        }],
      }
      const html = renderTipTapToHtml(doc, validKeys)
      expect(html).not.toContain('style=')
      expect(html).toContain('rt-preset-small-caps')
      expect(html).toContain('href="https://example.com"')
    })
  })
})

describe('renderTipTapToHtml — headings', () => {
  const doc = (level: unknown) => ({
    type: 'doc',
    content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'Sezione' }] }],
  })

  it('renders a heading at its authored level', () => {
    expect(renderTipTapToHtml(doc(3), new Set(), { mode: 'block' })).toBe('<h3>Sezione</h3>')
  })

  it('clamps level 1 to h2 — the page template owns the document h1', () => {
    expect(renderTipTapToHtml(doc(1), new Set(), { mode: 'block' })).toBe('<h2>Sezione</h2>')
  })

  it('clamps out-of-range and non-numeric levels instead of emitting <hundefined>', () => {
    expect(renderTipTapToHtml(doc(99), new Set(), { mode: 'block' })).toBe('<h6>Sezione</h6>')
    expect(renderTipTapToHtml(doc(undefined), new Set(), { mode: 'block' })).toBe('<h2>Sezione</h2>')
    expect(renderTipTapToHtml(doc('abc'), new Set(), { mode: 'block' })).toBe('<h2>Sezione</h2>')
  })

  it('flattens to text in inline and single modes', () => {
    expect(renderTipTapToHtml(doc(2), new Set(), { mode: 'inline' })).toBe('Sezione')
    expect(renderTipTapToHtml(doc(2), new Set(), { mode: 'single' })).toBe('Sezione')
  })

  it('emits only tags the sanitizer allows — the two lists must stay in step', () => {
    // Guards the real failure: renderer emits a tag, sanitizer then strips it,
    // and the heading silently vanishes between the two layers.
    for (const level of [2, 3, 4, 5, 6]) {
      const html = renderTipTapToHtml(doc(level), new Set(), { mode: 'block' })
      expect(sanitizeHtmlString(html, { mode: 'block', onStripped: () => {} })).toBe(html)
    }
  })
})
