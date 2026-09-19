import { describe, it, expect, vi } from 'vitest'
import type { EntrySidecar } from '~/shared/types/animation'

/**
 * Contract tests for the EntrySidecar interface.
 * Verifies the interface can be implemented and composed correctly.
 */

function createMockSidecar(): EntrySidecar & { updateCalls: number[]; destroyed: boolean } {
  const mock = {
    updateCalls: [] as number[],
    destroyed: false,
    update(progress: number) {
      mock.updateCalls.push(progress)
    },
    destroy() {
      mock.destroyed = true
    },
  }
  return mock
}

describe('EntrySidecar contract', () => {
  it('update() is called with correct progress', () => {
    const sidecar = createMockSidecar()
    sidecar.update(0)
    sidecar.update(0.5)
    sidecar.update(1)
    expect(sidecar.updateCalls).toEqual([0, 0.5, 1])
  })

  it('destroy() is callable', () => {
    const sidecar = createMockSidecar()
    sidecar.destroy()
    expect(sidecar.destroyed).toBe(true)
  })

  it('destroy() can be called after update()', () => {
    const sidecar = createMockSidecar()
    sidecar.update(0.75)
    sidecar.destroy()
    expect(sidecar.updateCalls).toEqual([0.75])
    expect(sidecar.destroyed).toBe(true)
  })

  describe('multiple sidecars in array', () => {
    it('all updated with same progress', () => {
      const sidecars = [createMockSidecar(), createMockSidecar(), createMockSidecar()]

      const progress = 0.42
      for (const sc of sidecars) {
        sc.update(progress)
      }

      for (const sc of sidecars) {
        expect(sc.updateCalls).toEqual([progress])
      }
    })

    it('all destroyed', () => {
      const sidecars = [createMockSidecar(), createMockSidecar(), createMockSidecar()]

      for (const sc of sidecars) {
        sc.update(0.5)
      }
      for (const sc of sidecars) {
        sc.destroy()
      }

      for (const sc of sidecars) {
        expect(sc.destroyed).toBe(true)
      }
    })
  })
})
