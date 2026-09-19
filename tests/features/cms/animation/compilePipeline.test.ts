import { describe, it, expect, vi } from 'vitest'
import { compileSceneEntries } from '~/shared/features/cms/animation/compileScene'
import * as oklch from '~/shared/features/cms/animation/oklch'

describe('compile pipeline wiring', () => {
  it('compileSceneEntries calls parseToOklch during compile', () => {
    const spy = vi.spyOn(oklch, 'parseToOklch')
    const entries = [{
      id: 'e1', sceneId: 's1', target: { entityId: 'b1', entityType: 'block' as const, part: 'root' },
      keyframes: [
        { offset: 0, vars: { '--motion-c': { type: 'color' as const, value: '#ff0000' } } },
        { offset: 1, vars: { '--motion-c': { type: 'color' as const, value: '#0000ff' } } },
      ],
      position: { type: 'absolute' as const, ms: 0 },
    }]
    compileSceneEntries(entries as any)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('compileSceneEntries returns compiled entries with varTracks for color vars', () => {
    const entries = [{
      id: 'e1', sceneId: 's1', target: { entityId: 'b1', entityType: 'block' as const, part: 'root' },
      keyframes: [
        { offset: 0, vars: { '--motion-c': { type: 'color' as const, value: '#ff0000' } } },
        { offset: 1, vars: { '--motion-c': { type: 'color' as const, value: '#0000ff' } } },
      ],
      position: { type: 'absolute' as const, ms: 0 },
    }]
    const result = compileSceneEntries(entries as any)
    expect(result).toHaveLength(1)
    expect(result[0].compiled.varTracks).not.toBeNull()
    expect(result[0].compiled.varTracks![0].name).toBe('--motion-c')
    expect(result[0].compiled.varTracks![0].type).toBe('color')
  })

  it('compileSceneEntries returns null varTracks when no vars present', () => {
    const entries = [{
      id: 'e1', sceneId: 's1', target: { entityId: 'b1', entityType: 'block' as const, part: 'root' },
      keyframes: [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ],
      position: { type: 'absolute' as const, ms: 0 },
    }]
    const result = compileSceneEntries(entries as any)
    expect(result).toHaveLength(1)
    expect(result[0].compiled.varTracks).toBeNull()
  })

  it('compileSceneEntries validates scrollRange during compile', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entries = [{
      id: 'e1', sceneId: 's1', target: { entityId: 'b1', entityType: 'block' as const, part: 'root' },
      keyframes: [{ offset: 0 }, { offset: 1 }],
      position: { type: 'absolute' as const, ms: 0 },
      scrollRange: { start: 0.8, end: 0.2 },
    }]
    const result = compileSceneEntries(entries as any)
    expect(result[0].compiled.scrollRange).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
