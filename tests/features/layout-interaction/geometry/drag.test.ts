import { describe, it, expect } from 'vitest'
import { computeDragPatch } from '../../../../../shared/features/layout-interaction/geometry/drag'

describe('computeDragPatch', () => {
  it('produces position patch from pixel delta and canvas size', () => {
    const patch = computeDragPatch({
      id: 'a',
      startItem: { positionX: 50, positionY: 50 },
      deltaPx: { x: 50, y: 50 },
      canvasRect: { width: 500, height: 500 },
    })
    expect(patch).toEqual({ id: 'a', positionX: 60, positionY: 60 })
  })

  it('clamps at soft bounds', () => {
    const patch = computeDragPatch({
      id: 'a',
      startItem: { positionX: 50, positionY: 50 },
      deltaPx: { x: 10000, y: -10000 },
      canvasRect: { width: 500, height: 500 },
    })
    expect(patch.positionX).toBe(125)
    expect(patch.positionY).toBe(-25)
  })
})
