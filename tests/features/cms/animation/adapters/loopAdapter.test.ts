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

/** Stateful mock Animation — play/pause/cancel update playState, currentTime is mutable. */
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

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

/**
 * Build a mock deps object. No-itemIndex entries use subscribeTargetAll;
 * itemIndex entries use subscribeTarget.
 */
function mockEngine() {
  return {
    subscribeTarget: vi.fn().mockReturnValue(() => {}),
    subscribeTargetAll: vi.fn().mockReturnValue(() => {}),
    subscribeEntranceActive: vi.fn().mockReturnValue(() => {}),
  } as any
}

/**
 * Helper: set up subscribeTargetAll to capture the handler and deliver elements.
 * Returns a function that delivers an element array to the adapter.
 */
function captureTargetAllHandler(engine: ReturnType<typeof mockEngine>): {
  deliver: (els: Element[]) => void
} {
  let allHandler: ((els: Element[]) => void) | null = null
  engine.subscribeTargetAll.mockImplementation((_b: string, _p: string, h: any) => {
    allHandler = h
    h([]) // initial empty
    return () => {}
  })
  return {
    deliver: (els: Element[]) => allHandler!(els),
  }
}

beforeEach(() => {
  ioMap.clear()
  vi.unstubAllGlobals()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.stubGlobal('KeyframeEffect', MockKeyframeEffect)
  vi.stubGlobal('Animation', MockAnimation)
})

// -- canHandle and reduced motion --
describe('loopAdapter — canHandle and reduced motion', () => {
  it('canHandle returns true for scenes with loop-category entries', () => {
    const adapter = createLoopAdapter({
      subscribeTarget: vi.fn(),
      subscribeTargetAll: vi.fn().mockReturnValue(() => {}),
      subscribeEntranceActive: vi.fn(),
    })
    const entry = makeEntry({ presetId: 'float' })
    const scene = makeIntersectionScene({ entries: [entry] })
    expect(adapter.canHandle(scene)).toBe(true)
  })

  it('canHandle returns false for scenes without loop entries', () => {
    const adapter = createLoopAdapter({
      subscribeTarget: vi.fn(),
      subscribeTargetAll: vi.fn().mockReturnValue(() => {}),
      subscribeEntranceActive: vi.fn(),
    })
    const entry = makeEntry({ presetId: 'fade-in' })
    const scene = makeIntersectionScene({ entries: [entry] })
    expect(adapter.canHandle(scene)).toBe(false)
  })

  it('setup returns empty instance when reduced-motion is active', () => {
    mockReducedMotion(true)
    const engine = mockEngine()
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float' })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, {}, undefined)
    expect(instance.adapterName).toBe('loop')
    expect(engine.subscribeTarget).not.toHaveBeenCalled()
    expect(engine.subscribeTargetAll).not.toHaveBeenCalled()
    expect(engine.subscribeEntranceActive).not.toHaveBeenCalled()
  })
})

// -- visibility-driven play/pause --
// All tests use entries without itemIndex → all-items path (subscribeTargetAll).
describe('loopAdapter — visibility', () => {
  beforeEach(() => {
    mockReducedMotion(false)
  })

  it('subscribes to subscribeTargetAll and entrance observables on setup (no itemIndex)', () => {
    const engine = mockEngine()
    engine.subscribeTargetAll.mockImplementation((_b: string, _p: string, h: any) => { h([]); return () => {} })
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    adapter.setup(scene, {}, undefined)
    expect(engine.subscribeTargetAll).toHaveBeenCalledWith('b1', 'root', expect.any(Function))
    expect(engine.subscribeEntranceActive).toHaveBeenCalledWith('b1', 'root', expect.any(Function))
    // Per-index subscribeTarget must NOT be called
    expect(engine.subscribeTarget).not.toHaveBeenCalled()
  })

  it('plays from offset 0 on intersection enter when entrance inactive', () => {
    const engine = mockEngine()
    let entranceHandler: any = null
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { entranceHandler = h; h(false); return () => {} })
    const { deliver } = captureTargetAllHandler(engine)

    const el = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el }, undefined)

    deliver([el])
    fireIntersection(el, true)

    const state = _getLoopAdapterState(instance.id)!
    const anim = state.byEntryAll.get(entry.id)!.perElementStates.get(el)!.animation!
    expect(anim.playState).toBe('running')
    expect(anim.currentTime).toBe(0)
  })

  it('pauses on intersection exit', () => {
    const engine = mockEngine()
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { h(false); return () => {} })
    const { deliver } = captureTargetAllHandler(engine)

    const el = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el }, undefined)

    deliver([el])
    fireIntersection(el, true)
    fireIntersection(el, false)

    const anim = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!.perElementStates.get(el)!.animation!
    expect(anim.playState).toBe('paused')
  })

  it('does not play while entranceActive=true, even if visible; plays when it becomes false', () => {
    const engine = mockEngine()
    let entranceHandler: any
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { entranceHandler = h; h(true); return () => {} })
    const { deliver } = captureTargetAllHandler(engine)

    const el = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el }, undefined)

    deliver([el])
    fireIntersection(el, true)

    const anim = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!.perElementStates.get(el)!.animation!
    expect(anim.playState).not.toBe('running')

    entranceHandler(false)
    expect(anim.playState).toBe('running')
    expect(anim.currentTime).toBe(0)
  })

  it('restarts from offset 0 on re-entry (no mid-cycle resume)', () => {
    const engine = mockEngine()
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { h(false); return () => {} })
    const { deliver } = captureTargetAllHandler(engine)

    const el = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el }, undefined)

    deliver([el])
    fireIntersection(el, true)

    const anim = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!.perElementStates.get(el)!.animation!
    anim.currentTime = 1234
    fireIntersection(el, false)
    fireIntersection(el, true)
    expect(anim.currentTime).toBe(0)
  })

  it('re-attaches to new element set when subscribeTargetAll delivers a different array', () => {
    const engine = mockEngine()
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { h(false); return () => {} })
    const { deliver } = captureTargetAllHandler(engine)

    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el1 }, undefined)

    deliver([el1])
    const firstAnim = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!.perElementStates.get(el1)!.animation

    deliver([el2])
    const state = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!
    expect(state.perElementStates.has(el1)).toBe(false)
    expect(state.perElementStates.has(el2)).toBe(true)
    const secondAnim = state.perElementStates.get(el2)!.animation
    expect(secondAnim).not.toBe(firstAnim)
    expect(firstAnim?.playState).toBe('idle')
  })

  it('shared element: two entries on different parts, each using subscribeTargetAll, both animate', () => {
    const engine = mockEngine()
    const allHandlers: Array<(els: Element[]) => void> = []
    engine.subscribeTargetAll.mockImplementation((_b: string, _p: string, h: any) => {
      allHandlers.push(h); h([]); return () => {}
    })
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => { h(false); return () => {} })

    const shared = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const e1 = makeEntry({ id: 'e1', presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const e2 = makeEntry({ id: 'e2', presetId: 'breathe', target: { entityType: 'block', entityId: 'b1', part: 'media' } })
    const scene = makeIntersectionScene({ entries: [e1, e2] })
    const instance = adapter.setup(scene, { root: shared, media: shared }, undefined)

    // Deliver shared element to both handlers
    allHandlers[0]([shared])
    allHandlers[1]([shared])

    fireIntersection(shared, true)

    const state = _getLoopAdapterState(instance.id)!
    const anim1 = state.byEntryAll.get('e1')!.perElementStates.get(shared)!.animation
    const anim2 = state.byEntryAll.get('e2')!.perElementStates.get(shared)!.animation

    expect(anim1?.playState).toBe('running')
    expect(anim2?.playState).toBe('running')
  })

  it('destroy cancels animation, disconnects observer, unsubs all subscriptions', () => {
    const engine = mockEngine()
    const unsubAll = vi.fn()
    const unsubEntrance = vi.fn()
    engine.subscribeTargetAll.mockImplementation((_b: string, _p: string, h: any) => { h([]); return unsubAll })
    engine.subscribeEntranceActive.mockReturnValue(unsubEntrance)

    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: document.createElement('div') }, undefined)

    adapter.destroy(instance)
    expect(unsubAll).toHaveBeenCalled()
    expect(unsubEntrance).toHaveBeenCalled()
    expect(_getLoopAdapterState(instance.id)).toBeUndefined()
  })
})

// -- success criterion 13: loop-first load order --
describe('loopAdapter — loop-first load order (criterion 13)', () => {
  beforeEach(() => {
    mockReducedMotion(false)
  })

  it('loop plays immediately when no entrance exists; pauses when entrance arrives running; resumes from 0 when entrance finishes', () => {
    const engine = mockEngine()
    let entranceHandler: any
    engine.subscribeEntranceActive.mockImplementation((_b: string, _p: string, h: any) => {
      entranceHandler = h
      h(false)  // no entrance yet
      return () => {}
    })
    const { deliver } = captureTargetAllHandler(engine)

    const el = document.createElement('div')
    const adapter = createLoopAdapter(engine)
    const entry = makeEntry({ presetId: 'float', target: { entityType: 'block', entityId: 'b1', part: 'root' } })
    const scene = makeIntersectionScene({ entries: [entry] })
    const instance = adapter.setup(scene, { root: el }, undefined)

    deliver([el])
    fireIntersection(el, true)

    const anim = _getLoopAdapterState(instance.id)!.byEntryAll.get(entry.id)!.perElementStates.get(el)!.animation!
    expect(anim.playState).toBe('running')

    // entrance arrives running → loop pauses
    entranceHandler(true)
    expect(anim.playState).toBe('paused')

    // entrance finishes → loop restarts from 0
    entranceHandler(false)
    expect(anim.currentTime).toBe(0)
    expect(anim.playState).toBe('running')
  })
})
