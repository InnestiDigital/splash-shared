import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FOCAL_POINT,
  FOCAL_POINT_TOKENS,
  focalPercentagesToObjectPosition,
  focalPointToObjectPosition,
  isFocalPointToken,
  mediaArtDirectionStyle,
  resolveAspectRatio,
  resolveFocalPoint,
} from '~/shared/features/cms/media/artDirection'

describe('resolveFocalPoint', () => {
  it.each([
    ['top-left', 0, 0],
    ['top', 50, 0],
    ['top-right', 100, 0],
    ['left', 0, 50],
    ['center', 50, 50],
    ['right', 100, 50],
    ['bottom-left', 0, 100],
    ['bottom', 50, 100],
    ['bottom-right', 100, 100],
  ])('maps %s to %i%% %i%%', (token, x, y) => {
    expect(resolveFocalPoint(token)).toEqual({ x, y })
  })

  it('covers every declared token', () => {
    expect(FOCAL_POINT_TOKENS).toHaveLength(9)
    for (const token of FOCAL_POINT_TOKENS) {
      expect(isFocalPointToken(token)).toBe(true)
    }
  })

  // Settings arrive from stored JSON, so the resolver is the last line of
  // defence against a value the schema no longer offers.
  it.each([undefined, null, '', 'middle', 42, {}, []])(
    'falls back to centre for %p',
    (value) => {
      expect(resolveFocalPoint(value)).toEqual({ x: 50, y: 50 })
      expect(isFocalPointToken(value)).toBe(false)
    },
  )

  it('defaults to the token that means the native crop', () => {
    expect(resolveFocalPoint(DEFAULT_FOCAL_POINT)).toEqual({ x: 50, y: 50 })
  })
})

describe('focalPointToObjectPosition', () => {
  it('emits a CSS object-position value', () => {
    expect(focalPointToObjectPosition('bottom-right')).toBe('100% 100%')
    expect(focalPointToObjectPosition('top')).toBe('50% 0%')
  })

  it('emits the centre crop for unknown input', () => {
    expect(focalPointToObjectPosition('nope')).toBe('50% 50%')
  })
})

describe('focalPercentagesToObjectPosition', () => {
  it('carries the numeric tier through the same expression', () => {
    expect(focalPercentagesToObjectPosition({ x: 25, y: 75 })).toBe('25% 75%')
  })

  it('centres a missing or partial point', () => {
    expect(focalPercentagesToObjectPosition(null)).toBe('50% 50%')
    expect(focalPercentagesToObjectPosition({ x: 10 })).toBe('10% 50%')
  })

  // The bridge the two-tier model rests on: an enum token and the numeric
  // point it names must produce the same CSS.
  it('agrees with the enum tier', () => {
    for (const token of FOCAL_POINT_TOKENS) {
      expect(focalPercentagesToObjectPosition(resolveFocalPoint(token)))
        .toBe(focalPointToObjectPosition(token))
    }
  })
})

describe('resolveAspectRatio', () => {
  it('normalizes the colon convention', () => {
    expect(resolveAspectRatio('16:9')).toBe('16 / 9')
    expect(resolveAspectRatio('4:3')).toBe('4 / 3')
    expect(resolveAspectRatio('3:1')).toBe('3 / 1')
    expect(resolveAspectRatio('21:9')).toBe('21 / 9')
  })

  // CanvasImage's stored vocabulary. The values are load-bearing: `portrait`
  // has always painted 4/5 and `classic` 4/3, and re-spelling either would
  // change existing pages.
  it('preserves the keyword convention verbatim', () => {
    expect(resolveAspectRatio('square')).toBe('1 / 1')
    expect(resolveAspectRatio('portrait')).toBe('4 / 5')
    expect(resolveAspectRatio('classic')).toBe('4 / 3')
    expect(resolveAspectRatio('landscape')).toBe('3 / 2')
    expect(resolveAspectRatio('wide')).toBe('16 / 9')
  })

  it('passes CSS-native values through, normalizing spacing', () => {
    expect(resolveAspectRatio('16 / 9')).toBe('16 / 9')
    expect(resolveAspectRatio('16/9')).toBe('16 / 9')
  })

  it('tolerates surrounding whitespace', () => {
    expect(resolveAspectRatio('  4:3  ')).toBe('4 / 3')
  })

  it('accepts decimal ratios', () => {
    expect(resolveAspectRatio('1.91:1')).toBe('1.91 / 1')
  })

  it('returns null for natural-ratio and unusable input', () => {
    for (const value of ['auto', '', '   ', 'banner', '16:', ':9', '4:3:2', undefined, null, 9, {}]) {
      expect(resolveAspectRatio(value)).toBeNull()
    }
  })
})

describe('mediaArtDirectionStyle', () => {
  it('pairs fit with crop position', () => {
    expect(mediaArtDirectionStyle({ objectFit: 'contain', focalPoint: 'top' }))
      .toEqual({ objectFit: 'contain', objectPosition: '50% 0%' })
  })

  it('defaults to filling the frame from its centre', () => {
    expect(mediaArtDirectionStyle({}))
      .toEqual({ objectFit: 'cover', objectPosition: '50% 50%' })
  })

  // `contain` is the only alternative the fragment offers; anything else is a
  // stale value and must not reach CSS.
  it('rejects a fit value outside the vocabulary', () => {
    expect(mediaArtDirectionStyle({ objectFit: 'fill' }).objectFit).toBe('cover')
  })
})
