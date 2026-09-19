import { describe, it, expect } from 'vitest'
import { sanitizeHtmlString } from '~/shared/tiptap/sanitizeHtmlString'

describe('sanitizeHtmlString — single mode', () => {
  it('strips <p> wrapper and keeps inner text', () => {
    expect(sanitizeHtmlString('<p>hello</p>', { mode: 'single' })).toBe('hello')
  })
  it('strips <br>', () => {
    expect(sanitizeHtmlString('a<br>b', { mode: 'single' })).toBe('ab')
  })
  it('strips <ul><li>', () => {
    expect(sanitizeHtmlString('<ul><li>x</li></ul>', { mode: 'single' })).toBe('x')
  })
  it('strips <a>', () => {
    expect(sanitizeHtmlString('<a href="https://x">link</a>', { mode: 'single' })).toBe('link')
  })
  it('keeps <strong> / <em> / <u> / <s> / <span>', () => {
    expect(sanitizeHtmlString('<strong>a</strong><em>b</em><u>c</u><s>d</s>', { mode: 'single' }))
      .toBe('<strong>a</strong><em>b</em><u>c</u><s>d</s>')
  })
  it('keeps <span class="rt-preset-X">', () => {
    expect(sanitizeHtmlString('<span class="rt-preset-body">x</span>', { mode: 'single' }))
      .toBe('<span class="rt-preset-body">x</span>')
  })
  it('keeps <span style="color: #fff">', () => {
    expect(sanitizeHtmlString('<span style="color: #fff">x</span>', { mode: 'single' }))
      .toBe('<span style="color: #fff">x</span>')
  })
})

describe('sanitizeHtmlString — inline mode', () => {
  it('strips <p> wrapper, keeps <br>', () => {
    expect(sanitizeHtmlString('<p>a<br>b</p>', { mode: 'inline' })).toBe('a<br>b')
  })
  it('strips <ul><li>', () => {
    expect(sanitizeHtmlString('<ul><li>x</li></ul>', { mode: 'inline' })).toBe('x')
  })
  it('strips <a>', () => {
    expect(sanitizeHtmlString('<a href="https://x">link</a>', { mode: 'inline' })).toBe('link')
  })
  it('keeps inline marks', () => {
    expect(sanitizeHtmlString('<strong>a</strong>', { mode: 'inline' })).toBe('<strong>a</strong>')
  })
})

describe('sanitizeHtmlString — block mode (default, back-compat)', () => {
  it('keeps <p>, <br>, <ul>, <li>, <a>, inline marks', () => {
    const html = '<p>a<br>b</p><ul><li>c</li></ul><p><a href="https://x"><strong>d</strong></a></p>'
    expect(sanitizeHtmlString(html, { mode: 'block' })).toBe(html)
  })
  it('defaults to block mode when no options arg passed (back-compat)', () => {
    expect(sanitizeHtmlString('<p>x</p>')).toBe('<p>x</p>')
  })
})
