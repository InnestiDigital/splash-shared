import { describe, it, expect } from 'vitest'
import { sanitizeHtmlString } from '~/shared/tiptap/sanitizeHtmlString'

describe('sanitizeHtmlString', () => {
  // ── Passthrough: allowed tags ─────────────────────────────────────────────

  it('passes through allowed block tags unchanged', () => {
    expect(sanitizeHtmlString('<p>Hello</p>')).toBe('<p>Hello</p>')
    expect(sanitizeHtmlString('<ul><li>Item</li></ul>')).toBe('<ul><li>Item</li></ul>')
    expect(sanitizeHtmlString('<ol><li>One</li></ol>')).toBe('<ol><li>One</li></ol>')
  })

  it('passes through allowed inline tags unchanged', () => {
    expect(sanitizeHtmlString('<strong>bold</strong>')).toBe('<strong>bold</strong>')
    expect(sanitizeHtmlString('<em>italic</em>')).toBe('<em>italic</em>')
    expect(sanitizeHtmlString('<u>under</u>')).toBe('<u>under</u>')
    expect(sanitizeHtmlString('<br>')).toBe('<br>')
    expect(sanitizeHtmlString('<br />')).toBe('<br />')
  })

  it('passes through rt-preset-* class on <p>', () => {
    expect(sanitizeHtmlString('<p class="rt-preset-body-large">text</p>')).toBe(
      '<p class="rt-preset-body-large">text</p>',
    )
  })

  it('passes through rt-preset-* class on <span>', () => {
    expect(sanitizeHtmlString('<span class="rt-preset-display">text</span>')).toBe(
      '<span class="rt-preset-display">text</span>',
    )
  })

  it('passes through safe href on <a>', () => {
    expect(sanitizeHtmlString('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com">link</a>',
    )
    expect(sanitizeHtmlString('<a href="/relative/path">link</a>')).toBe(
      '<a href="/relative/path">link</a>',
    )
    expect(sanitizeHtmlString('<a href="mailto:user@example.com">email</a>')).toBe(
      '<a href="mailto:user@example.com">email</a>',
    )
    expect(sanitizeHtmlString('<a href="#section">anchor</a>')).toBe(
      '<a href="#section">anchor</a>',
    )
  })

  it('preserves typical renderTipTapToHtml output verbatim', () => {
    const html = '<p class="rt-preset-body-large"><strong>Hello</strong> <em>world</em></p>'
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  // ── Stripping: disallowed tags ────────────────────────────────────────────

  it('strips <script> tags, keeping inner text', () => {
    expect(sanitizeHtmlString('<script>alert(1)</script>')).toBe('alert(1)')
  })

  it('strips <script> with attributes', () => {
    expect(sanitizeHtmlString('<script src="evil.js"></script>')).toBe('')
  })

  it('strips <iframe>', () => {
    expect(sanitizeHtmlString('<iframe src="https://evil.com"></iframe>')).toBe('')
  })

  it('strips <style>', () => {
    expect(sanitizeHtmlString('<style>body{display:none}</style>')).toBe(
      'body{display:none}',
    )
  })

  it('strips <img>', () => {
    expect(sanitizeHtmlString('<img src="x" onerror="alert(1)" />')).toBe('')
  })

  it('strips <svg>', () => {
    expect(sanitizeHtmlString('<svg><circle r="10"/></svg>')).toBe('')
  })

  it('strips <div> and <span> nesting when span has no rt-preset class', () => {
    // <div> is not allowed; inner text preserved
    expect(sanitizeHtmlString('<div>content</div>')).toBe('content')
  })

  it('strips unknown tags but keeps text content', () => {
    expect(sanitizeHtmlString('<blink>text</blink>')).toBe('text')
    expect(sanitizeHtmlString('<marquee>scrolling</marquee>')).toBe('scrolling')
  })

  // ── Attribute stripping ───────────────────────────────────────────────────

  it('strips event handler attributes (onclick, onerror, …)', () => {
    expect(sanitizeHtmlString('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>')
    expect(sanitizeHtmlString('<a href="https://ok.com" onclick="evil()">link</a>')).toBe(
      '<a href="https://ok.com">link</a>',
    )
  })

  it('strips data-* and id attributes from allowed tags', () => {
    expect(sanitizeHtmlString('<p id="x" data-evil="y">text</p>')).toBe('<p>text</p>')
  })

  it('strips style attribute from <p> (not allowed) and from <span> when no declaration validates', () => {
    // <p> never carries style.
    expect(sanitizeHtmlString('<p style="color:red">text</p>')).toBe('<p>text</p>')
    // <span> allows style but every declaration must pass the property
    // allowlist + per-property validator. `display: none` is not allowed →
    // attribute dropped.
    expect(sanitizeHtmlString('<span style="display:none">text</span>')).toBe(
      '<span>text</span>',
    )
  })

  it('strips non rt-preset-* class names', () => {
    expect(sanitizeHtmlString('<p class="evil-class">text</p>')).toBe('<p>text</p>')
    expect(sanitizeHtmlString('<span class="user-content foo">text</span>')).toBe(
      '<span>text</span>',
    )
  })

  it('keeps only rt-preset-* classes when mixed with other classes', () => {
    expect(
      sanitizeHtmlString('<p class="evil rt-preset-body-large another">text</p>'),
    ).toBe('<p class="rt-preset-body-large">text</p>')
  })

  // ── href sanitization ─────────────────────────────────────────────────────

  it('strips javascript: href', () => {
    expect(sanitizeHtmlString('<a href="javascript:alert(1)">xss</a>')).toBe('<a>xss</a>')
  })

  it('strips data: href', () => {
    expect(sanitizeHtmlString('<a href="data:text/plain,hello">xss</a>')).toBe(
      '<a>xss</a>',
    )
  })

  it('strips vbscript: href', () => {
    expect(sanitizeHtmlString('<a href="vbscript:msgbox(1)">xss</a>')).toBe('<a>xss</a>')
  })

  // ── Complex / nested ─────────────────────────────────────────────────────

  it('handles nested allowed tags correctly', () => {
    const html = '<ul><li><strong>bold</strong> text</li></ul>'
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  it('strips outer disallowed tag while preserving inner allowed content', () => {
    const input = '<div><p>Hello <strong>world</strong></p></div>'
    expect(sanitizeHtmlString(input)).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('handles empty string', () => {
    expect(sanitizeHtmlString('')).toBe('')
  })

  it('handles plain text with no tags', () => {
    expect(sanitizeHtmlString('Hello world')).toBe('Hello world')
  })

  it('preserves & entities already in the string', () => {
    expect(sanitizeHtmlString('<p>a &amp; b</p>')).toBe('<p>a &amp; b</p>')
  })
})

describe('sanitizeHtmlString — section headings', () => {
  it('keeps h2-h6 in block mode', () => {
    // Imported body copy is subdivided by headings. Stripping them kept the
    // words but destroyed the outline — the text rendered as an unstyled
    // run-on with no landmarks. Observed live on a published page.
    const html = '<h2>Donazioni 2019</h2><p>Body</p><h3>Sub</h3><h6>Deep</h6>'
    const out = sanitizeHtmlString(html, { mode: 'block', onStripped: () => {} })
    expect(out).toContain('<h2>Donazioni 2019</h2>')
    expect(out).toContain('<h3>Sub</h3>')
    expect(out).toContain('<h6>Deep</h6>')
  })

  it('strips h1 to text — the page template owns the only h1', () => {
    const stripped: string[][] = []
    const out = sanitizeHtmlString('<h1>Competing title</h1>', {
      mode: 'block',
      onStripped: (tags) => stripped.push([...tags]),
    })
    expect(out).not.toContain('<h1')
    expect(out).toContain('Competing title')
    expect(stripped.flat()).toContain('h1')
  })

  it('flattens headings to text in inline and single modes', () => {
    for (const mode of ['inline', 'single'] as const) {
      const out = sanitizeHtmlString('<h2>Title</h2>', { mode, onStripped: () => {} })
      expect(out).not.toContain('<h2')
      expect(out).toContain('Title')
    }
  })
})
