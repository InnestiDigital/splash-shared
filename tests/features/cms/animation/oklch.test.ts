import { describe, it, expect } from 'vitest'
import { parseToOklch, lerpOklch, formatOklch } from '~/shared/features/cms/animation/oklch'

describe('parseToOklch', () => {
  it('parses 6-digit hex', () => {
    const result = parseToOklch('#ff0000')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBe(1)
    // Red in OKLCH should have high lightness and chroma
    expect(result!.l).toBeGreaterThan(0.4)
    expect(result!.c).toBeGreaterThan(0.1)
  })

  it('parses 3-digit hex', () => {
    const result = parseToOklch('#f00')
    expect(result).not.toBeNull()
    const full = parseToOklch('#ff0000')
    expect(result!.l).toBeCloseTo(full!.l, 4)
    expect(result!.c).toBeCloseTo(full!.c, 4)
    expect(result!.h).toBeCloseTo(full!.h, 4)
  })

  it('parses 8-digit hex with alpha', () => {
    const result = parseToOklch('#ff000080')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBeCloseTo(128 / 255, 2)
  })

  it('parses 4-digit hex with alpha', () => {
    const result = parseToOklch('#f008')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBeCloseTo(0x88 / 255, 2)
  })

  it('parses rgb()', () => {
    const result = parseToOklch('rgb(255, 0, 0)')
    expect(result).not.toBeNull()
    const hex = parseToOklch('#ff0000')
    expect(result!.l).toBeCloseTo(hex!.l, 4)
    expect(result!.c).toBeCloseTo(hex!.c, 4)
  })

  it('parses rgba()', () => {
    const result = parseToOklch('rgba(0, 128, 255, 0.5)')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBeCloseTo(0.5, 4)
  })

  it('parses hsl()', () => {
    const result = parseToOklch('hsl(0, 100%, 50%)')
    expect(result).not.toBeNull()
    // Pure red
    const hex = parseToOklch('#ff0000')
    expect(result!.l).toBeCloseTo(hex!.l, 2)
    expect(result!.c).toBeCloseTo(hex!.c, 2)
  })

  it('parses hsla()', () => {
    const result = parseToOklch('hsla(120, 100%, 50%, 0.8)')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBeCloseTo(0.8, 4)
  })

  it('parses oklch() directly', () => {
    const result = parseToOklch('oklch(0.7 0.15 150)')
    expect(result).not.toBeNull()
    expect(result!.l).toBeCloseTo(0.7, 4)
    expect(result!.c).toBeCloseTo(0.15, 4)
    expect(result!.h).toBeCloseTo(150, 4)
    expect(result!.alpha).toBe(1)
  })

  it('parses oklch() with alpha', () => {
    const result = parseToOklch('oklch(0.7 0.15 150 / 0.5)')
    expect(result).not.toBeNull()
    expect(result!.alpha).toBeCloseTo(0.5, 4)
  })

  it('returns null on invalid input', () => {
    expect(parseToOklch('')).toBeNull()
    expect(parseToOklch('not-a-color')).toBeNull()
    expect(parseToOklch('rgb()')).toBeNull()
    expect(parseToOklch('#xyz')).toBeNull()
  })

  it('black is near-zero lightness and chroma', () => {
    const result = parseToOklch('#000000')
    expect(result).not.toBeNull()
    expect(result!.l).toBeCloseTo(0, 2)
    expect(result!.c).toBeCloseTo(0, 2)
  })

  it('white is high lightness, near-zero chroma', () => {
    const result = parseToOklch('#ffffff')
    expect(result).not.toBeNull()
    expect(result!.l).toBeCloseTo(1, 2)
    expect(result!.c).toBeCloseTo(0, 2)
  })
})

describe('lerpOklch', () => {
  const red = { l: 0.6, c: 0.25, h: 29, alpha: 1 }
  const blue = { l: 0.4, c: 0.3, h: 264, alpha: 0.5 }

  it('returns a at t=0', () => {
    const result = lerpOklch(red, blue, 0)
    expect(result.l).toBe(red.l)
    expect(result.c).toBe(red.c)
    expect(result.h).toBe(red.h)
    expect(result.alpha).toBe(red.alpha)
  })

  it('returns b at t=1', () => {
    const result = lerpOklch(red, blue, 1)
    expect(result.l).toBe(blue.l)
    expect(result.c).toBe(blue.c)
    expect(result.h).toBe(blue.h)
    expect(result.alpha).toBe(blue.alpha)
  })

  it('interpolates at midpoint', () => {
    const result = lerpOklch(red, blue, 0.5)
    expect(result.l).toBeCloseTo(0.5, 4)
    expect(result.c).toBeCloseTo(0.275, 4)
    expect(result.alpha).toBeCloseTo(0.75, 4)
    // h is lerped linearly
    expect(result.h).toBeCloseTo((29 + 264) / 2, 4)
  })
})

describe('formatOklch', () => {
  it('formats without alpha when alpha=1', () => {
    const result = formatOklch({ l: 0.7, c: 0.15, h: 150, alpha: 1 })
    expect(result).toBe('oklch(0.7 0.15 150)')
  })

  it('formats with alpha when alpha<1', () => {
    const result = formatOklch({ l: 0.7, c: 0.15, h: 150, alpha: 0.5 })
    expect(result).toBe('oklch(0.7 0.15 150 / 0.5)')
  })

  it('rounds values to reasonable precision', () => {
    const result = formatOklch({ l: 0.123456789, c: 0.987654321, h: 123.456789, alpha: 1 })
    // Should not produce excessively long decimals
    expect(result.length).toBeLessThan(50)
  })
})
