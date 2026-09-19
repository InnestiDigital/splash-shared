// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SCHEMA_VERSION } from '../../../../../shared/features/layout-interaction/constants'
import { createSessionStorageAdapter } from '../../../../../shared/features/layout-interaction/persistence/session-storage-adapter'
import type { PositionedItemAuthored } from '../../../../../shared/features/layout-interaction/types'

const AUTHORED: PositionedItemAuthored[] = [
  { id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 },
]

function ctx(fp = 'fp', cv: string | number = 'cv') {
  return { blockId: 'blk', configVersion: cv, authoredItems: AUTHORED, layoutFingerprint: fp }
}

const KEY = 'scatter:blk:v:cv:h:fp:s:1'

describe('SessionStoragePersistenceAdapter', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('commit narrows patch to { id, positionX, positionY }', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', positionX: 1, positionY: 2, width: 99, height: 99, rotation: 99, zIndex: 99 }, ctx())
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    const row = payload.items.find((it: any) => it.id === 'a')
    expect(Object.keys(row).sort()).toEqual(['id', 'positionX', 'positionY'])
  })

  it('hydrate with both-present keeps non-x/y from authored', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 88, positionY: 88 }],
    }))
    const out = a.hydrate(AUTHORED, ctx())
    expect(out[0]).toMatchObject({ positionX: 88, positionY: 88, width: 20, height: 20, rotation: 0, zIndex: 1 })
  })

  it('removes key on parse failure', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, '{ bad')
    a.hydrate(AUTHORED, ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('removes key on schemaVersion mismatch and returns authored', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: 999, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 88, positionY: 88 }],
    }))
    const out = a.hydrate(AUTHORED, ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(out).toEqual(AUTHORED)
  })

  it('removes key on configVersion mismatch and returns authored', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION, configVersion: 'other', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 88, positionY: 88 }],
    }))
    const out = a.hydrate(AUTHORED, ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(out).toEqual(AUTHORED)
  })

  it('removes key on layoutFingerprint mismatch and returns authored', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'different',
      items: [{ id: 'a', positionX: 88, positionY: 88 }],
    }))
    const out = a.hydrate(AUTHORED, ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(out).toEqual(AUTHORED)
  })

  it('drops orphan override rows (id not in authored)', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION, configVersion: 'cv', layoutFingerprint: 'fp',
      items: [
        { id: 'a', positionX: 88, positionY: 88 },
        { id: 'zzz-orphan', positionX: 1, positionY: 2 },
      ],
    }))
    const out = a.hydrate(AUTHORED, ctx())
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', positionX: 88, positionY: 88 })
  })

  it('hydrate returns authored when no override exists', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    const out = a.hydrate(AUTHORED, ctx())
    expect(out).toEqual(AUTHORED)
  })

  it('commit merges into existing override by id', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())
    a.commit({ id: 'a', positionX: 3, positionY: 4 }, ctx())
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toEqual({ id: 'a', positionX: 3, positionY: 4 })
  })

  it('commit appends new id alongside existing overrides', () => {
    const authored: PositionedItemAuthored[] = [
      { id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 },
      { id: 'b', positionX: 20, positionY: 20, width: 20, height: 20, rotation: 0, zIndex: 1 },
    ]
    const context = { blockId: 'blk', configVersion: 'cv', authoredItems: authored, layoutFingerprint: 'fp' }
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', positionX: 1, positionY: 2 }, context)
    a.commit({ id: 'b', positionX: 5, positionY: 6 }, context)
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    expect(payload.items).toHaveLength(2)
    expect(payload.items.find((r: any) => r.id === 'a')).toEqual({ id: 'a', positionX: 1, positionY: 2 })
    expect(payload.items.find((r: any) => r.id === 'b')).toEqual({ id: 'b', positionX: 5, positionY: 6 })
  })

  it('commit is a no-op when patch has no x/y fields', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', width: 99 }, ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('commit writes schemaVersion, configVersion, and layoutFingerprint', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION)
    expect(payload.configVersion).toBe('cv')
    expect(payload.layoutFingerprint).toBe('fp')
  })

  it('commit treats unparseable stored JSON as empty and writes a fresh envelope', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, '{ corrupted')
    a.commit({ id: 'a', positionX: 7, positionY: 8 }, ctx())
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION)
    expect(payload.configVersion).toBe('cv')
    expect(payload.layoutFingerprint).toBe('fp')
    expect(payload.items).toEqual([{ id: 'a', positionX: 7, positionY: 8 }])
  })

  it('commit resets payload when stored envelope mismatches context', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    window.sessionStorage.setItem(KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION, configVersion: 'stale', layoutFingerprint: 'fp',
      items: [{ id: 'a', positionX: 77, positionY: 77 }],
    }))
    a.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())
    const payload = JSON.parse(window.sessionStorage.getItem(KEY) as string)
    expect(payload.configVersion).toBe('cv')
    expect(payload.items).toEqual([{ id: 'a', positionX: 1, positionY: 2 }])
  })

  it('clearOverrides removes the key', () => {
    const a = createSessionStorageAdapter({ namespace: 'scatter' })
    a.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull()
    a.clearOverrides(ctx())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('different namespaces do not collide', () => {
    const scatter = createSessionStorageAdapter({ namespace: 'scatter' })
    const freeform = createSessionStorageAdapter({ namespace: 'freeform' })
    scatter.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())
    freeform.commit({ id: 'a', positionX: 9, positionY: 9 }, ctx())
    const sKey = 'scatter:blk:v:cv:h:fp:s:1'
    const fKey = 'freeform:blk:v:cv:h:fp:s:1'
    const s = JSON.parse(window.sessionStorage.getItem(sKey) as string)
    const f = JSON.parse(window.sessionStorage.getItem(fKey) as string)
    expect(s.items[0]).toEqual({ id: 'a', positionX: 1, positionY: 2 })
    expect(f.items[0]).toEqual({ id: 'a', positionX: 9, positionY: 9 })
  })

  describe('SSR-safe (no window)', () => {
    let originalWindow: any
    beforeEach(() => {
      originalWindow = globalThis.window
      // @ts-expect-error simulate SSR
      delete globalThis.window
    })
    afterEach(() => {
      globalThis.window = originalWindow
    })

    it('hydrate returns authored when window is undefined', () => {
      const a = createSessionStorageAdapter({ namespace: 'scatter' })
      const out = a.hydrate(AUTHORED, ctx())
      expect(out).toEqual(AUTHORED)
    })

    it('commit is a no-op when window is undefined', () => {
      const a = createSessionStorageAdapter({ namespace: 'scatter' })
      expect(() => a.commit({ id: 'a', positionX: 1, positionY: 2 }, ctx())).not.toThrow()
    })

    it('clearOverrides is a no-op when window is undefined', () => {
      const a = createSessionStorageAdapter({ namespace: 'scatter' })
      expect(() => a.clearOverrides(ctx())).not.toThrow()
    })
  })
})
