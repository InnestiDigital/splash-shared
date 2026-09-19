import { describe, it, expect } from 'vitest'
import { computeLayoutFingerprint } from '../../../../shared/features/layout-interaction/layout-fingerprint'

describe('computeLayoutFingerprint', () => {
  it('is stable across item ordering', () => {
    const a = [
      { id: 'a', positionX: 10, positionY: 20, width: 30, height: 40, rotation: 0, zIndex: 1 },
      { id: 'b', positionX: 50, positionY: 60, width: 70, height: 80, rotation: 0, zIndex: 2 },
    ]
    expect(computeLayoutFingerprint(a)).toBe(computeLayoutFingerprint([a[1], a[0]]))
  })

  it('changes when any interactive field of any item changes', () => {
    const base = [{ id: 'a', positionX: 10, positionY: 20, width: 30, height: 40, rotation: 0, zIndex: 1 }]
    const original = computeLayoutFingerprint(base)
    for (const field of ['positionX','positionY','width','height','rotation','zIndex'] as const) {
      const mutated = [{ ...base[0], [field]: base[0][field] + 1 }]
      expect(computeLayoutFingerprint(mutated)).not.toBe(original)
    }
  })

  it('ignores non-interactive fields', () => {
    const a = [{ id: 'a', positionX: 10, positionY: 20, width: 30, height: 40, rotation: 0, zIndex: 1, media: 'foo.jpg' } as any]
    const b = [{ id: 'a', positionX: 10, positionY: 20, width: 30, height: 40, rotation: 0, zIndex: 1, media: 'bar.jpg' } as any]
    expect(computeLayoutFingerprint(a)).toBe(computeLayoutFingerprint(b))
  })

  it('produces URL/key-safe short string', () => {
    const fp = computeLayoutFingerprint([{ id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 0 }])
    expect(fp).toMatch(/^[a-z0-9]+$/)
    expect(fp.length).toBeLessThanOrEqual(16)
  })
})
