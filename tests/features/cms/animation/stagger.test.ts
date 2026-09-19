/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  ResolvedTargets,
  IntersectionTrigger,
} from '~/shared/types/animation'
import {
  computeStaggerDelays,
  computeWaveDelays,
  staggerSequential,
  staggerCascade,
  staggerQuick,
  staggerWave,
  staggerConfigs,
} from '~/shared/features/cms/animation/presets/stagger'
import { createIntersectionAdapter } from '~/shared/features/cms/animation/adapters/intersectionAdapter'

// ---------------------------------------------------------------------------
// Mock IntersectionObserver
// ---------------------------------------------------------------------------

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number>

  callback: IntersectionObserverCallback
  elements: Element[] = []

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.thresholds = options?.threshold
      ? Array.isArray(options.threshold) ? options.threshold : [options.threshold]
      : [0]
    MockIntersectionObserver.instances.push(this)
  }

  observe(el: Element) { this.elements.push(el) }
  unobserve(el: Element) { this.elements = this.elements.filter((e) => e !== el) }
  disconnect() { this.elements = [] }
  takeRecords(): IntersectionObserverEntry[] { return [] }

  simulateIntersection(isIntersecting: boolean) {
    const entries = this.elements.map((el) => ({
      isIntersecting,
      target: el,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    })) as IntersectionObserverEntry[]
    this.callback(entries, this)
  }

  static instances: MockIntersectionObserver[] = []
  static reset() { MockIntersectionObserver.instances = [] }
}

// ---------------------------------------------------------------------------
// Mock Animation
// ---------------------------------------------------------------------------

function createMockAnimation(): Animation {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn(),
    reverse: vi.fn(),
    updatePlaybackRate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    currentTime: 0,
    playbackRate: 1,
    playState: 'idle',
    startTime: null,
    effect: null,
    finished: Promise.resolve(null as any),
    id: '',
    oncancel: null,
    onfinish: null,
    onremove: null,
    pending: false,
    ready: Promise.resolve(null as any),
    replaceState: 'active',
    timeline: null,
    commitStyles: vi.fn(),
    persist: vi.fn(),
  } as unknown as Animation
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnimationEntry> & { id: string }): AnimationEntry {
  return {
    sceneId: 'scene-1',
    target: { entityType: 'block', entityId: 'b1', part: 'root' },
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    position: { type: 'absolute', ms: 0 },
    ...overrides,
  }
}

function makeScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-1',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'intersection',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
    } as IntersectionTrigger,
    entries: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: computeStaggerDelays
// ---------------------------------------------------------------------------

describe('computeStaggerDelays', () => {
  it('assigns incremental delays to entries with same staggerGroup (sequential 100ms)', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0', staggerGroup: 'sequential', staggerDelay: 100 }),
      makeEntry({ id: 'e1', staggerGroup: 'sequential', staggerDelay: 100 }),
      makeEntry({ id: 'e2', staggerGroup: 'sequential', staggerDelay: 100 }),
    ]

    const delays = computeStaggerDelays(entries)

    expect(delays.get('e0')).toBe(0)
    expect(delays.get('e1')).toBe(100)
    expect(delays.get('e2')).toBe(200)
  })

  it('assigns delay 0 to entries without staggerGroup', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0' }),
      makeEntry({ id: 'e1' }),
    ]

    const delays = computeStaggerDelays(entries)

    expect(delays.get('e0')).toBe(0)
    expect(delays.get('e1')).toBe(0)
  })

  it('handles mixed groups with independent delay sequences', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'a0', staggerGroup: 'groupA', staggerDelay: 100 }),
      makeEntry({ id: 'b0', staggerGroup: 'groupB', staggerDelay: 50 }),
      makeEntry({ id: 'a1', staggerGroup: 'groupA', staggerDelay: 100 }),
      makeEntry({ id: 'b1', staggerGroup: 'groupB', staggerDelay: 50 }),
      makeEntry({ id: 'c0' }), // no stagger group
    ]

    const delays = computeStaggerDelays(entries)

    // groupA: a0=0, a1=100
    expect(delays.get('a0')).toBe(0)
    expect(delays.get('a1')).toBe(100)
    // groupB: b0=0, b1=50
    expect(delays.get('b0')).toBe(0)
    expect(delays.get('b1')).toBe(50)
    // no group: 0
    expect(delays.get('c0')).toBe(0)
  })

  it('uses cascade config delay (80ms)', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0', staggerGroup: 'cascade', staggerDelay: staggerCascade.delay }),
      makeEntry({ id: 'e1', staggerGroup: 'cascade', staggerDelay: staggerCascade.delay }),
      makeEntry({ id: 'e2', staggerGroup: 'cascade', staggerDelay: staggerCascade.delay }),
    ]

    const delays = computeStaggerDelays(entries)

    expect(delays.get('e0')).toBe(0)
    expect(delays.get('e1')).toBe(80)
    expect(delays.get('e2')).toBe(160)
  })

  it('uses quick config delay (50ms)', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0', staggerGroup: 'quick', staggerDelay: staggerQuick.delay }),
      makeEntry({ id: 'e1', staggerGroup: 'quick', staggerDelay: staggerQuick.delay }),
      makeEntry({ id: 'e2', staggerGroup: 'quick', staggerDelay: staggerQuick.delay }),
    ]

    const delays = computeStaggerDelays(entries)

    expect(delays.get('e0')).toBe(0)
    expect(delays.get('e1')).toBe(50)
    expect(delays.get('e2')).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Tests: staggerConfigs
// ---------------------------------------------------------------------------

describe('staggerConfigs', () => {
  it('contains 4 entries', () => {
    expect(staggerConfigs).toHaveLength(4)
  })

  it('sequential config has correct values', () => {
    expect(staggerSequential.group).toBe('sequential')
    expect(staggerSequential.delay).toBe(100)
    expect(staggerSequential.label).toBe('Sequential (100ms)')
  })

  it('cascade config has correct values', () => {
    expect(staggerCascade.group).toBe('cascade')
    expect(staggerCascade.delay).toBe(80)
    expect(staggerCascade.label).toBe('Cascade (80ms)')
  })

  it('quick config has correct values', () => {
    expect(staggerQuick.group).toBe('quick')
    expect(staggerQuick.delay).toBe(50)
    expect(staggerQuick.label).toBe('Quick (50ms)')
  })

  it('wave config has correct values', () => {
    expect(staggerWave.group).toBe('wave')
    expect(staggerWave.delay).toBe(120)
    expect(staggerWave.label).toBe('Wave (120ms)')
  })
})

// ---------------------------------------------------------------------------
// Tests: computeWaveDelays
// ---------------------------------------------------------------------------

describe('computeWaveDelays', () => {
  it('returns sine-based delays for each entry', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'w0' }),
      makeEntry({ id: 'w1' }),
      makeEntry({ id: 'w2' }),
      makeEntry({ id: 'w3' }),
    ]

    const delays = computeWaveDelays(entries, 120, 80)

    // index 0: sin(0 * PI / 4) = sin(0) = 0 → 120 + 0 = 120
    expect(delays.get('w0')).toBe(120)
    // index 1: sin(1 * PI / 4) = sin(PI/4) ≈ 0.707 → 120 + 56.57 ≈ 177
    expect(delays.get('w1')).toBe(Math.round(120 + Math.sin(Math.PI / 4) * 80))
    // index 2: sin(2 * PI / 4) = sin(PI/2) = 1 → 120 + 80 = 200
    expect(delays.get('w2')).toBe(200)
    // index 3: sin(3 * PI / 4) = sin(PI/4) ≈ 0.707 → 120 + 56.57 ≈ 177
    expect(delays.get('w3')).toBe(Math.round(120 + Math.sin((3 * Math.PI) / 4) * 80))
  })

  it('middle items have highest delay (sine peak)', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0' }),
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
      makeEntry({ id: 'e3' }),
      makeEntry({ id: 'e4' }),
    ]

    const delays = computeWaveDelays(entries)

    const d0 = delays.get('e0')!
    const d2 = delays.get('e2')! // middle
    const d4 = delays.get('e4')!

    // Middle item should have higher delay than edges
    expect(d2).toBeGreaterThan(d0)
    expect(d2).toBeGreaterThan(d4)
  })

  it('uses default baseDelay=120 and waveAmplitude=80', () => {
    const entries: AnimationEntry[] = [makeEntry({ id: 'e0' })]
    const delays = computeWaveDelays(entries)
    // sin(0) = 0, so delay = 120
    expect(delays.get('e0')).toBe(120)
  })

  it('single entry gets baseDelay (sin(0) = 0)', () => {
    const entries: AnimationEntry[] = [makeEntry({ id: 'solo' })]
    const delays = computeWaveDelays(entries, 100, 50)
    expect(delays.get('solo')).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Tests: Engine applies stagger delay to WAAPI animate call
// ---------------------------------------------------------------------------

describe('intersection adapter applies stagger delay', () => {
  let originalIO: typeof IntersectionObserver

  beforeEach(() => {
    MockIntersectionObserver.reset()
    originalIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = MockIntersectionObserver as any
  })

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO
  })

  it('passes stagger delay to el.animate options', () => {
    const adapter = createIntersectionAdapter()

    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const el3 = document.createElement('div')
    const mockAnim = createMockAnimation()
    el1.animate = vi.fn(() => mockAnim)
    el2.animate = vi.fn(() => mockAnim)
    el3.animate = vi.fn(() => mockAnim)

    const targets: ResolvedTargets = {
      root: el1,
      item1: el2,
      item2: el3,
    }

    const scene = makeScene({
      trigger: {
        type: 'intersection',
        anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
      } as IntersectionTrigger,
      entries: [
        makeEntry({
          id: 'e0',
          target: { entityType: 'block', entityId: 'b1', part: 'root' },
          staggerGroup: 'sequential',
          staggerDelay: 100,
        }),
        makeEntry({
          id: 'e1',
          target: { entityType: 'block', entityId: 'b1', part: 'item1' },
          staggerGroup: 'sequential',
          staggerDelay: 100,
        }),
        makeEntry({
          id: 'e2',
          target: { entityType: 'block', entityId: 'b1', part: 'item2' },
          staggerGroup: 'sequential',
          staggerDelay: 100,
        }),
      ],
    })

    adapter.setup(scene, targets)
    MockIntersectionObserver.instances[0].simulateIntersection(true)

    // First entry: delay = 0
    const [, opts0] = (el1.animate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts0.delay).toBe(0)

    // Second entry: delay = 100
    const [, opts1] = (el2.animate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts1.delay).toBe(100)

    // Third entry: delay = 200
    const [, opts2] = (el3.animate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts2.delay).toBe(200)
  })

  it('entries without staggerGroup get delay 0 in animate call', () => {
    const adapter = createIntersectionAdapter()

    const el = document.createElement('div')
    const mockAnim = createMockAnimation()
    el.animate = vi.fn(() => mockAnim)

    const targets: ResolvedTargets = { root: el }

    const scene = makeScene({
      entries: [
        makeEntry({ id: 'e0', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      ],
    })

    adapter.setup(scene, targets)
    MockIntersectionObserver.instances[0].simulateIntersection(true)

    const [, opts] = (el.animate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts.delay).toBe(0)
  })

  it('stagger delay is additive with entry position (absolute ms)', () => {
    // Stagger delay comes from the group index. The entry's position.ms is a
    // timeline concern (not yet wired into WAAPI delay), but staggerDelay is
    // always applied. This test verifies stagger delay is computed independently
    // of position.ms.
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'e0', position: { type: 'absolute', ms: 200 }, staggerGroup: 'seq', staggerDelay: 100 }),
      makeEntry({ id: 'e1', position: { type: 'absolute', ms: 400 }, staggerGroup: 'seq', staggerDelay: 100 }),
    ]

    const delays = computeStaggerDelays(entries)

    // Stagger delay is 0 for first, 100 for second — independent of position.ms
    expect(delays.get('e0')).toBe(0)
    expect(delays.get('e1')).toBe(100)
  })
})
