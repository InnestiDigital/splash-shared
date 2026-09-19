import { describe, it, expect } from 'vitest'
import { escapeCssString, isSafeFontUrl } from '~/shared/utils/cssEscape'

// ---------------------------------------------------------------------------
// escapeCssString
// ---------------------------------------------------------------------------

describe('escapeCssString', () => {
  it('returns safe ASCII names unchanged', () => {
    expect(escapeCssString('Helvetica Neue')).toBe('Helvetica Neue')
    expect(escapeCssString('Source Sans 3')).toBe('Source Sans 3')
    expect(escapeCssString('Noto Sans CJK JP')).toBe('Noto Sans CJK JP')
  })

  it('escapes backslash', () => {
    expect(escapeCssString('A\\B')).toBe('A\\\\B')
  })

  it('escapes single quote', () => {
    expect(escapeCssString("O'Brien")).toBe("O\\'Brien")
  })

  it('escapes newline (\\n) as CSS unicode escape', () => {
    const result = escapeCssString('Evil\nFont')
    expect(result).not.toContain('\n')
    expect(result).toMatch(/\\00000a /i)
  })

  it('escapes carriage return (\\r)', () => {
    const result = escapeCssString('Evil\rFont')
    expect(result).not.toContain('\r')
    expect(result).toMatch(/\\00000d /i)
  })

  it('escapes tab (\\t)', () => {
    const result = escapeCssString('Tab\tFont')
    expect(result).not.toContain('\t')
    expect(result).toMatch(/\\000009 /i)
  })

  it('escapes null byte (\\x00)', () => {
    const result = escapeCssString('Null\x00Font')
    expect(result).not.toContain('\x00')
    expect(result).toMatch(/\\000000 /i)
  })

  it('escapes DEL (\\x7f)', () => {
    const result = escapeCssString('Del\x7fFont')
    expect(result).not.toContain('\x7f')
    expect(result).toMatch(/\\00007f /i)
  })

  it('escapes U+2028 LINE SEPARATOR', () => {
    const result = escapeCssString('Line\u2028Sep')
    expect(result).not.toContain('\u2028')
    expect(result).toMatch(/\\002028 /i)
  })

  it('escapes U+2029 PARAGRAPH SEPARATOR', () => {
    const result = escapeCssString('Para\u2029Sep')
    expect(result).not.toContain('\u2029')
    expect(result).toMatch(/\\002029 /i)
  })

  it('escapes multiple dangerous chars in one string', () => {
    // A hostile name attempting to break out of @font-face and inject a rule.
    const hostile = "x'}\nbody{display:none}@font-face{font-family:'"
    const escaped = escapeCssString(hostile)
    // Single quote must be backslash-escaped, not appear raw.
    expect(escaped).not.toMatch(/(^|[^\\])'/)
    // Literal newline must not appear.
    expect(escaped).not.toContain('\n')
    // Specific escapes must be present.
    expect(escaped).toContain("\\'")    // escaped quote
    expect(escaped).toMatch(/\\00000a /i) // escaped newline
  })

  it('preserves Unicode letters (accented chars, CJK)', () => {
    expect(escapeCssString('Hébo')).toBe('Hébo')
    expect(escapeCssString('日本語')).toBe('日本語')
    expect(escapeCssString('Ελληνικά')).toBe('Ελληνικά')
  })
})

// ---------------------------------------------------------------------------
// isSafeFontUrl
// ---------------------------------------------------------------------------

describe('isSafeFontUrl', () => {
  // --- uploaded font URLs ---
  it('accepts valid uploaded-font API URLs (uuid/uuid form)', () => {
    expect(isSafeFontUrl('/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002')).toBe(true)
  })

  it('accepts UUID-format segments with mixed case', () => {
    expect(isSafeFontUrl('/api/fonts/AABBCCDD-EEFF-0011-2233-445566778899/aabbccdd-eeff-0011-2233-445566778899')).toBe(true)
  })

  it('rejects uploaded URL with trailing path segment', () => {
    expect(isSafeFontUrl('/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/extra')).toBe(false)
  })

  it('rejects URL with non-UUID font-id segment', () => {
    expect(isSafeFontUrl('/api/fonts/site-1/not-a-uuid')).toBe(false)
  })

  // --- theme-bundled font URLs ---
  it('accepts theme font paths', () => {
    expect(isSafeFontUrl('/fonts/heebo-regular.woff2')).toBe(true)
    expect(isSafeFontUrl('/fonts/Fraunces-VF.woff2')).toBe(true)
    expect(isSafeFontUrl('/fonts/sub/dir/font.woff')).toBe(true)
  })

  it('rejects theme paths with dangerous characters', () => {
    expect(isSafeFontUrl("/fonts/evil').woff2")).toBe(false)
    expect(isSafeFontUrl('/fonts/evil\n.woff2')).toBe(false)
    expect(isSafeFontUrl('/fonts/evil).woff2')).toBe(false)
  })

  // --- outright dangerous values ---
  it('rejects absolute http URLs', () => {
    expect(isSafeFontUrl('https://evil.example.com/hack.woff2')).toBe(false)
  })

  it('rejects data URIs', () => {
    expect(isSafeFontUrl('data:font/woff2;base64,AAAA')).toBe(false)
  })

  it('rejects url() injection payload', () => {
    expect(isSafeFontUrl("'); body{display:none}; @font-face{src:url('")).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeFontUrl('')).toBe(false)
  })
})
