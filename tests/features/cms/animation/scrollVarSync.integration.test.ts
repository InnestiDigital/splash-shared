// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { compileSceneEntries } from '~/shared/features/cms/animation/compileScene'
import { createVarSidecar } from '~/shared/features/cms/animation/varAnimator'
import { getEntryProgress } from '~/shared/features/cms/animation/entryProgress'
import * as oklch from '~/shared/features/cms/animation/oklch'
import type { Keyframe } from '~/shared/types/animation'

function makeScrollEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'e1', sceneId: 's1',
    target: { entityType: 'block' as const, entityId: 'b1', part: 'root' },
    keyframes: [
      { offset: 0, vars: { '--motion-x': { type: 'number' as const, value: 0 } } },
      { offset: 1, vars: { '--motion-x': { type: 'number' as const, value: 100 } } },
    ] as Keyframe[],
    position: { type: 'absolute' as const, ms: 0 },
    scrollRange: { start: 0.25, end: 0.75 },
    ...overrides,
  }
}

describe('scroll adapter + VarAnimator integration', () => {
  it('WAAPI and sidecar receive same remapped entryProgress', () => {
    const entry = makeScrollEntry()
    const compiled = compileSceneEntries([entry as any])
    const el = document.createElement('div')
    const sidecar = createVarSidecar(el, compiled[0].compiled.varTracks!)!

    const sceneProgress = 0.5
    const entryP = getEntryProgress(sceneProgress, compiled[0].compiled)
    expect(entryP).toBeCloseTo(0.5)

    sidecar.update(entryP)
    expect(el.style.getPropertyValue('--motion-x')).toBe('50')

    sidecar.destroy()
  })

  it('compile-once: parseToOklch not called during sidecar update', () => {
    const spy = vi.spyOn(oklch, 'parseToOklch')

    const entry = makeScrollEntry({
      keyframes: [
        { offset: 0, vars: { '--motion-c': { type: 'color' as const, value: '#ff0000' } } },
        { offset: 1, vars: { '--motion-c': { type: 'color' as const, value: '#0000ff' } } },
      ],
    })

    const compiled = compileSceneEntries([entry as any])
    const callsAfterCompile = spy.mock.calls.length
    expect(callsAfterCompile).toBeGreaterThan(0)

    const el = document.createElement('div')
    const sidecar = createVarSidecar(el, compiled[0].compiled.varTracks!)!
    sidecar.update(0.25)
    sidecar.update(0.5)
    sidecar.update(0.75)

    expect(spy.mock.calls.length).toBe(callsAfterCompile)

    sidecar.destroy()
    spy.mockRestore()
  })
})
