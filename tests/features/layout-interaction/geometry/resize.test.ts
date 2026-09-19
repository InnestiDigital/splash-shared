import { describe, it, expect } from 'vitest'
import { computeResizePatch } from '../../../../../shared/features/layout-interaction/geometry/resize'

// Item centered (50,50), w/h 20 → NW=(40,40), SE=(60,60).
// All coordinates in %.

describe('computeResizePatch', () => {
  it('SE handle: opposite corner NW stays pinned', () => {
    const patch = computeResizePatch({
      id: 'a', kind: 'resize-se',
      startItem: { positionX: 50, positionY: 50, width: 20, height: 20 },
      pointerPctNow: { x: 70, y: 70 },
    })
    expect(patch.width).toBeCloseTo(30, 5)
    expect(patch.height).toBeCloseTo(30, 5)
    expect(patch.positionX).toBeCloseTo(55, 5)   // NW stays at 40
    expect(patch.positionY).toBeCloseTo(55, 5)
  })

  it('NW handle: opposite corner SE stays pinned', () => {
    const patch = computeResizePatch({
      id: 'a', kind: 'resize-nw',
      startItem: { positionX: 50, positionY: 50, width: 20, height: 20 },
      pointerPctNow: { x: 30, y: 30 },
    })
    expect(patch.width).toBeCloseTo(30, 5)
    expect(patch.height).toBeCloseTo(30, 5)
    expect(patch.positionX).toBeCloseTo(45, 5)   // SE stays at 60
    expect(patch.positionY).toBeCloseTo(45, 5)
  })

  it('NE handle pins SW corner', () => {
    const patch = computeResizePatch({
      id: 'a', kind: 'resize-ne',
      startItem: { positionX: 50, positionY: 50, width: 20, height: 20 },
      pointerPctNow: { x: 70, y: 30 },
    })
    expect(patch.width).toBeCloseTo(30, 5)
    expect(patch.height).toBeCloseTo(30, 5)
  })

  it('SW handle pins NE corner', () => {
    const patch = computeResizePatch({
      id: 'a', kind: 'resize-sw',
      startItem: { positionX: 50, positionY: 50, width: 20, height: 20 },
      pointerPctNow: { x: 30, y: 70 },
    })
    expect(patch.width).toBeCloseTo(30, 5)
    expect(patch.height).toBeCloseTo(30, 5)
  })

  it('clamps at min size, never inverts', () => {
    const patch = computeResizePatch({
      id: 'a', kind: 'resize-se',
      startItem: { positionX: 50, positionY: 50, width: 20, height: 20 },
      pointerPctNow: { x: 0, y: 0 },  // way past NW
    })
    expect(patch.width).toBeGreaterThanOrEqual(5)
    expect(patch.height).toBeGreaterThanOrEqual(5)
  })
})
