/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLoopAdapter, _getLoopAdapterState } from '~/shared/features/cms/animation/adapters/loopAdapter'
import { makeEntry, makeIntersectionScene } from '~/tests/features/cms/animation/helpers'

// -- test infrastructure --
const ioMap = new Map<Element, (isIntersecting: boolean) => void>()
class MockIntersectionObserver {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) { this.cb = cb }
  observe(el: Element) {
    ioMap.set(el, (intersecting) => this.cb([{ target: el, isIntersecting: intersecting } as any], this as any))
  }
  unobserve(el: Element) { ioMap.delete(el) }
  disconnect() { ioMap.clear() }
}
function fireIntersection(el: Element, isIntersecting: boolean) {
  ioMap.get(el)?.(isIntersecting)
}

class MockAnimation {
  playState: AnimationPlayState = 'idle'
  currentTime: CSSNumberish | null = null
  play() { this.playState = 'running' }
  pause() { this.playState = 'paused' }
  cancel() { this.playState = 'idle'; this.currentTime = null }
}

class MockKeyframeEffect {
  constructor(_el: Element | null, _kf: Keyframe[] | null, _opts?: KeyframeEffectOptions) {}
}

beforeEach(() => {
  ioMap.clear()
  vi.unstubAllGlobals()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.stubGlobal('KeyframeEffect', MockKeyframeEffect)
  vi.stubGlobal('Animation', MockAnimation)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

describe('loopAdapter — multi-target', () => {
  it('attaches a loop to each item index when entries declare itemIndex', () => {
    const subscribers: Array<{ blockId: string; part: string; index: number | undefined; handler: any }> = []
    const deps = {
      subscribeTarget: vi.fn((blockId: string, part: string, handler: any, itemIndex?: number) => {
        subscribers.push({ blockId, part, index: itemIndex, handler })
        handler(null) // initial null fire
        return () => {}
      }),
      subscribeTargetAll: vi.fn(() => () => {}),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const entries = [
      makeEntry({ id: 'e0', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items', itemIndex: 0 } }),
      makeEntry({ id: 'e1', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items', itemIndex: 1 } }),
      makeEntry({ id: 'e2', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items', itemIndex: 2 } }),
    ]
    const scene = makeIntersectionScene({ entries })

    adapter.setup(scene, {} as any, undefined)

    expect(subscribers.length).toBe(3)
    expect(subscribers.map(s => s.index)).toEqual([0, 1, 2])
    expect(subscribers.every(s => s.blockId === 'b1')).toBe(true)
    expect(subscribers.every(s => s.part === 'items')).toBe(true)
    // All-items path should NOT be used when itemIndex is set
    expect(deps.subscribeTargetAll).not.toHaveBeenCalled()
  })

  it('each item index receives its own animation when elements are provided', () => {
    const targetHandlers: Array<(el: Element | null) => void> = []
    const deps = {
      subscribeTarget: vi.fn((_b: string, _p: string, handler: any, _idx?: number) => {
        targetHandlers.push(handler)
        handler(null)
        return () => {}
      }),
      subscribeTargetAll: vi.fn(() => () => {}),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const entries = [
      makeEntry({ id: 'e0', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items', itemIndex: 0 } }),
      makeEntry({ id: 'e1', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items', itemIndex: 1 } }),
    ]
    const scene = makeIntersectionScene({ entries })
    const instance = adapter.setup(scene, {} as any, undefined)

    const el0 = document.createElement('div')
    const el1 = document.createElement('div')

    targetHandlers[0](el0)
    targetHandlers[1](el1)

    const state = _getLoopAdapterState(instance.id)!

    fireIntersection(el0, true)
    fireIntersection(el1, true)

    const s0 = state.byEntry.get('e0')!
    const s1 = state.byEntry.get('e1')!

    expect(s0.animation).not.toBeNull()
    expect(s1.animation).not.toBeNull()
    expect(s0.animation).not.toBe(s1.animation)
    expect(s0.animation!.playState).toBe('running')
    expect(s1.animation!.playState).toBe('running')
  })

  it('single-target entry (no itemIndex) uses subscribeTargetAll path', () => {
    let allHandler: ((els: Element[]) => void) | null = null
    const deps = {
      subscribeTarget: vi.fn(),
      subscribeTargetAll: vi.fn((_b: string, _p: string, handler: any) => {
        allHandler = handler
        handler([]) // initial empty fire
        return () => {}
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const entry = makeEntry({ id: 'e0', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })

    adapter.setup(scene, {} as any, undefined)

    expect(deps.subscribeTargetAll).toHaveBeenCalledWith('b1', 'root', expect.any(Function))
    // subscribeTarget must NOT be called for no-itemIndex entries
    expect(deps.subscribeTarget).not.toHaveBeenCalled()
    expect(allHandler).not.toBeNull()
  })

  it('attaches a loop to EVERY element when entry has no itemIndex (all-items scope)', () => {
    let elementsCb: ((els: Element[]) => void) | null = null
    const deps = {
      subscribeTarget: vi.fn(() => () => {}),
      subscribeTargetAll: vi.fn((_blockId: string, _part: string, handler: any) => {
        elementsCb = handler
        handler([]) // initial empty
        return () => {}
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const scene = makeIntersectionScene({
      entries: [
        // No itemIndex — applies to all items
        makeEntry({ id: 'eAll', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items' } }),
      ],
    })
    const instance = adapter.setup(scene, {} as any)

    expect(deps.subscribeTargetAll).toHaveBeenCalledTimes(1)
    expect(elementsCb).not.toBeNull()

    // Simulate engine providing 3 items
    const e0 = document.createElement('div')
    const e1 = document.createElement('div')
    const e2 = document.createElement('div')
    elementsCb!([e0, e1, e2])

    const state = _getLoopAdapterState(instance.id)!
    const allState = state.byEntryAll.get('eAll')!
    expect(allState).toBeDefined()
    expect(allState.perElementStates.size).toBe(3)

    // Each element should have its own animation
    for (const el of [e0, e1, e2]) {
      const s = allState.perElementStates.get(el)!
      expect(s).toBeDefined()
      expect(s.animation).not.toBeNull()
    }
  })

  it('all-items scope: each element animates independently on intersection', () => {
    let elementsCb: ((els: Element[]) => void) | null = null
    const deps = {
      subscribeTarget: vi.fn(() => () => {}),
      subscribeTargetAll: vi.fn((_b: string, _p: string, handler: any) => {
        elementsCb = handler
        handler([])
        return () => {}
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({ id: 'eAll', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items' } }),
      ],
    })
    const instance = adapter.setup(scene, {} as any)

    const e0 = document.createElement('div')
    const e1 = document.createElement('div')
    elementsCb!([e0, e1])

    // Both elements are observed; fire intersection for both
    fireIntersection(e0, true)
    fireIntersection(e1, true)

    const state = _getLoopAdapterState(instance.id)!
    const allState = state.byEntryAll.get('eAll')!
    const s0 = allState.perElementStates.get(e0)!
    const s1 = allState.perElementStates.get(e1)!

    expect(s0.animation!.playState).toBe('running')
    expect(s1.animation!.playState).toBe('running')
    // Independent animations
    expect(s0.animation).not.toBe(s1.animation)
  })

  it('all-items scope: element removed from array gets detached', () => {
    let elementsCb: ((els: Element[]) => void) | null = null
    const deps = {
      subscribeTarget: vi.fn(() => () => {}),
      subscribeTargetAll: vi.fn((_b: string, _p: string, handler: any) => {
        elementsCb = handler
        handler([])
        return () => {}
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return () => {} }),
    }

    const adapter = createLoopAdapter(deps)
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({ id: 'eAll', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items' } }),
      ],
    })
    const instance = adapter.setup(scene, {} as any)

    const e0 = document.createElement('div')
    const e1 = document.createElement('div')
    elementsCb!([e0, e1])
    fireIntersection(e0, true)

    const state = _getLoopAdapterState(instance.id)!
    const allState = state.byEntryAll.get('eAll')!
    const anim0 = allState.perElementStates.get(e0)!.animation!

    // Remove e0 from array
    elementsCb!([e1])

    expect(allState.perElementStates.has(e0)).toBe(false)
    // Animation cancelled on detach
    expect(anim0.playState).toBe('idle')
    expect(allState.perElementStates.size).toBe(1)
  })

  it('all-items scope: entranceActive pauses all per-element animations', () => {
    let elementsCb: ((els: Element[]) => void) | null = null
    let entranceCb: ((active: boolean) => void) | null = null
    const deps = {
      subscribeTarget: vi.fn(() => () => {}),
      subscribeTargetAll: vi.fn((_b: string, _p: string, handler: any) => {
        elementsCb = handler
        handler([])
        return () => {}
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => {
        entranceCb = h
        h(false)
        return () => {}
      }),
    }

    const adapter = createLoopAdapter(deps)
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({ id: 'eAll', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items' } }),
      ],
    })
    const instance = adapter.setup(scene, {} as any)

    const e0 = document.createElement('div')
    const e1 = document.createElement('div')
    elementsCb!([e0, e1])
    fireIntersection(e0, true)
    fireIntersection(e1, true)

    const state = _getLoopAdapterState(instance.id)!
    const allState = state.byEntryAll.get('eAll')!

    expect(allState.perElementStates.get(e0)!.animation!.playState).toBe('running')
    expect(allState.perElementStates.get(e1)!.animation!.playState).toBe('running')

    // Entrance starts — all should pause
    entranceCb!(true)
    expect(allState.perElementStates.get(e0)!.animation!.playState).toBe('paused')
    expect(allState.perElementStates.get(e1)!.animation!.playState).toBe('paused')

    // Entrance ends — all should play again
    entranceCb!(false)
    expect(allState.perElementStates.get(e0)!.animation!.playState).toBe('running')
    expect(allState.perElementStates.get(e1)!.animation!.playState).toBe('running')
  })

  it('destroy cleans up both byEntry and byEntryAll paths', () => {
    const unsubAll = vi.fn()
    const unsubEntrance = vi.fn()
    const deps = {
      subscribeTarget: vi.fn(() => () => {}),
      subscribeTargetAll: vi.fn((_b: string, _p: string, handler: any) => {
        handler([]) // initial empty
        return unsubAll
      }),
      subscribeEntranceActive: vi.fn((_b: string, _p: string, h: any) => { h(false); return unsubEntrance }),
    }

    const adapter = createLoopAdapter(deps)
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({ id: 'eAll', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'items' } }),
      ],
    })
    const instance = adapter.setup(scene, {} as any)

    adapter.destroy(instance)

    expect(unsubAll).toHaveBeenCalled()
    expect(unsubEntrance).toHaveBeenCalled()
    expect(_getLoopAdapterState(instance.id)).toBeUndefined()
  })
})
