import { describe, it, expect } from 'vitest'
import { computeRotatePatch } from '../../../../../shared/features/layout-interaction/geometry/rotate'

describe('computeRotatePatch', () => {
  it('adds angle delta from start pointer to current pointer, around center', () => {
    // Center at (200,200) in px. Start pointer directly above center (200,100).
    // Move to directly right of center (300,200). Delta = +90°.
    const patch = computeRotatePatch({
      id: 'a',
      startItem: { rotation: 0 },
      centerPx: { x: 200, y: 200 },
      startPointerPx: { x: 200, y: 100 },
      pointerPxNow: { x: 300, y: 200 },
    })
    expect(patch.rotation).toBeCloseTo(90, 0)
  })

  it('accumulates from startItem.rotation', () => {
    const patch = computeRotatePatch({
      id: 'a',
      startItem: { rotation: 45 },
      centerPx: { x: 200, y: 200 },
      startPointerPx: { x: 200, y: 100 },
      pointerPxNow: { x: 300, y: 200 },
    })
    expect(patch.rotation).toBeCloseTo(135, 0)
  })
})
