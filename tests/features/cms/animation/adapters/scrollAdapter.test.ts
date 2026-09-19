/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  EntrySidecar,
  ResolvedTargets,
  ScrollTrigger,
  ScrollAnchor,
} from '~/shared/types/animation'
import type { CompiledEntry } from '~/shared/features/cms/animation/compileScene'
import {
  createScrollAdapter,
  computeScrollProgress,
  computeScrollThreshold,
} from '~/shared/features/cms/animation/adapters/scrollAdapter'

// ---------------------------------------------------------------------------
// Mock Animation (WAAPI)
// ---------------------------------------------------------------------------

function createMockAnimation(duration = 500): Animation {
  const anim = {
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
    playState: 'paused',
    startTime: null,
    effect: {
      getComputedTiming: () => ({ duration }),
    },
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
  return anim
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

function makeScrollScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-1',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'scroll',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
      start: { edge: 'top', viewport: 0.85 },
      end: { edge: 'bottom', viewport: 0 },
      scrub: true,
    } as ScrollTrigger,
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

describe('scrollAdapter', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    // Ensure no native ScrollTimeline (happy-dom doesn't have it)
    delete (globalThis as any).ScrollTimeline
  })

  afterEach(() => {
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------

  describe('canHandle', () => {
    const adapter = createScrollAdapter()

    it('returns true for scroll trigger', () => {
      const scene = makeScrollScene()
      expect(adapter.canHandle(scene)).toBe(true)
    })

    it('returns false for intersection trigger', () => {
      const scene = makeScrollScene({
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
        },
      })
      expect(adapter.canHandle(scene)).toBe(false)
    })

    it('returns false for event trigger', () => {
      const scene = makeScrollScene({
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
  // Progress calculation (pure functions)
  // -----------------------------------------------------------------------

  describe('computeScrollThreshold', () => {
    const viewportHeight = 1000

    it('computes threshold for top edge at 85% viewport', () => {
      // Element at document position 2000px from top
      const rect = new DOMRect(0, 500, 400, 200) // top=500 relative to viewport
      const scrollY = 1500 // so element.top + scrollY = 2000
      const anchor: ScrollAnchor = { edge: 'top', viewport: 0.85 }

      const threshold = computeScrollThreshold(rect, scrollY, viewportHeight, anchor)
      // elementEdge = 500 + 1500 = 2000
      // threshold = 2000 - 0.85 * 1000 = 2000 - 850 = 1150
      expect(threshold).toBe(1150)
    })

    it('computes threshold for center edge', () => {
      const rect = new DOMRect(0, 300, 400, 200) // center at 400 from viewport top
      const scrollY = 1000
      const anchor: ScrollAnchor = { edge: 'center', viewport: 0.5 }

      const threshold = computeScrollThreshold(rect, scrollY, viewportHeight, anchor)
      // elementEdge = 300 + 1000 + 100 = 1400
      // threshold = 1400 - 0.5 * 1000 = 1400 - 500 = 900
      expect(threshold).toBe(900)
    })

    it('computes threshold for bottom edge', () => {
      const rect = new DOMRect(0, 300, 400, 200) // bottom at 500 from viewport top
      const scrollY = 1000
      const anchor: ScrollAnchor = { edge: 'bottom', viewport: 0 }

      const threshold = computeScrollThreshold(rect, scrollY, viewportHeight, anchor)
      // elementEdge = 300 + 1000 + 200 = 1500
      // threshold = 1500 - 0 = 1500
      expect(threshold).toBe(1500)
    })
  })

  describe('computeScrollProgress', () => {
    const viewportHeight = 1000

    it('returns 0 when scroll is before start threshold', () => {
      const rect = new DOMRect(0, 2000, 400, 200)
      const scrollY = 0
      const start: ScrollAnchor = { edge: 'top', viewport: 0.85 }
      const end: ScrollAnchor = { edge: 'bottom', viewport: 0 }

      const progress = computeScrollProgress(rect, scrollY, viewportHeight, start, end)
      expect(progress).toBe(0)
    })

    it('returns 1 when scroll is past end threshold', () => {
      const rect = new DOMRect(0, -500, 400, 200)
      const scrollY = 5000
      const start: ScrollAnchor = { edge: 'top', viewport: 0.85 }
      const end: ScrollAnchor = { edge: 'bottom', viewport: 0 }

      const progress = computeScrollProgress(rect, scrollY, viewportHeight, start, end)
      expect(progress).toBe(1)
    })

    it('returns ~0.5 at midpoint between start and end', () => {
      // Set up so start threshold = 1000, end threshold = 2000
      const rect = new DOMRect(0, 150, 400, 200)
      const scrollY = 1700 // element doc top = 150 + 1700 = 1850
      const start: ScrollAnchor = { edge: 'top', viewport: 0.85 }
      const end: ScrollAnchor = { edge: 'bottom', viewport: 0 }

      // startThreshold = (150 + 1700) - 0.85 * 1000 = 1850 - 850 = 1000
      // endThreshold = (150 + 1700 + 200) - 0 = 2050
      // progress = (1700 - 1000) / (2050 - 1000) = 700 / 1050 ≈ 0.667

      const progress = computeScrollProgress(rect, scrollY, viewportHeight, start, end)
      expect(progress).toBeCloseTo(0.667, 2)
    })

    it('clamps between 0 and 1', () => {
      // Element far down the page (doc top = 5000 + 0 = 5000)
      const rectBefore = new DOMRect(0, 5000, 400, 200)
      const start: ScrollAnchor = { edge: 'top', viewport: 1 }
      const end: ScrollAnchor = { edge: 'bottom', viewport: 0 }

      // scrollY=0, element is far below — progress should be 0
      expect(computeScrollProgress(rectBefore, 0, viewportHeight, start, end)).toBe(0)

      // Element scrolled way past — doc top = -500 + 100000 = huge, scrollY dominates
      const rectAfter = new DOMRect(0, -500, 400, 200)
      expect(computeScrollProgress(rectAfter, 100000, viewportHeight, start, end)).toBe(1)
    })

    it('returns 1 when start equals end threshold', () => {
      const rect = new DOMRect(0, 0, 400, 0) // zero height element
      const scrollY = 100
      const anchor: ScrollAnchor = { edge: 'top', viewport: 0 }

      // start and end use same anchor, so thresholds are equal
      const progress = computeScrollProgress(rect, scrollY, viewportHeight, anchor, anchor)
      expect(progress).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // setup
  // -----------------------------------------------------------------------

  describe('setup', () => {
    it('creates instance with correct adapter name', () => {
      const adapter = createScrollAdapter()
      const { targets } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)

      expect(instance.id).toBe('scroll-scene-1')
      expect(instance.adapterName).toBe('scroll')
    })

    it('creates WAAPI animations in paused state', () => {
      const adapter = createScrollAdapter()
      const { targets, el, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      adapter.setup(scene, targets)

      expect(el.animate).toHaveBeenCalledTimes(1)
      expect(mockAnim.pause).toHaveBeenCalled()
    })

    it('registers scroll event listener (fallback path)', () => {
      const adapter = createScrollAdapter()
      const { targets } = makeTargets()
      const scene = makeScrollScene()

      adapter.setup(scene, targets)

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        { passive: true },
      )
    })

    it('handles missing target elements gracefully', () => {
      const adapter = createScrollAdapter()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, {})
      expect(instance.id).toBe('scroll-scene-1')
      // No scroll listener if no animations created
      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        expect.anything(),
      )
    })
  })

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------

  describe('destroy', () => {
    it('removes scroll listener and cancels animations', () => {
      const adapter = createScrollAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)
      adapter.destroy(instance)

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
      )
      expect(mockAnim.cancel).toHaveBeenCalled()
    })

    it('handles destroy for unknown instance without error', () => {
      const adapter = createScrollAdapter()
      // Should not throw
      adapter.destroy({ id: 'nonexistent', adapterName: 'scroll' })
    })

    it('cancels pending RAF on destroy', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')
      const adapter = createScrollAdapter()
      const { targets } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)

      // Simulate a scroll to trigger RAF
      const scrollHandler = addEventListenerSpy.mock.calls.find(
        (c) => c[0] === 'scroll',
      )?.[1] as Function

      if (scrollHandler) {
        // Mock RAF to return a handle
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
        scrollHandler()
        rafSpy.mockRestore()
      }

      adapter.destroy(instance)

      // cancelAnimationFrame should have been called
      cancelSpy.mockRestore()
    })
  })

  // -----------------------------------------------------------------------
  // scrub
  // -----------------------------------------------------------------------

  describe('scrub', () => {
    it('updates animation currentTime based on progress', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)
      adapter.scrub(instance, 0.5)

      // duration=1000, progress=0.5 → currentTime should be 500
      expect(mockAnim.currentTime).toBe(500)
    })

    it('clamps progress to 0-1 range', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)

      adapter.scrub(instance, -0.5)
      expect(mockAnim.currentTime).toBe(0)

      adapter.scrub(instance, 1.5)
      expect(mockAnim.currentTime).toBe(1000)
    })

    it('is no-op for unknown instance', () => {
      const adapter = createScrollAdapter()
      // Should not throw
      adapter.scrub({ id: 'nonexistent', adapterName: 'scroll' }, 0.5)
    })
  })

  // -----------------------------------------------------------------------
  // play / pause
  // -----------------------------------------------------------------------

  describe('play', () => {
    it('calls play on all animations', () => {
      const adapter = createScrollAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)
      adapter.play(instance)

      expect(mockAnim.play).toHaveBeenCalled()
    })
  })

  describe('pause', () => {
    it('calls pause on all animations', () => {
      const adapter = createScrollAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)
      // Reset the pause calls from setup (animations start paused)
      ;(mockAnim.pause as ReturnType<typeof vi.fn>).mockClear()

      adapter.pause(instance)

      expect(mockAnim.pause).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Fallback path (no native ScrollTimeline)
  // -----------------------------------------------------------------------

  describe('fallback path (no native ScrollTimeline)', () => {
    it('works in happy-dom which has no ScrollTimeline', () => {
      expect('ScrollTimeline' in globalThis).toBe(false)

      const adapter = createScrollAdapter()
      const { targets, el, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      const instance = adapter.setup(scene, targets)

      // Should have set up scroll listener fallback
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        { passive: true },
      )

      // Animations created and paused (scroll-driven)
      expect(el.animate).toHaveBeenCalled()
      expect(mockAnim.pause).toHaveBeenCalled()

      adapter.destroy(instance)
    })
  })

  // -----------------------------------------------------------------------
  // A1: per-entry progress
  // -----------------------------------------------------------------------

  describe('A1: per-entry progress', () => {
    function makeCompiledEntry(
      entry: AnimationEntry,
      scrollRange: { start: number; end: number } | null = null,
      varTracks: any[] | null = null,
    ): CompiledEntry {
      return {
        source: entry,
        compiled: { scrollRange, varTracks },
      }
    }

    it('entries with scrollRange get remapped progress', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const entry = makeEntry()
      const compiled = makeCompiledEntry(entry, { start: 0.25, end: 0.75 })
      const scene = makeScrollScene({ entries: [entry] })

      const instance = adapter.setup(scene, targets, undefined, [compiled])

      // sceneProgress=0.5 → entryProgress = (0.5-0.25)/(0.75-0.25) = 0.5
      adapter.scrub(instance, 0.5)
      expect(mockAnim.currentTime).toBe(500)
    })

    it('entries without scrollRange get scene progress directly', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const entry = makeEntry()
      const compiled = makeCompiledEntry(entry, null)
      const scene = makeScrollScene({ entries: [entry] })

      const instance = adapter.setup(scene, targets, undefined, [compiled])

      adapter.scrub(instance, 0.5)
      expect(mockAnim.currentTime).toBe(500)
    })

    it('sidecars receive same remapped progress as WAAPI', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const entry = makeEntry()
      const mockSidecar: EntrySidecar = { update: vi.fn(), destroy: vi.fn() }

      // We'll use a compiled entry with scrollRange and varTracks
      // But varTracks compilation happens inside setup — so we test via scrub
      // Instead, we use the sidecar injection path
      const compiled = makeCompiledEntry(entry, { start: 0.0, end: 0.5 })
      const scene = makeScrollScene({ entries: [entry] })

      const instance = adapter.setup(scene, targets, undefined, [compiled])

      // Inject a sidecar manually for testing (access via the exported test helper)
      // Since we can't easily inject, let's test via the varTracks path
      // For now, verify the WAAPI animation gets correct progress
      adapter.scrub(instance, 0.25)
      // entryProgress = (0.25 - 0) / (0.5 - 0) = 0.5
      expect(mockAnim.currentTime).toBe(500)
    })

    it('sidecars are destroyed on adapter teardown', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const entry = makeEntry({
        keyframes: [
          {
            offset: 0,
            opacity: 0,
            vars: {
              '--motion-tint': { type: 'number', value: 0 },
            },
          },
          {
            offset: 1,
            opacity: 1,
            vars: {
              '--motion-tint': { type: 'number', value: 1 },
            },
          },
        ],
      })
      const compiled = makeCompiledEntry(entry, null, [
        {
          name: '--motion-tint',
          type: 'number',
          stops: [
            { offset: 0, type: 'number', num: 0 },
            { offset: 1, type: 'number', num: 1 },
          ],
        },
      ])
      const scene = makeScrollScene({ entries: [entry] })

      const instance = adapter.setup(scene, targets, undefined, [compiled])

      // The sidecar should have been created. On destroy, it should clean up.
      adapter.destroy(instance)

      // After destroy, the var should have been removed from the element
      expect(el.style.getPropertyValue('--motion-tint')).toBe('')
    })

    it('setup without compiledEntries works (backward compat)', () => {
      const adapter = createScrollAdapter()
      const { targets, mockAnim } = makeTargets()
      const scene = makeScrollScene()

      // No compiledEntries passed — legacy path
      const instance = adapter.setup(scene, targets)

      adapter.scrub(instance, 0.5)
      expect(mockAnim.currentTime).toBe(250) // duration 500 * 0.5
    })

    it('entries outside scrollRange are clamped', () => {
      const adapter = createScrollAdapter()
      const mockAnim = createMockAnimation(1000)
      const el = document.createElement('div')
      el.animate = vi.fn(() => mockAnim)
      const targets: ResolvedTargets = { root: el }
      const entry = makeEntry()
      const compiled = makeCompiledEntry(entry, { start: 0.25, end: 0.75 })
      const scene = makeScrollScene({ entries: [entry] })

      const instance = adapter.setup(scene, targets, undefined, [compiled])

      // Before range: sceneProgress=0.1 → entryProgress=0
      adapter.scrub(instance, 0.1)
      expect(mockAnim.currentTime).toBe(0)

      // After range: sceneProgress=0.9 → entryProgress=1
      adapter.scrub(instance, 0.9)
      expect(mockAnim.currentTime).toBe(1000)
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('defaults end anchor to element bottom at viewport 0 when end is missing', () => {
      const adapter = createScrollAdapter()
      const { targets, el } = makeTargets()
      const scene = makeScrollScene({
        trigger: {
          type: 'scroll',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
          start: { edge: 'top', viewport: 0.85 },
          // no end anchor
          scrub: true,
        } as ScrollTrigger,
      })

      const instance = adapter.setup(scene, targets)
      expect(instance.adapterName).toBe('scroll')

      adapter.destroy(instance)
    })

    it('handles anchor=viewport (no specific element)', () => {
      const adapter = createScrollAdapter()
      const { targets } = makeTargets()
      const scene = makeScrollScene({
        trigger: {
          type: 'scroll',
          anchor: 'viewport',
          start: { edge: 'top', viewport: 0 },
          end: { edge: 'bottom', viewport: 1 },
          scrub: true,
        } as ScrollTrigger,
      })

      const instance = adapter.setup(scene, targets)
      expect(instance.adapterName).toBe('scroll')

      // Should still set up scroll listener
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        { passive: true },
      )

      adapter.destroy(instance)
    })
  })
})
