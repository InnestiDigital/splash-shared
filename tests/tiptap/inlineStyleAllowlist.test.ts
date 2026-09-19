import { describe, it, expect } from 'vitest'
import {
  validateColor,
  validateFontWeight,
  validateFontSize,
  ALLOWED_FONT_SIZES,
} from '~/shared/tiptap/inlineStyleAllowlist'

describe('validateColor', () => {
  it.each([
    ['#fff'], ['#FFF'], ['#ffff'], ['#ffffff'], ['#FFFFFF'], ['#ffffffaa'],
    ['rgb(0, 0, 0)'], ['rgb(255,255,255)'],
    ['rgba(0,0,0,0.5)'], ['rgba(255, 255, 255, 1)'],
    ['hsl(120, 50%, 50%)'], ['hsla(120, 50%, 50%, 0.5)'],
  ])('accepts valid color: %s', (input) => {
    expect(validateColor(input)).toBe(input.trim())
  })

  it.each([
    ['javascript:alert(1)'],
    ['url(http://evil)'],
    ['expression(alert(1))'],
    ['var(--leak)'],
    ['#zzz'],
    ['#12345'], // 5 chars not allowed
    ['rgb(300, 0, 0)'], // out of range
    ['rgb(0, 0)'], // wrong arity
    ['red'], // named color disallowed (keep narrow Phase 1)
    [''],
    [' '],
    ['#fff /* comment */'],
    ['rgb(0,0,0); background: url(x)'],
  ])('rejects invalid color: %s', (input) => {
    expect(validateColor(input)).toBeNull()
  })
})

describe('validateFontWeight', () => {
  it.each([['100'], ['200'], ['300'], ['400'], ['500'], ['600'], ['700'], ['800'], ['900']])(
    'accepts valid weight: %s',
    (w) => {
      expect(validateFontWeight(w)).toBe(w)
    },
  )

  it.each([['0'], ['50'], ['450'], ['1000'], ['bold'], ['normal'], [''], ['400 !important']])(
    'rejects invalid weight: %s',
    (w) => {
      expect(validateFontWeight(w)).toBeNull()
    },
  )
})

describe('validateFontSize', () => {
  it('accepts every allowed size', () => {
    for (const size of ALLOWED_FONT_SIZES) {
      expect(validateFontSize(size)).toBe(size)
    }
  })

  it.each([
    ['12px'], ['1em'], ['100%'], ['calc(1rem + 1px)'], ['var(--x)'], ['clamp(1rem, 2vw, 3rem)'], [''], ['1rem !important'],
  ])('rejects invalid size: %s', (s) => {
    expect(validateFontSize(s)).toBeNull()
  })
})
