// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { compileSceneEntries } from '~/shared/features/cms/animation/compileScene'
import { createVarSidecar } from '~/shared/features/cms/animation/varAnimator'
import { getEntryProgress } from '~/shared/features/cms/animation/entryProgress'
import type { Keyframe } from '~/shared/types/animation'

describe('A1 end-to-end: tint-through pipeline', () => {
  it('compiles tint-through keyframes and drives --motion-tint on scroll', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, vars: { '--motion-tint': { type: 'color', value: 'rgba(0,0,0,0)' } } },
      { offset: 0.5, vars: { '--motion-tint': { type: 'color', value: 'rgba(30,61,79,0.6)' } } },
      { offset: 1, vars: { '--motion-tint': { type: 'color', value: 'rgba(0,0,0,0.8)' } } },
    ]
    const entry = {
      id: 'demo', sceneId: 'demo-scene',
      target: { entityType: 'block' as const, entityId: 'block-1', part: 'root' },
      keyframes,
      position: { type: 'absolute' as const, ms: 0 },
      scrollRange: { start: 0, end: 1 },
    }

    const compiled = compileSceneEntries([entry as any])
    expect(compiled[0].compiled.varTracks).toHaveLength(1)
    expect(compiled[0].compiled.varTracks![0].stops).toHaveLength(3)

    const el = document.createElement('div')
    const sidecar = createVarSidecar(el, compiled[0].compiled.varTracks!)
    expect(sidecar).not.toBeNull()

    const p = getEntryProgress(0.5, compiled[0].compiled)
    sidecar!.update(p)

    const tint = el.style.getPropertyValue('--motion-tint')
    expect(tint).toMatch(/^oklch\(/)
    expect(tint.length).toBeGreaterThan(10)

    sidecar!.update(0)
    expect(el.style.getPropertyValue('--motion-tint')).toMatch(/^oklch\(/)

    sidecar!.update(1)
    expect(el.style.getPropertyValue('--motion-tint')).toMatch(/^oklch\(/)

    sidecar!.destroy()
    expect(el.style.getPropertyValue('--motion-tint')).toBe('')
  })
})
