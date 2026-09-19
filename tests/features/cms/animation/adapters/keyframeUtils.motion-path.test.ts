import { describe, it, expect } from 'vitest'
import { toWAAPIKeyframes } from '~/shared/features/cms/animation/adapters/keyframeUtils'
import type { Keyframe } from '~/shared/types/animation'

describe('toWAAPIKeyframes — motion path fields', () => {
  it('passes offsetPath through', () => {
    const input: Keyframe[] = [
      { offset: 0, offsetPath: "path('M 0 0 L 100 0')" },
      { offset: 1, offsetPath: "path('M 0 0 L 100 0')" },
    ]
    const out = toWAAPIKeyframes(input)
    expect((out[0] as any).offsetPath).toBe("path('M 0 0 L 100 0')")
    expect((out[1] as any).offsetPath).toBe("path('M 0 0 L 100 0')")
  })

  it('passes offsetDistance, offsetRotate, offsetAnchor through', () => {
    const input: Keyframe[] = [
      { offset: 0, offsetDistance: '0%', offsetRotate: 'auto', offsetAnchor: 'auto' },
      { offset: 1, offsetDistance: '100%', offsetRotate: 'auto', offsetAnchor: 'auto' },
    ]
    const out = toWAAPIKeyframes(input)
    expect((out[0] as any).offsetDistance).toBe('0%')
    expect((out[0] as any).offsetRotate).toBe('auto')
    expect((out[0] as any).offsetAnchor).toBe('auto')
    expect((out[1] as any).offsetDistance).toBe('100%')
  })

  it('omits offset-* fields when undefined (backward-compat)', () => {
    const input: Keyframe[] = [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ]
    const out = toWAAPIKeyframes(input)
    expect((out[0] as any).offsetPath).toBeUndefined()
    expect((out[0] as any).offsetDistance).toBeUndefined()
  })
})
