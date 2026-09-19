import { describe, it, expect } from 'vitest'
import { mergeSessionOverrides } from '../../../../shared/features/layout-interaction/merge-session-overrides'
import { SCHEMA_VERSION } from '../../../../shared/features/layout-interaction/constants'

const AUTHORED = [
  { id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 },
  { id: 'b', positionX: 30, positionY: 30, width: 40, height: 40, rotation: 5, zIndex: 2 },
]
const CTX = { configVersion: 'cv', layoutFingerprint: 'fp' }

describe('mergeSessionOverrides', () => {
  it('null override → authored unchanged', () => {
    expect(mergeSessionOverrides(AUTHORED, null, CTX)).toEqual(AUTHORED)
  })

  it('schemaVersion mismatch → authored unchanged', () => {
    const ov = { schemaVersion: 999 as any, configVersion: 'cv', layoutFingerprint: 'fp', items: [{ id: 'a', positionX: 99, positionY: 99 }] }
    expect(mergeSessionOverrides(AUTHORED, ov, CTX)).toEqual(AUTHORED)
  })

  it('configVersion mismatch → authored unchanged', () => {
    const ov = { schemaVersion: SCHEMA_VERSION, configVersion: 'other', layoutFingerprint: 'fp', items: [{ id: 'a', positionX: 99, positionY: 99 }] }
    expect(mergeSessionOverrides(AUTHORED, ov, CTX)).toEqual(AUTHORED)
  })

  it('layoutFingerprint mismatch → authored unchanged', () => {
    const ov = { schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'other', items: [{ id: 'a', positionX: 99, positionY: 99 }] }
    expect(mergeSessionOverrides(AUTHORED, ov, CTX)).toEqual(AUTHORED)
  })

  it('drops override rows whose id is not in authored', () => {
    const ov = { schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 99, positionY: 99 }, { id: 'orphan', positionX: 0, positionY: 0 }] }
    const out = mergeSessionOverrides(AUTHORED, ov, CTX)
    expect(out.find(i => i.id === 'a')!.positionX).toBe(99)
    expect(out.find((i: any) => i.id === 'orphan')).toBeUndefined()
  })

  it('authored-id without override row keeps authored values', () => {
    const ov = { schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 99, positionY: 99 }] }
    expect(mergeSessionOverrides(AUTHORED, ov, CTX).find(i => i.id === 'b')!.positionX).toBe(30)
  })

  it('both present: override x/y wins; non-x/y fields come from authored', () => {
    const ov = { schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [{ id: 'b', positionX: 99, positionY: 99 }] }
    const out = mergeSessionOverrides(AUTHORED, ov, CTX).find(i => i.id === 'b')!
    expect(out.positionX).toBe(99)
    expect(out.positionY).toBe(99)
    expect(out.width).toBe(40)
    expect(out.height).toBe(40)
    expect(out.rotation).toBe(5)
    expect(out.zIndex).toBe(2)
  })
})
