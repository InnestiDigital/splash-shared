import { describe, it, expect } from 'vitest'
import { computeScale } from '~/shared/features/layout/computeScale'
import type { LayoutFrameConfig } from '~/shared/types/layout'

const baseFrame: LayoutFrameConfig = {
  containerMode: 'content',
  insetX: 'md',
  overflowX: 'visible',
  responsiveMode: 'scale',
  designWidth: 1440,
  minScale: 0.25,
  maxScale: 1,
  scaleOrigin: 'top-center',
}

describe('computeScale', () => {
  it('returns 1 when viewport equals designWidth', () => {
    expect(computeScale(1440, baseFrame)).toBe(1)
  })

  it('returns viewport / designWidth for smaller viewports', () => {
    expect(computeScale(720, baseFrame)).toBe(0.5)
  })

  it('clamps to maxScale when viewport exceeds designWidth', () => {
    expect(computeScale(1920, baseFrame)).toBe(1)
  })

  it('clamps to minScale when viewport is very small', () => {
    expect(computeScale(100, baseFrame)).toBe(0.25)
  })

  it('uses default designWidth (1440) when omitted', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, designWidth: undefined }
    expect(computeScale(720, frame)).toBe(0.5)
  })

  it('uses default minScale (0.25) when omitted', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, minScale: undefined }
    expect(computeScale(100, frame)).toBe(0.25)
  })

  it('uses default maxScale (1) when omitted', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, maxScale: undefined }
    expect(computeScale(2880, frame)).toBe(1)
  })

  it('returns 1 when designWidth is non-positive (safe fallback)', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, designWidth: 0 }
    expect(computeScale(720, frame)).toBe(1)
  })

  it('returns 1 when responsiveMode is not "scale" (no-op)', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, responsiveMode: 'breakpoint' }
    expect(computeScale(720, frame)).toBe(1)
  })

  it('handles inverted min/max by preferring maxScale', () => {
    const frame: LayoutFrameConfig = { ...baseFrame, minScale: 1.5, maxScale: 1 }
    expect(computeScale(720, frame)).toBe(1)
  })
})
