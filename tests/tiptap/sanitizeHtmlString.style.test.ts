import { describe, it, expect } from 'vitest'
import { sanitizeHtmlString } from '~/shared/tiptap/sanitizeHtmlString'

describe('sanitizeHtmlString — inline style on <span>', () => {
  it('passes through allowed color value', () => {
    expect(sanitizeHtmlString('<span style="color: #ff0000">red</span>')).toBe(
      '<span style="color: #ff0000">red</span>',
    )
  })

  it('passes through allowed font-weight + font-size + color combo', () => {
    expect(
      sanitizeHtmlString('<span style="color: #112233; font-weight: 700; font-size: 1.5rem">x</span>'),
    ).toBe(
      '<span style="color: #112233; font-weight: 700; font-size: 1.5rem">x</span>',
    )
  })

  it('drops disallowed properties but keeps allowed ones in same declaration', () => {
    expect(
      sanitizeHtmlString('<span style="color: #fff; background: url(x); display: none">y</span>'),
    ).toBe('<span style="color: #fff">y</span>')
  })

  it('drops the entire style attribute when no allowed property survives validation', () => {
    expect(sanitizeHtmlString('<span style="background: red; display: none">y</span>')).toBe(
      '<span>y</span>',
    )
  })

  it('drops style with rejected color value', () => {
    expect(sanitizeHtmlString('<span style="color: red">y</span>')).toBe('<span>y</span>')
  })

  it('rejects non-allowed font-size', () => {
    expect(sanitizeHtmlString('<span style="font-size: 13px">y</span>')).toBe('<span>y</span>')
  })

  it('rejects font-weight not in 100..900 step 100', () => {
    expect(sanitizeHtmlString('<span style="font-weight: 450">y</span>')).toBe('<span>y</span>')
  })

  it('passes class + style together when both valid', () => {
    expect(
      sanitizeHtmlString('<span class="rt-preset-body" style="color: #000">y</span>'),
    ).toBe('<span class="rt-preset-body" style="color: #000">y</span>')
  })

  it('drops style attr from <p> (not allowed at block level in Phase 1)', () => {
    expect(sanitizeHtmlString('<p style="color: #fff">y</p>')).toBe('<p>y</p>')
  })
})

describe('sanitizeHtmlString — <s> tag', () => {
  it('passes through <s>strikethrough</s>', () => {
    expect(sanitizeHtmlString('<s>gone</s>')).toBe('<s>gone</s>')
  })

  it('strips ALL attributes from <s> — strike is purely structural', () => {
    expect(sanitizeHtmlString('<s style="color: #fff">gone</s>')).toBe('<s>gone</s>')
    expect(sanitizeHtmlString('<s class="rt-preset-x">gone</s>')).toBe('<s>gone</s>')
  })
})

describe('sanitizeHtmlString — XSS vectors via style', () => {
  it.each([
    ['<span style="color: red; background: url(javascript:alert(1))">x</span>'],
    ['<span style="background: expression(alert(1))">x</span>'],
    ['<span style="-moz-binding: url(http://evil)">x</span>'],
    ['<span style="behavior: url(#)">x</span>'],
    ['<span style="color: \\65 \\78pression(alert(1))">x</span>'], // CSS escape sequences
    ['<span style="color: var(--leak)">x</span>'],
    ['<span style="color: rgb(0,0,0); javascript:alert(1)">x</span>'],
    ['<span style="content: \'\\003c script\\003e\'">x</span>'],
    ['<span style="color: #fff !important">x</span>'], // !important not in canonical form
  ])('strips dangerous style content: %s', (input) => {
    const out = sanitizeHtmlString(input)
    expect(out).not.toMatch(/javascript:/i)
    expect(out).not.toMatch(/expression/i)
    expect(out).not.toMatch(/url\(/i)
    expect(out).not.toMatch(/-moz-binding/i)
    expect(out).not.toMatch(/behavior:/i)
    expect(out).not.toMatch(/var\(/i)
    expect(out).not.toMatch(/!important/i)
    expect(out).not.toMatch(/\\[0-9a-f]/i) // no remaining CSS escape sequences
  })

  it('does not allow style on tags other than span and s (regression: <p>, <a>)', () => {
    expect(sanitizeHtmlString('<p style="color: #fff">x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtmlString('<a href="https://ok.com" style="color: #fff">x</a>')).toBe(
      '<a href="https://ok.com">x</a>',
    )
  })
})
