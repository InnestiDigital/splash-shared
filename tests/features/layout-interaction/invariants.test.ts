import { describe, it, expect } from 'vitest'
import { normalizePositionedItems } from '../../../../shared/features/layout-interaction/normalize-positioned-items'
import { mergeSessionOverrides } from '../../../../shared/features/layout-interaction/merge-session-overrides'
import { computeLayoutFingerprint } from '../../../../shared/features/layout-interaction/layout-fingerprint'
import { composeSessionKey } from '../../../../shared/features/layout-interaction/session-key'
import { deriveRuntimeItems } from '../../../../shared/features/layout-interaction/runtime-state'
import { SCHEMA_VERSION } from '../../../../shared/features/layout-interaction/constants'

describe('chunk A invariants', () => {
  it('normalize does not mutate', () => {
    const frozen = Object.freeze([Object.freeze({ id: 'a' })]) as any
    expect(() => normalizePositionedItems(frozen)).not.toThrow()
  })

  it('merge does not mutate authored', () => {
    const authored = Object.freeze([Object.freeze({ id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 })]) as any
    expect(() => mergeSessionOverrides(authored, null, { configVersion: 'cv', layoutFingerprint: 'fp' })).not.toThrow()
  })

  it('deriveRuntimeItems does not mutate', () => {
    const items = Object.freeze([Object.freeze({ id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 })]) as any
    expect(() => deriveRuntimeItems({ items, activeGestureItemId: null, overrideItemIds: new Set() })).not.toThrow()
  })

  it('fingerprint is deterministic', () => {
    const items = [{ id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 }]
    expect(computeLayoutFingerprint(items)).toBe(computeLayoutFingerprint(items))
  })

  it('session key deterministic for same inputs', () => {
    const a = composeSessionKey({ namespace: 'scatter', blockId: 'b', configVersion: 'v', layoutFingerprint: 'f' })
    const b = composeSessionKey({ namespace: 'scatter', blockId: 'b', configVersion: 'v', layoutFingerprint: 'f' })
    expect(a).toBe(b)
  })
})
