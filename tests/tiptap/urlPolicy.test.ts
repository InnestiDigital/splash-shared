import { describe, it, expect } from 'vitest'
import { isSafeUrl, sanitizeHref, SAFE_URL_PATTERN } from '~/shared/tiptap/urlPolicy'

describe('SAFE_URL_PATTERN', () => {
  it.each([
    ['https://example.com'],
    ['http://example.com'],
    ['mailto:user@example.com'],
    ['tel:+15551234567'],
    ['/relative/path'],
    ['#fragment'],
    ['HTTPS://example.com'],
    ['MAILTO:user@example.com'],
  ])('allows %s', (url) => {
    expect(SAFE_URL_PATTERN.test(url)).toBe(true)
  })

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['file:///etc/passwd'],
    ['ftp://example.com'],
    ['blob:https://example.com/abc'],
  ])('rejects %s', (url) => {
    expect(SAFE_URL_PATTERN.test(url)).toBe(false)
  })
})

describe('isSafeUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['mailto:user@example.com', true],
    ['tel:+15551234567', true],
    ['/relative/path', true],
    ['#fragment', true],
    ['HTTPS://example.com', true],
    // leading/trailing whitespace is trimmed before check
    ['  https://example.com  ', true],
    ['  mailto:user@example.com  ', true],
  ])('isSafeUrl(%s) → %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(document.cookie)', false],
    ['  javascript:alert(1)  ', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['vbscript:msgbox(1)', false],
    ['file:///etc/passwd', false],
    ['ftp://example.com', false],
    ['blob:https://example.com/abc', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('isSafeUrl(%s) → %s', (url, expected) => {
    expect(isSafeUrl(url as any)).toBe(expected)
  })
})

describe('sanitizeHref', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['http://example.com', 'http://example.com'],
    ['mailto:user@example.com', 'mailto:user@example.com'],
    ['tel:+15551234567', 'tel:+15551234567'],
    ['/relative/path', '/relative/path'],
    ['#fragment', '#fragment'],
    // trims surrounding whitespace for safe URLs
    ['  https://example.com  ', 'https://example.com'],
  ])('sanitizeHref(%s) → %s', (input, expected) => {
    expect(sanitizeHref(input)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)', ''],
    ['JaVaScRiPt:alert(1)', ''],
    ['data:text/html,<img>', ''],
    ['vbscript:msgbox(1)', ''],
    ['file:///etc/passwd', ''],
    ['  javascript:alert(1)  ', ''],
    ['', ''],
  ])('sanitizeHref(%s) → %s (empty string for disallowed)', (input, expected) => {
    expect(sanitizeHref(input)).toBe(expected)
  })
})
