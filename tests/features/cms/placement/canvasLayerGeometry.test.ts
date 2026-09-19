import { describe, expect, it } from 'vitest'
import {
  canvasGeometryFromItem,
  canvasLayerItem,
  defaultCanvasBlockGeometry,
} from '~/shared/features/cms/placement/canvasLayerGeometry'

describe('canvas layer geometry', () => {
  it('cascades unpositioned blocks without changing earlier geometry as count changes', () => {
    const first = defaultCanvasBlockGeometry(0, 1)
    const firstAfterAdds = defaultCanvasBlockGeometry(0, 7)
    const second = defaultCanvasBlockGeometry(1, 7)

    expect(first).toMatchObject({ x: 50, y: 50, width: 60, height: 36 })
    expect(firstAfterAdds).toEqual(first)
    expect(second).toMatchObject({ x: 54, y: 54, width: 60, height: 36 })
  })

  it('normalizes partial and out-of-band authored values into substrate bounds', () => {
    const item = canvasLayerItem({
      id: 'block-1',
      placement: { canvas: { x: 999, width: 1, rotation: 12, locked: true } },
    }, 0, 1)
    expect(item).toMatchObject({
      id: 'block-1', positionX: 125, width: 5, rotation: 12, locked: true,
    })
    expect(canvasGeometryFromItem(item)).toMatchObject({ x: 125, width: 5, locked: true })
  })

  it('derives stacking from structural order instead of legacy saved z-index', () => {
    const first = canvasLayerItem({ id: 'first', placement: { canvas: { zIndex: 999 } } }, 0, 2)
    const second = canvasLayerItem({ id: 'second', placement: { canvas: { zIndex: -20 } } }, 1, 2)

    expect(first.zIndex).toBe(1)
    expect(second.zIndex).toBe(2)
  })
})
