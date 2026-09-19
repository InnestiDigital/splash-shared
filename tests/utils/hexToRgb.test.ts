import { describe, it, expect } from 'vitest'
import { hexToRgb } from '~/shared/utils/hexToRgb'

describe('hexToRgb', () => {
  it('parses 6-digit hex with a leading #', () => {
    expect(hexToRgb('#1B8AB7')).toBe('27, 138, 183')
  })

  it('parses 6-digit hex without a leading #', () => {
    expect(hexToRgb('000000')).toBe('0, 0, 0')
    expect(hexToRgb('ffffff')).toBe('255, 255, 255')
  })

  it('expands 3-digit shorthand per nibble', () => {
    expect(hexToRgb('#fff')).toBe('255, 255, 255')
    expect(hexToRgb('#0a0')).toBe('0, 170, 0')
  })

  it('drops the alpha nibble of 4-digit shorthand', () => {
    expect(hexToRgb('#f008')).toBe('255, 0, 0')
  })

  it('drops the alpha byte of 8-digit hex', () => {
    expect(hexToRgb('#ff000080')).toBe('255, 0, 0')
  })

  it('is case-insensitive', () => {
    expect(hexToRgb('#AbCdEf')).toBe('171, 205, 239')
  })

  it('falls back to black for malformed input', () => {
    expect(hexToRgb('#gggggg')).toBe('0, 0, 0')
    expect(hexToRgb('#12345')).toBe('0, 0, 0') // invalid length
    expect(hexToRgb('not-a-color')).toBe('0, 0, 0')
  })

  it('falls back to black for empty or nullish input', () => {
    expect(hexToRgb('')).toBe('0, 0, 0')
    expect(hexToRgb(null)).toBe('0, 0, 0')
    expect(hexToRgb(undefined)).toBe('0, 0, 0')
  })
})
