/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  ResolvedTargets,
  ScrollTrigger,
} from '~/shared/types/animation'
import {
  createScrollAdapter,
  applyPinStyles,
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

function makePinScene(pinValue: boolean): AnimationScene {
  return {
    id: 'scene-pin',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'scroll',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
      start: { edge: 'top', viewport: 0.85 },
      end: { edge: 'bottom', viewport: 0 },
      scrub: true,
      pin: pinValue,
    } as ScrollTrigger,
    entries: [makeEntry()],
  }
}

function makeTargets(): { targets: ResolvedTargets; el: HTMLElement; mockAnim: Animation } {
  const el = document.createElement('div')
  const mockAnim = createMockAnimation()
  el.animate = vi.fn(() => mockAnim)
  // Provide a parent element for pin styles (parent min-height)
  const parent = document.createElement('section')
  parent.appendChild(el)
  document.body.appendChild(parent)
  return { targets: { root: el }, el, mockAnim }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scrollAdapter pinning', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    delete (globalThis as any).ScrollTimeline
  })

  afterEach(() => {
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
    // Clean up DOM
    document.body.innerHTML = ''
  })

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------

  it('canHandle returns true for pin:true scroll scenes', () => {
    const adapter = createScrollAdapter()
    const scene = makePinScene(true)
    expect(adapter.canHandle(scene)).toBe(true)
  })

  // -----------------------------------------------------------------------
  // applyPinStyles
  // -----------------------------------------------------------------------

  it('pin applies sticky positioning to anchor element', () => {
    const el = document.createElement('div')
    const parent = document.createElement('section')
    parent.appendChild(el)
    document.body.appendChild(parent)

    // Mock getBoundingClientRect for height calculation
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 300),
    )

    applyPinStyles(el, 800)

    expect(el.style.position).toBe('sticky')
    expect(el.style.top).toBe('0px')
    expect(el.style.zIndex).toBe('10')
    // Parent min-height = element height (300) + scrollRange (800) = 1100
    expect(parent.style.minHeight).toBe('1100px')
  })

  it('pin cleanup restores original styles', () => {
    const el = document.createElement('div')
    const parent = document.createElement('section')
    parent.appendChild(el)
    document.body.appendChild(parent)

    // Set original styles
    el.style.position = 'relative'
    el.style.top = '10px'
    el.style.zIndex = '5'
    parent.style.minHeight = '200px'

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 300),
    )

    const cleanup = applyPinStyles(el, 800)

    // Verify pin styles applied
    expect(el.style.position).toBe('sticky')
    expect(el.style.top).toBe('0px')
    expect(el.style.zIndex).toBe('10')

    // Cleanup
    cleanup()

    expect(el.style.position).toBe('relative')
    expect(el.style.top).toBe('10px')
    expect(el.style.zIndex).toBe('5')
    expect(parent.style.minHeight).toBe('200px')
  })

  // -----------------------------------------------------------------------
  // Scrub progress within pinned range
  // -----------------------------------------------------------------------

  it('scrub progress works within pinned range', () => {
    const adapter = createScrollAdapter()
    const { targets, mockAnim } = makeTargets()
    const scene = makePinScene(true)

    const instance = adapter.setup(scene, targets)

    // Manually scrub to 0.5
    adapter.scrub(instance, 0.5)

    // duration=500 (from mock), progress=0.5 → currentTime=250
    expect(mockAnim.currentTime).toBe(250)

    adapter.destroy(instance)
  })

  // -----------------------------------------------------------------------
  // pin:false (default) doesn't apply sticky styles
  // -----------------------------------------------------------------------

  it('pin false does not apply sticky styles', () => {
    const adapter = createScrollAdapter()
    const el = document.createElement('div')
    const parent = document.createElement('section')
    parent.appendChild(el)
    document.body.appendChild(parent)

    const mockAnim = createMockAnimation()
    el.animate = vi.fn(() => mockAnim)

    el.style.position = 'relative'

    const scene = makePinScene(false)
    const targets: ResolvedTargets = { root: el }

    const instance = adapter.setup(scene, targets)

    // Position should remain unchanged — no sticky applied
    expect(el.style.position).toBe('relative')

    adapter.destroy(instance)
  })

  // -----------------------------------------------------------------------
  // Destroy cleans up pin styles
  // -----------------------------------------------------------------------

  it('destroy removes sticky positioning from pinned element', () => {
    const adapter = createScrollAdapter()
    const { targets, el } = makeTargets()

    el.style.position = 'relative'
    el.style.top = '5px'
    el.style.zIndex = '1'

    const scene = makePinScene(true)
    const instance = adapter.setup(scene, targets)

    // Pin styles applied
    expect(el.style.position).toBe('sticky')

    adapter.destroy(instance)

    // Restored to originals
    expect(el.style.position).toBe('relative')
    expect(el.style.top).toBe('5px')
    expect(el.style.zIndex).toBe('1')
  })
})
