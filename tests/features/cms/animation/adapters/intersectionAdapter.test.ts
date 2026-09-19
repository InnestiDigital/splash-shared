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
  createIntersectionAdapter,
  toWaapiKeyframe,
  toWaapiKeyframes,
} from '~/shared/features/cms/animation/adapters/intersectionAdapter'

// ---------------------------------------------------------------------------
// Mock IntersectionObserver
// ---------------------------------------------------------------------------

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null
  readonly rootMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number>

  callback: IntersectionObserverCallback
  elements: Element[] = []

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.root = options?.root ?? null
    this.thresholds = options?.threshold
      ? Array.isArray(options.threshold) ? options.threshold : [options.threshold]
      : [0]
    MockIntersectionObserver.instances.push(this)
  }

  observe(el: Element) { this.elements.push(el) }
  unobserve(el: Element) { this.elements = this.elements.filter((e) => e !== el) }
  disconnect() { this.elements = [] }
  takeRecords(): IntersectionObserverEntry[] { return [] }

  simulateIntersection(
    isIntersecting: boolean,
    opts: { ratio?: number; height?: number } = {},
  ) {
    const ratio = opts.ratio ?? (isIntersecting ? 1 : 0)
    const entries = this.elements.map((el) => ({
      isIntersecting,
      target: el,
      intersectionRatio: ratio,
      boundingClientRect: { height: opts.height ?? 0 } as DOMRectReadOnly,
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
// Mock Element.animate (WAAPI)
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

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  return {
    id: 'entry-1',
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
    entries: [makeEntry()],
    ...overrides,
  }
}

function makeTargets(): { targets: ResolvedTargets; el: HTMLElement; mockAnim: Animation } {
  const el = document.createElement('div')
  const mockAnim = createMockAnimation()
  el.animate = vi.fn(() => mockAnim)
  return { targets: { root: el }, el, mockAnim }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('intersectionAdapter', () => {
  let originalIO: typeof IntersectionObserver

  beforeEach(() => {
    MockIntersectionObserver.reset()
    originalIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = MockIntersectionObserver as any
  })

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO
  })

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------

  describe('canHandle', () => {
    const adapter = createIntersectionAdapter()

    it('returns true for intersection trigger', () => {
      const scene = makeScene()
      expect(adapter.canHandle(scene)).toBe(true)
    })

    it('returns false for scroll trigger', () => {
      const scene = makeScene({
        trigger: {
          type: 'scroll',
          anchor: 'viewport',
          start: { edge: 'top', viewport: 0.85 },
        },
      })
      expect(adapter.canHandle(scene)).toBe(false)
    })

    it('returns false for event trigger', () => {
      const scene = makeScene({
        trigger: {
          type: 'event',
          event: 'click',
          source: 'page',
        },
      })
      expect(adapter.canHandle(scene)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // setup + IntersectionObserver creation
  // -----------------------------------------------------------------------

  describe('setup', () => {
    it('creates IntersectionObserver watching anchor element', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)

      expect(instance.id).toBe('intersection-scene-1')
      expect(instance.adapterName).toBe('intersection')
      expect(MockIntersectionObserver.instances).toHaveLength(1)

      const observer = MockIntersectionObserver.instances[0]
      expect(observer.elements).toContain(el)
    })

    it('passes threshold from trigger config', () => {
      const adapter = createIntersectionAdapter()
      const { targets } = makeTargets()
      const scene = makeScene({
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
          threshold: 0.5,
        } as IntersectionTrigger,
      })

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      // Observed at [0, configured]: the 0 crossing lets a viewport-taller
      // anchor (whose ratio can never reach the configured threshold) still
      // trigger, while normal anchors fire at the configured value.
      expect(observer.thresholds).toEqual([0, 0.5])
    })

    it('returns instance even when anchor element missing', () => {
      const adapter = createIntersectionAdapter()
      const scene = makeScene()

      const instance = adapter.setup(scene, {})
      expect(instance.id).toBe('intersection-scene-1')
      expect(MockIntersectionObserver.instances).toHaveLength(0)
    })

    it('uses motionHints.intersectionRoot as IO root when provided', () => {
      const adapter = createIntersectionAdapter()
      const { targets } = makeTargets()
      const scene = makeScene()
      const mockRoot = document.createElement('div')

      adapter.setup(scene, targets, { intersectionRoot: mockRoot })

      const observer = MockIntersectionObserver.instances[0]
      expect(observer.root).toBe(mockRoot)
    })

    it('creates IO with no root when motionHints.intersectionRoot is absent', () => {
      const adapter = createIntersectionAdapter()
      const { targets } = makeTargets()
      const scene = makeScene()

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      expect(observer.root).toBeNull()
    })

    it('creates IO with no root when motionHints is provided but intersectionRoot is absent', () => {
      const adapter = createIntersectionAdapter()
      const { targets } = makeTargets()
      const scene = makeScene()

      adapter.setup(scene, targets, { prefersLayerPromotion: ['root'] })

      const observer = MockIntersectionObserver.instances[0]
      expect(observer.root).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Observer triggers WAAPI animation
  // -----------------------------------------------------------------------

  describe('intersection triggers animation', () => {
    it('plays WAAPI animation on intersection', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el, mockAnim } = makeTargets()
      const scene = makeScene()

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      observer.simulateIntersection(true)

      expect(el.animate).toHaveBeenCalledTimes(1)
      const [keyframes, options] = (el.animate as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(keyframes).toEqual([
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ])
      expect(options).toMatchObject({
        duration: 500,
        easing: 'cubic-bezier(.25,.1,.25,1)',
        // 'both': staggered entries must hold the first keyframe during their
        // delay (fill 'forwards' flashed them visible before the delay ran).
        fill: 'both',
      })
    })

    it('does not play animation when not intersecting', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene()

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      observer.simulateIntersection(false)

      expect(el.animate).not.toHaveBeenCalled()
    })

    it('uses entry-level duration and easing when provided', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene({
        entries: [makeEntry({ duration: 300, easing: 'ease-in' })],
      })

      adapter.setup(scene, targets)
      MockIntersectionObserver.instances[0].simulateIntersection(true)

      const [, options] = (el.animate as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(options.duration).toBe(300)
      expect(options.easing).toBe('ease-in')
    })
  })

  // -----------------------------------------------------------------------
  // tall-anchor guard (entrance-tall-sections)
  // -----------------------------------------------------------------------

  describe('tall anchor below configured threshold', () => {
    const tallScene = () => makeScene({
      trigger: {
        type: 'intersection',
        anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
        threshold: 0.15,
      } as IntersectionTrigger,
    })

    it('plays when anchor is taller than 70% of viewport even if ratio < threshold', () => {
      window.innerHeight = 900
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()

      adapter.setup(tallScene(), targets)
      // ratio 0.14 < 0.15, but a 6000px anchor can never reach 0.15 at 900px vh.
      MockIntersectionObserver.instances[0].simulateIntersection(true, { ratio: 0.14, height: 6000 })

      expect(el.animate).toHaveBeenCalledTimes(1)
    })

    it('does NOT play a normal-sized anchor whose ratio is below threshold', () => {
      window.innerHeight = 900
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()

      adapter.setup(tallScene(), targets)
      // Normal 300px element reporting the 0-crossing (ratio 0.02 < 0.15): must
      // wait for the real threshold crossing, so timing is unchanged.
      MockIntersectionObserver.instances[0].simulateIntersection(true, { ratio: 0.02, height: 300 })

      expect(el.animate).not.toHaveBeenCalled()

      // Later, when it crosses the configured threshold, it plays.
      MockIntersectionObserver.instances[0].simulateIntersection(true, { ratio: 0.2, height: 300 })
      expect(el.animate).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // once flag
  // -----------------------------------------------------------------------

  describe('once flag', () => {
    it('unobserves after first trigger when once=true', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene({
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
          once: true,
        } as IntersectionTrigger,
      })

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      expect(observer.elements).toContain(el)

      observer.simulateIntersection(true)

      // After first intersection, element should be unobserved
      expect(observer.elements).not.toContain(el)
    })

    it('keeps observing when once is not set', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene()

      adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      observer.simulateIntersection(true)

      // Element should still be observed
      expect(observer.elements).toContain(el)
    })
  })

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------

  describe('destroy', () => {
    it('disconnects observer and cancels animations', () => {
      const adapter = createIntersectionAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)

      const observer = MockIntersectionObserver.instances[0]
      const disconnectSpy = vi.spyOn(observer, 'disconnect')

      // Trigger animation so there's something to cancel
      observer.simulateIntersection(true)

      adapter.destroy(instance)

      expect(disconnectSpy).toHaveBeenCalled()
      expect(mockAnim.cancel).toHaveBeenCalled()
    })

    it('handles destroy when no observer was created', () => {
      const adapter = createIntersectionAdapter()
      const scene = makeScene()

      const instance = adapter.setup(scene, {})
      // Should not throw
      adapter.destroy(instance)
    })

    it('handles destroy for unknown instance', () => {
      const adapter = createIntersectionAdapter()
      // Should not throw
      adapter.destroy({ id: 'nonexistent', adapterName: 'intersection' })
    })
  })

  // -----------------------------------------------------------------------
  // play / pause
  // -----------------------------------------------------------------------

  describe('play', () => {
    it('triggers fresh playback when no animations exist', () => {
      const adapter = createIntersectionAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)
      adapter.play(instance)

      expect(el.animate).toHaveBeenCalledTimes(1)
    })

    it('replays existing animations', () => {
      const adapter = createIntersectionAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)

      // First trigger via observer
      MockIntersectionObserver.instances[0].simulateIntersection(true)

      // Then manual play
      adapter.play(instance)
      expect(mockAnim.play).toHaveBeenCalled()
    })
  })

  describe('pause', () => {
    it('pauses running animations', () => {
      const adapter = createIntersectionAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)
      MockIntersectionObserver.instances[0].simulateIntersection(true)

      adapter.pause(instance)
      expect(mockAnim.pause).toHaveBeenCalled()
    })
  })

  describe('scrub', () => {
    it('is a no-op', () => {
      const adapter = createIntersectionAdapter()
      const { targets } = makeTargets()
      const scene = makeScene()

      const instance = adapter.setup(scene, targets)
      // Should not throw
      adapter.scrub(instance, 0.5)
    })
  })
})

// ---------------------------------------------------------------------------
// WAAPI keyframe conversion
// ---------------------------------------------------------------------------

describe('toWaapiKeyframe', () => {
  it('converts opacity', () => {
    const result = toWaapiKeyframe({ offset: 0, opacity: 0.5 })
    expect(result).toEqual({ offset: 0, opacity: 0.5 })
  })

  it('converts transform properties to composed string', () => {
    const result = toWaapiKeyframe({
      offset: 0,
      transform: { x: '10px', y: '20px', scale: 0.5, rotate: '45deg' },
    })
    expect(result).toEqual({
      offset: 0,
      transform: 'translateX(10px) translateY(20px) scale(0.5) rotate(45deg)',
    })
  })

  it('converts partial transform (only x and scale)', () => {
    const result = toWaapiKeyframe({
      offset: 0.5,
      transform: { x: '-20px', scale: 1.2 },
    })
    expect(result).toEqual({
      offset: 0.5,
      transform: 'translateX(-20px) scale(1.2)',
    })
  })

  it('converts blur to filter', () => {
    const result = toWaapiKeyframe({ offset: 0, blur: '4px' })
    expect(result).toEqual({ offset: 0, filter: 'blur(4px)' })
  })

  it('converts clipPath', () => {
    const result = toWaapiKeyframe({ offset: 1, clipPath: 'inset(0)' })
    expect(result).toEqual({ offset: 1, clipPath: 'inset(0)' })
  })

  it('handles all properties combined', () => {
    const result = toWaapiKeyframe({
      offset: 0,
      opacity: 0,
      transform: { y: '30px' },
      blur: '2px',
      clipPath: 'inset(10%)',
    })
    expect(result).toEqual({
      offset: 0,
      opacity: 0,
      transform: 'translateY(30px)',
      filter: 'blur(2px)',
      clipPath: 'inset(10%)',
    })
  })

  it('handles empty keyframe (offset only)', () => {
    const result = toWaapiKeyframe({ offset: 0.5 })
    expect(result).toEqual({ offset: 0.5 })
  })

  it('does not add transform key for empty transform object', () => {
    const result = toWaapiKeyframe({ offset: 0, transform: {} })
    expect(result).toEqual({ offset: 0 })
    expect(result).not.toHaveProperty('transform')
  })
})

describe('toWaapiKeyframes', () => {
  it('converts array of keyframes', () => {
    const result = toWaapiKeyframes([
      { offset: 0, opacity: 0, transform: { y: '20px' } },
      { offset: 1, opacity: 1, transform: { y: '0px' } },
    ])
    expect(result).toEqual([
      { offset: 0, opacity: 0, transform: 'translateY(20px)' },
      { offset: 1, opacity: 1, transform: 'translateY(0px)' },
    ])
  })

  it('handles empty array', () => {
    expect(toWaapiKeyframes([])).toEqual([])
  })
})
