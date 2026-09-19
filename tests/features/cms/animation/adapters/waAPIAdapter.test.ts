/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  EventTrigger,
  ResolvedTargets,
} from '~/shared/types/animation'
import { createWAAPIAdapter } from '~/shared/features/cms/animation/adapters/waAPIAdapter'
import { composeTransform, toWAAPIKeyframes } from '~/shared/features/cms/animation/adapters/keyframeUtils'

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

function makeEventScene(
  event: 'load' | 'click' | 'hover',
  overrides: Partial<AnimationScene> = {},
): AnimationScene {
  return {
    id: 'scene-1',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'event',
      event,
      source: { entityType: 'block', entityId: 'b1', part: 'root' },
    } as EventTrigger,
    entries: [makeEntry()],
    ...overrides,
  }
}

/** Create a mock HTMLElement with a working animate() stub */
function makeMockElement(tag = 'div'): HTMLElement {
  const el = document.createElement(tag)

  const mockAnimation: Partial<Animation> = {
    play: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    currentTime: 0,
    effect: {
      getComputedTiming: () => ({ duration: 500 }),
    } as any,
  }

  el.animate = vi.fn(() => mockAnimation as Animation)
  return el
}

function makeTargets(el: HTMLElement): ResolvedTargets {
  return { 'b1:root': el }
}

// ---------------------------------------------------------------------------
// canHandle
// ---------------------------------------------------------------------------

describe('createWAAPIAdapter', () => {
  const adapter = createWAAPIAdapter()

  describe('canHandle', () => {
    it('returns true for event trigger', () => {
      const scene = makeEventScene('load')
      expect(adapter.canHandle(scene)).toBe(true)
    })

    it('returns false for intersection trigger', () => {
      const scene: AnimationScene = {
        id: 'scene-1',
        pageId: 'page-1',
        versionId: 'v-1',
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
        },
        entries: [],
      }
      expect(adapter.canHandle(scene)).toBe(false)
    })

    it('returns false for scroll trigger', () => {
      const scene: AnimationScene = {
        id: 'scene-1',
        pageId: 'page-1',
        versionId: 'v-1',
        trigger: {
          type: 'scroll',
          anchor: 'viewport',
          start: { edge: 'top', viewport: 0 },
        },
        entries: [],
      }
      expect(adapter.canHandle(scene)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // load trigger
  // ---------------------------------------------------------------------------

  describe('load trigger', () => {
    it('plays immediately on setup', () => {
      const el = makeMockElement()
      const scene = makeEventScene('load')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      expect(el.animate).toHaveBeenCalledTimes(1)
      expect(el.animate).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ fill: 'forwards' }),
      )

      adapter.destroy(instance)
    })
  })

  // ---------------------------------------------------------------------------
  // click trigger
  // ---------------------------------------------------------------------------

  describe('click trigger', () => {
    it('adds click listener and plays on click', () => {
      const el = makeMockElement()
      const scene = makeEventScene('click')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      // Not yet animated
      expect(el.animate).not.toHaveBeenCalled()

      // Simulate click
      el.dispatchEvent(new Event('click'))

      expect(el.animate).toHaveBeenCalledTimes(1)

      adapter.destroy(instance)
    })

    it('click with once=true removes listener after first trigger', () => {
      const el = makeMockElement()
      const scene = makeEventScene('click', {
        trigger: {
          type: 'event',
          event: 'click',
          source: { entityType: 'block', entityId: 'b1', part: 'root' },
          once: true,
        },
      })
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      // First click plays
      el.dispatchEvent(new Event('click'))
      expect(el.animate).toHaveBeenCalledTimes(1)

      // Second click should NOT re-trigger
      el.dispatchEvent(new Event('click'))
      // The animation for the second click should still only be 1 call
      // (the cancel + re-animate from first click = 1 call total since once prevents re-fire)
      expect(el.animate).toHaveBeenCalledTimes(1)

      adapter.destroy(instance)
    })
  })

  // ---------------------------------------------------------------------------
  // hover trigger
  // ---------------------------------------------------------------------------

  describe('hover trigger', () => {
    let originalMatchMedia: typeof window.matchMedia

    beforeEach(() => {
      originalMatchMedia = window.matchMedia
      // Default: fine pointer (desktop)
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
    })

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    it('adds mouseenter/mouseleave listeners', () => {
      const el = makeMockElement()
      const scene = makeEventScene('hover')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      expect(el.animate).not.toHaveBeenCalled()

      el.dispatchEvent(new Event('mouseenter'))
      expect(el.animate).toHaveBeenCalledTimes(1)

      el.dispatchEvent(new Event('mouseleave'))
      expect(el.animate).toHaveBeenCalledTimes(2)

      adapter.destroy(instance)
    })

    it('adds focusin/focusout for interactive elements (accessibility)', () => {
      const el = makeMockElement('button')
      const scene = makeEventScene('hover')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      el.dispatchEvent(new Event('focusin'))
      expect(el.animate).toHaveBeenCalledTimes(1)

      el.dispatchEvent(new Event('focusout'))
      expect(el.animate).toHaveBeenCalledTimes(2)

      adapter.destroy(instance)
    })

    it('disabled on pointer:coarse devices', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any

      const el = makeMockElement()
      const scene = makeEventScene('hover')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      el.dispatchEvent(new Event('mouseenter'))
      // Should NOT animate on coarse pointer
      expect(el.animate).not.toHaveBeenCalled()

      adapter.destroy(instance)
    })
  })

  // ---------------------------------------------------------------------------
  // destroy
  // ---------------------------------------------------------------------------

  describe('destroy', () => {
    it('removes all event listeners and cancels animations', () => {
      const el = makeMockElement()
      const scene = makeEventScene('click')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)

      // Trigger to create an animation
      el.dispatchEvent(new Event('click'))
      expect(el.animate).toHaveBeenCalledTimes(1)

      const mockAnim = (el.animate as ReturnType<typeof vi.fn>).mock.results[0].value

      adapter.destroy(instance)

      expect(mockAnim.cancel).toHaveBeenCalled()

      // After destroy, clicking should not trigger new animations
      el.dispatchEvent(new Event('click'))
      // Still only 1 call (the one before destroy)
      expect(el.animate).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // play / pause
  // ---------------------------------------------------------------------------

  describe('play', () => {
    it('calls play on all stored animations', () => {
      const el = makeMockElement()
      const scene = makeEventScene('load')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)
      const mockAnim = (el.animate as ReturnType<typeof vi.fn>).mock.results[0].value

      adapter.play(instance)
      expect(mockAnim.play).toHaveBeenCalled()

      adapter.destroy(instance)
    })
  })

  describe('pause', () => {
    it('calls pause on all stored animations', () => {
      const el = makeMockElement()
      const scene = makeEventScene('load')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)
      const mockAnim = (el.animate as ReturnType<typeof vi.fn>).mock.results[0].value

      adapter.pause(instance)
      expect(mockAnim.pause).toHaveBeenCalled()

      adapter.destroy(instance)
    })
  })

  // ---------------------------------------------------------------------------
  // scrub
  // ---------------------------------------------------------------------------

  describe('scrub', () => {
    it('seeks animations to correct progress', () => {
      const el = makeMockElement()
      const scene = makeEventScene('load')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)
      const mockAnim = (el.animate as ReturnType<typeof vi.fn>).mock.results[0].value

      adapter.scrub(instance, 0.5)

      expect(mockAnim.pause).toHaveBeenCalled()
      // duration=500, progress=0.5 → currentTime=250
      expect(mockAnim.currentTime).toBe(250)

      adapter.destroy(instance)
    })

    it('scrub at 0 sets currentTime to 0', () => {
      const el = makeMockElement()
      const scene = makeEventScene('load')
      const targets = makeTargets(el)

      const instance = adapter.setup(scene, targets)
      const mockAnim = (el.animate as ReturnType<typeof vi.fn>).mock.results[0].value

      adapter.scrub(instance, 0)
      expect(mockAnim.currentTime).toBe(0)

      adapter.destroy(instance)
    })
  })
})

// ---------------------------------------------------------------------------
// Keyframe conversion
// ---------------------------------------------------------------------------

describe('keyframeUtils', () => {
  describe('composeTransform', () => {
    it('composes translate from x and y', () => {
      expect(composeTransform({ x: '10px', y: '20px' })).toBe('translate(10px, 20px)')
    })

    it('defaults missing axis to 0', () => {
      expect(composeTransform({ x: '10px' })).toBe('translate(10px, 0)')
      expect(composeTransform({ y: '20px' })).toBe('translate(0, 20px)')
    })

    it('composes scale', () => {
      expect(composeTransform({ scale: 1.5 })).toBe('scale(1.5)')
    })

    it('composes rotate', () => {
      expect(composeTransform({ rotate: '45deg' })).toBe('rotate(45deg)')
    })

    it('composes all together', () => {
      const result = composeTransform({ x: '10px', y: '0px', scale: 0.5, rotate: '90deg' })
      expect(result).toBe('translate(10px, 0px) scale(0.5) rotate(90deg)')
    })

    it('returns empty string when no properties set', () => {
      expect(composeTransform({})).toBe('')
    })
  })

  describe('toWAAPIKeyframes', () => {
    it('converts opacity', () => {
      const result = toWAAPIKeyframes([
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ])
      expect(result).toEqual([
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ])
    })

    it('converts transform', () => {
      const result = toWAAPIKeyframes([
        { offset: 0, transform: { x: '0px', y: '20px', scale: 0.8 } },
        { offset: 1, transform: { x: '0px', y: '0px', scale: 1 } },
      ])
      expect(result[0].transform).toBe('translate(0px, 20px) scale(0.8)')
      expect(result[1].transform).toBe('translate(0px, 0px) scale(1)')
    })

    it('converts blur to filter', () => {
      const result = toWAAPIKeyframes([
        { offset: 0, blur: '5px' },
        { offset: 1, blur: '0px' },
      ])
      expect(result[0].filter).toBe('blur(5px)')
      expect(result[1].filter).toBe('blur(0px)')
    })

    it('converts clipPath', () => {
      const result = toWAAPIKeyframes([
        { offset: 0, clipPath: 'inset(0 100% 0 0)' },
        { offset: 1, clipPath: 'inset(0 0 0 0)' },
      ])
      expect(result[0].clipPath).toBe('inset(0 100% 0 0)')
      expect(result[1].clipPath).toBe('inset(0 0 0 0)')
    })

    it('handles empty keyframes array', () => {
      expect(toWAAPIKeyframes([])).toEqual([])
    })
  })
})
