// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  computeZoneOrder,
  interpolateLayout,
  computeBackgroundStyle,
  resolveZoneStyle,
} from '~/shared/composables/useHeaderLayout'
import type {
  HeaderLayoutState,
  CompactBackgroundConfig,
  ZoneConfig,
  ZoneStateConfig,
} from '~/shared/types/headerZone'
import { DEFAULT_ZONE_CONFIG } from '~/shared/types/headerZone'

describe('computeZoneOrder', () => {
  it('returns correct order for center logo', () => {
    const order = computeZoneOrder('center')
    expect(order).toEqual({ nav: 1, logo: 2, actions: 3 })
  })

  it('returns correct order for left logo', () => {
    const order = computeZoneOrder('left')
    expect(order).toEqual({ logo: 1, nav: 2, actions: 3 })
  })

  it('returns correct order for right logo', () => {
    const order = computeZoneOrder('right')
    expect(order).toEqual({ nav: 1, actions: 2, logo: 3 })
  })
})

describe('interpolateLayout', () => {
  const expanded: HeaderLayoutState = { gap: 24, padding: 32, justify: 'space-between', contentWidthMode: 'full' }
  const compact: HeaderLayoutState = { gap: 12, padding: 16, justify: 'center', contentWidthMode: 'fit' }

  it('returns expanded values at progress 0', () => {
    const result = interpolateLayout(expanded, compact, 0)
    expect(result.gap).toBe(24)
    expect(result.padding).toBe(32)
  })

  it('returns compact values at progress 1', () => {
    const result = interpolateLayout(expanded, compact, 1)
    expect(result.gap).toBe(12)
    expect(result.padding).toBe(16)
  })

  it('interpolates numeric values at midpoint', () => {
    const result = interpolateLayout(expanded, compact, 0.5)
    expect(result.gap).toBe(18)
    expect(result.padding).toBe(24)
  })

  it('keeps expanded justify during transition (no snapping)', () => {
    const result = interpolateLayout(expanded, compact, 0.7)
    expect(result.justify).toBe('space-between')
  })

  it('uses compact justify at progress 1', () => {
    const result = interpolateLayout(expanded, compact, 1)
    expect(result.justify).toBe('center')
  })

  it('switches contentWidthMode only at boundaries', () => {
    expect(interpolateLayout(expanded, compact, 0).contentWidthMode).toBe('full')
    expect(interpolateLayout(expanded, compact, 0.5).contentWidthMode).toBe('full')
    expect(interpolateLayout(expanded, compact, 1).contentWidthMode).toBe('fit')
  })
})

describe('computeBackgroundStyle', () => {
  it('returns full-width pill style at progress 0 with no maxWidth', () => {
    const config: CompactBackgroundConfig = { mode: 'pill', borderRadius: 24, targetOpacity: 0.6, insetPadding: 12 }
    const style = computeBackgroundStyle(config, 0, 800)
    expect(style.borderRadius).toBe('0px')
    expect(style.opacity).toBe(1)
    expect(style.maxWidth).toBeUndefined()
  })

  it('returns pill style at progress 1', () => {
    const config: CompactBackgroundConfig = { mode: 'pill', borderRadius: 24, targetOpacity: 0.6, insetPadding: 12 }
    const style = computeBackgroundStyle(config, 1, 400)
    expect(style.borderRadius).toBe('24px')
  })

  it('returns fade style with target opacity at progress 1', () => {
    const config: CompactBackgroundConfig = { mode: 'fade', borderRadius: 0, targetOpacity: 0.3, insetPadding: 0 }
    const style = computeBackgroundStyle(config, 1, 800)
    expect(style.opacity).toBeCloseTo(0.3)
  })
})

describe('resolveZoneStyle', () => {
  it('returns expanded config at progress 0', () => {
    const config: ZoneConfig = {
      ...DEFAULT_ZONE_CONFIG,
      expanded: { scale: 1.4, offsetX: 0, offsetY: 0, opacity: 1 },
      compact: { scale: 1, offsetX: 10, offsetY: 0, opacity: 0.8 },
    }
    const style = resolveZoneStyle(config, 0, true, true)
    expect(style.opacity).toBe(1)
    expect(style.transform).toContain('scale(1.4)')
    expect(style.pointerEvents).toBe('auto')
  })

  it('returns compact config at progress 1', () => {
    const config: ZoneConfig = {
      ...DEFAULT_ZONE_CONFIG,
      expanded: { scale: 1.4, offsetX: 0, offsetY: 0, opacity: 1 },
      compact: { scale: 1, offsetX: 10, offsetY: 0, opacity: 0.8 },
    }
    const style = resolveZoneStyle(config, 1, true, true)
    expect(style.opacity).toBeCloseTo(0.8)
    expect(style.transform).toContain('scale(1)')
    expect(style.transform).toContain('translate(10px, 0px)')
  })

  it('sets pointer-events none when zone is not visible in target state', () => {
    const config: ZoneConfig = {
      ...DEFAULT_ZONE_CONFIG,
      visibleInCompact: false,
    }
    const style = resolveZoneStyle(config, 1, true, false)
    expect(style.pointerEvents).toBe('none')
    expect(style.opacity).toBe(0)
  })

  it('handles hidden→visible transition', () => {
    const config: ZoneConfig = {
      ...DEFAULT_ZONE_CONFIG,
      visibleInExpanded: false,
      visibleInCompact: true,
    }
    const style = resolveZoneStyle(config, 0.5, false, true)
    expect(style.opacity).toBeGreaterThan(0)
    expect(style.pointerEvents).toBe('auto')
  })
})
