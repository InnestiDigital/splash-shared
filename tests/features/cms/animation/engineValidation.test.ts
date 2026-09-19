/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnimationEngine } from '~/shared/features/cms/animation/useAnimationEngine'
import { makeEntry, makeIntersectionScene } from '~/tests/features/cms/animation/helpers'

// Stub WAAPI + IO + matchMedia (adapters require them)
class MockAnimation {
  playState: 'idle' | 'running' | 'paused' = 'idle'
  currentTime: number | null = 0
  play() { this.playState = 'running' }
  pause() { this.playState = 'paused' }
  cancel() { this.playState = 'idle' }
  addEventListener() {}
  removeEventListener() {}
}
class MockKeyframeEffect {}
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('Animation', MockAnimation)
  vi.stubGlobal('KeyframeEffect', MockKeyframeEffect)
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
})

describe('engine validation on load', () => {
  it('logs [animation:scene-set] warning when duplicate-loop detected', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const engine = useAnimationEngine()

    const e1 = makeEntry({ id: 'e1', presetId: 'float', target: { entityType: 'block', entityId: 'b', part: 'root' } })
    const e2 = makeEntry({ id: 'e2', presetId: 'swing', target: { entityType: 'block', entityId: 'b', part: 'root' } })
    const s1 = makeIntersectionScene({ id: 's1', entries: [e1] })
    const s2 = makeIntersectionScene({ id: 's2', entries: [e2] })

    engine.loadScenes([s1, s2])

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[animation:scene-set]'), expect.anything())
    const issues = engine.getValidationIssues()
    expect(issues.some(i => i.code === 'duplicate-loop')).toBe(true)
    warn.mockRestore()
  })

  it('exposes validation issues via getValidationIssues()', () => {
    const engine = useAnimationEngine()
    // Bad entry — no presetId AND no keyframes (truly incomplete)
    const entry = { ...makeEntry({ presetId: 'float' }), presetId: undefined, keyframes: [] }
    const scene = makeIntersectionScene({ entries: [entry as any] })
    engine.loadScenes([scene])
    const issues = engine.getValidationIssues()
    expect(issues.some(i => i.code === 'missing-preset')).toBe(true)
  })

  it('skips entries flagged as errors (they do not reach adapters)', () => {
    const engine = useAnimationEngine()
    const el = document.createElement('div')
    engine.registerBlockTargets('b', { root: el })

    // Duplicate-loop: two floats on same target. Both should be flagged and skipped.
    const e1 = makeEntry({ id: 'e1', presetId: 'float', target: { entityType: 'block', entityId: 'b', part: 'root' } })
    const e2 = makeEntry({ id: 'e2', presetId: 'swing', target: { entityType: 'block', entityId: 'b', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [e1, e2] })

    engine.loadScenes([scene])

    // getActiveAdapters(scene.id) should be empty since all entries were skipped
    const adapters = engine.getActiveAdapters(scene.id)
    expect(adapters).toEqual([])
  })

  it('returns empty array when no validation issues', () => {
    const engine = useAnimationEngine()
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    engine.loadScenes([scene])
    const issues = engine.getValidationIssues()
    expect(issues.filter(i => i.level === 'error')).toEqual([])
  })
})
