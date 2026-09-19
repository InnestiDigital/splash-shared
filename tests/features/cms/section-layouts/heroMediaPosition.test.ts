import { describe, it, expect } from 'vitest'
import {
  resolveHeroMediaPosition,
  heroViewportFor,
  heroMediaPositionCss,
  HERO_MEDIA_POSITIONS,
} from '~/shared/features/cms/section-layouts/heroMediaPosition'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

describe('heroViewportFor', () => {
  it('classifies widths against the shared breakpoints', () => {
    expect(heroViewportFor(375)).toBe('mobile')
    expect(heroViewportFor(BREAKPOINTS.md)).toBe('mobile') // inclusive lower bound
    expect(heroViewportFor(BREAKPOINTS.md + 1)).toBe('tablet')
    expect(heroViewportFor(BREAKPOINTS.lg - 1)).toBe('tablet')
    expect(heroViewportFor(BREAKPOINTS.lg)).toBe('desktop')
    expect(heroViewportFor(1440)).toBe('desktop')
  })
})

describe('resolveHeroMediaPosition', () => {
  it('defaults to center everywhere when unset', () => {
    for (const vp of ['desktop', 'tablet', 'mobile'] as const) {
      expect(resolveHeroMediaPosition(undefined, vp)).toBe('center')
      expect(resolveHeroMediaPosition({}, vp)).toBe('center')
    }
  })

  it('uses the base value on desktop', () => {
    expect(resolveHeroMediaPosition({ mediaPosition: 'top' }, 'desktop')).toBe('top')
  })

  it('cascades tablet -> base', () => {
    expect(resolveHeroMediaPosition({ mediaPosition: 'top' }, 'tablet')).toBe('top')
    expect(resolveHeroMediaPosition({ mediaPosition: 'top', mediaPositionTablet: 'bottom' }, 'tablet')).toBe('bottom')
  })

  it('cascades mobile -> tablet -> base', () => {
    expect(resolveHeroMediaPosition({ mediaPosition: 'top' }, 'mobile')).toBe('top')
    expect(resolveHeroMediaPosition({ mediaPosition: 'top', mediaPositionTablet: 'left' }, 'mobile')).toBe('left')
    expect(resolveHeroMediaPosition({ mediaPosition: 'top', mediaPositionTablet: 'left', mediaPositionMobile: 'bottom-right' }, 'mobile')).toBe('bottom-right')
  })

  it("treats 'inherit' / unknown overrides as fall-through", () => {
    expect(resolveHeroMediaPosition({ mediaPosition: 'top', mediaPositionMobile: 'inherit' }, 'mobile')).toBe('top')
    expect(resolveHeroMediaPosition({ mediaPosition: 'top', mediaPositionMobile: 'garbage' }, 'mobile')).toBe('top')
  })
})

describe('heroMediaPositionCss', () => {
  it('maps every token to a valid CSS position string', () => {
    for (const pos of HERO_MEDIA_POSITIONS) {
      const css = heroMediaPositionCss(pos)
      expect(typeof css).toBe('string')
      expect(css.length).toBeGreaterThan(0)
    }
  })

  it('keeps legacy single-keyword tokens render-equivalent', () => {
    expect(heroMediaPositionCss('center')).toBe('center')
    expect(heroMediaPositionCss('top')).toBe('center top')
    expect(heroMediaPositionCss('bottom')).toBe('center bottom')
  })
})
