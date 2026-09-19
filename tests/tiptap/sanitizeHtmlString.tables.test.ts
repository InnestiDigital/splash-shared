import { describe, it, expect, vi, afterEach } from 'vitest'
import { sanitizeHtmlString } from '~/shared/tiptap/sanitizeHtmlString'
import { renderTipTapToHtml } from '~/shared/tiptap/renderTipTapToHtml'
import type { TipTapDocument } from '~/shared/tiptap/types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sanitizeHtmlString — tables (block mode)', () => {
  it('passes through a full table structure unchanged', () => {
    const html =
      '<table><caption>Roster</caption><thead><tr><th>Name</th><th>Rank</th></tr></thead>'
      + '<tbody><tr><td>A</td><td>B</td></tr></tbody>'
      + '<tfoot><tr><td>x</td><td>y</td></tr></tfoot></table>'
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  it('keeps allowed inline content inside cells', () => {
    const html = '<table><tr><td><strong>bold</strong> <a href="/p">link</a></td></tr></table>'
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  it('keeps valid colspan/rowspan on td and th', () => {
    const html = '<table><tr><th colspan="2">h</th></tr><tr><td rowspan="3">c</td></tr></table>'
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  it('drops non-integer, zero, negative, and oversized span values', () => {
    expect(sanitizeHtmlString('<td colspan="abc">x</td>')).toBe('<td>x</td>')
    expect(sanitizeHtmlString('<td colspan="0">x</td>')).toBe('<td>x</td>')
    expect(sanitizeHtmlString('<td rowspan="-2">x</td>')).toBe('<td>x</td>')
    expect(sanitizeHtmlString('<td colspan="1000">x</td>')).toBe('<td>x</td>')
  })

  it('strips every other attribute from table tags', () => {
    expect(
      sanitizeHtmlString('<table border="1" style="color:red" onclick="evil()"><tr class="x"><td width="50">c</td></tr></table>'),
    ).toBe('<table><tr><td>c</td></tr></table>')
  })

  it('still strips disallowed tags nested inside a table', () => {
    expect(
      sanitizeHtmlString('<table><tr><td><img src="x" /><script>evil()</script>text</td></tr></table>'),
    ).toBe('<table><tr><td>evil()text</td></tr></table>')
  })

  it('does not throw on malformed table markup', () => {
    expect(() => sanitizeHtmlString('<table><tr><td>unclosed')).not.toThrow()
    expect(() => sanitizeHtmlString('</td></table><table')).not.toThrow()
    expect(sanitizeHtmlString('<table><tr><td>unclosed')).toBe('<table><tr><td>unclosed')
  })
})

describe('sanitizeHtmlString — tables stay stripped in inline/single modes', () => {
  it('inline mode strips table tags, keeps text', () => {
    expect(sanitizeHtmlString('<table><tr><td>x</td></tr></table>', { mode: 'inline', onStripped: () => {} }))
      .toBe('x')
  })

  it('single mode strips table tags, keeps text', () => {
    expect(sanitizeHtmlString('<table><tr><td>x</td></tr></table>', { mode: 'single', onStripped: () => {} }))
      .toBe('x')
  })
})

describe('sanitizeHtmlString — <img> stays denied in block mode', () => {
  it('strips <img> entirely (managed-asset route, not raw HTML)', () => {
    const onStripped = vi.fn()
    expect(sanitizeHtmlString('<p><img src="/images/a.jpg" alt="a" /></p>', { onStripped })).toBe('<p></p>')
    expect(onStripped).toHaveBeenCalledWith(['img'])
  })
})

describe('sanitizeHtmlString — stripping is observable', () => {
  it('reports unique stripped tag names through the injected handler', () => {
    const onStripped = vi.fn()
    sanitizeHtmlString('<div><img src="x" /><img src="y" /><table><tr><td>c</td></tr></table></div>', {
      mode: 'inline',
      onStripped,
    })
    expect(onStripped).toHaveBeenCalledTimes(1)
    const [tags] = onStripped.mock.calls[0]
    expect([...tags].sort()).toEqual(['div', 'img', 'table', 'td', 'tr'])
  })

  it('does not invoke the handler when nothing is stripped', () => {
    const onStripped = vi.fn()
    sanitizeHtmlString('<p>clean</p>', { onStripped })
    expect(onStripped).not.toHaveBeenCalled()
  })

  it('defaults to console.warn when no handler is injected', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sanitizeHtmlString('<img src="x" />')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('img')
  })
})

describe('renderTipTapToHtml — table nodes', () => {
  const tableDoc: TipTapDocument = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 2 },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
              },
            ],
          },
        ],
      },
    ],
  }

  it('serializes table/tableRow/tableHeader/tableCell in block mode', () => {
    expect(renderTipTapToHtml(tableDoc, new Set())).toBe(
      '<table><tr><th colspan="2"><p>Head</p></th></tr><tr><td><p>Cell</p></td></tr></table>',
    )
  })

  it('block-mode table output survives the block-mode sanitizer verbatim', () => {
    const html = renderTipTapToHtml(tableDoc, new Set())
    expect(sanitizeHtmlString(html)).toBe(html)
  })

  it('flattens table wrappers to text content in single mode', () => {
    expect(renderTipTapToHtml(tableDoc, new Set(), { mode: 'single' })).toBe('HeadCell')
  })
})
