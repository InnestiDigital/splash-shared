import { describe, it, expect } from 'vitest'
import { deriveRuntimeItems } from '../../../../shared/features/layout-interaction/runtime-state'

const ITEMS = [
  { id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 },
  { id: 'b', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 },
]

describe('deriveRuntimeItems', () => {
  it('none by default', () => {
    const out = deriveRuntimeItems({ items: ITEMS, activeGestureItemId: null, overrideItemIds: new Set() })
    expect(out.every(i => i.motionSuppressionReason === 'none')).toBe(true)
  })

  it('active gesture → active-gesture', () => {
    const out = deriveRuntimeItems({ items: ITEMS, activeGestureItemId: 'a', overrideItemIds: new Set() })
    expect(out.find(i => i.id === 'a')!.motionSuppressionReason).toBe('active-gesture')
    expect(out.find(i => i.id === 'b')!.motionSuppressionReason).toBe('none')
  })

  it('override id → session-override', () => {
    const out = deriveRuntimeItems({ items: ITEMS, activeGestureItemId: null, overrideItemIds: new Set(['b']) })
    expect(out.find(i => i.id === 'b')!.motionSuppressionReason).toBe('session-override')
  })

  it('active-gesture wins over session-override on the same item', () => {
    const out = deriveRuntimeItems({ items: ITEMS, activeGestureItemId: 'a', overrideItemIds: new Set(['a', 'b']) })
    expect(out.find(i => i.id === 'a')!.motionSuppressionReason).toBe('active-gesture')
    expect(out.find(i => i.id === 'b')!.motionSuppressionReason).toBe('session-override')
  })
})
