import { describe, it, expect } from 'vitest'
import { DEFAULT_KNOBS, DEFAULT_EMPHASIS_SCALE } from '~/shared/features/cms/composition/types'
import type {
  CompositionItem, CompositionMediaRef, LayoutGroup, FloatingPlacement,
} from '~/shared/features/cms/composition/types'

describe('composition types', () => {
  it('DEFAULT_KNOBS has all fields', () => {
    expect(DEFAULT_KNOBS.dominance).toBe('balanced')
    expect(DEFAULT_KNOBS.overlap).toBe('normal')
    expect(DEFAULT_KNOBS.alignment).toBe('balanced')
    expect(DEFAULT_KNOBS.density).toBe('normal')
  })

  it('DEFAULT_EMPHASIS_SCALE orders sm < md < lg', () => {
    expect(DEFAULT_EMPHASIS_SCALE.sm).toBeLessThan(DEFAULT_EMPHASIS_SCALE.md)
    expect(DEFAULT_EMPHASIS_SCALE.md).toBeLessThan(DEFAULT_EMPHASIS_SCALE.lg)
  })

  it('CompositionMediaRef supports minimal and full payloads', () => {
    const minimal: CompositionMediaRef = { src: '/img.jpg' }
    expect(minimal.focalPoint).toBeUndefined()

    const full: CompositionMediaRef = {
      src: '/img.jpg',
      alt: { 'en-US': 'Alt' },
      focalPoint: { x: 0.5, y: 0.3 },
      aspectHint: 4 / 3,
    }
    expect(full.focalPoint!.x).toBe(0.5)
  })

  it('LayoutGroup requires roles array', () => {
    const group: LayoutGroup = {
      id: 'text-stack',
      anchor: 'canvas',
      region: 'left',
      baseSize: { w: 0.45 },
      roles: ['headline', 'body'],
      layer: 2,
      overflowPolicy: 'clamp',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    }
    expect(group.roles).toHaveLength(2)
  })

  it('FloatingPlacement anchors to a group, not canvas', () => {
    const floater: FloatingPlacement = {
      anchor: 'media-stack',
      region: 'bottom-left',
      sizeMode: 'intrinsic-text',
      baseSize: { w: 0.35 },
      overlap: { x: 0.15, y: 0.1 },
      layer: 2,
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
      overflowPolicy: 'clamp',
    }
    expect(floater.anchor).toBe('media-stack')
  })
})
