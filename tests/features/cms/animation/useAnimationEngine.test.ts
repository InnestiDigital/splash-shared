// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type {
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  AnimationEngine,
  IntersectionTrigger,
  EventTrigger,
  AdapterInstance,
  ResolvedTargets,
} from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Mock useReducedMotion before importing the composable
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: { value: false } }),
  resolveReducedMotion: () => 'fade-only',
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useAnimationEngine } from '~/shared/features/cms/animation/useAnimationEngine'

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(name: string, handles: string): MotionAdapter {
  return {
    name,
    canHandle: (scene) => scene.trigger.type === handles,
    setup: vi.fn((_scene: AnimationScene, _targets: ResolvedTargets): AdapterInstance => ({
      id: `${name}-instance-${_scene.id}`,
      adapterName: name,
    })),
    destroy: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    scrub: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Test data helpers
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
    presetId: 'float',
    ...overrides,
  }
}

function makeIntersectionScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
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

function makeEventScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-2',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'event',
      event: 'click',
      source: 'page',
    } as EventTrigger,
    entries: [
      makeEntry({
        id: 'entry-2',
        sceneId: 'scene-2',
        target: { entityType: 'block', entityId: 'b2', part: 'root' },
      }),
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper: mount composable inside a component
// ---------------------------------------------------------------------------

function mountEngine(adapters: MotionAdapter[]) {
  let engine!: AnimationEngine

  const Comp = defineComponent({
    setup() {
      engine = useAnimationEngine({ adapters })
      return () => h('div')
    },
  })

  const wrapper = mount(Comp)
  return { engine, wrapper }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAnimationEngine', () => {
  let intersectionAdapter: MotionAdapter
  let eventAdapter: MotionAdapter

  beforeEach(() => {
    intersectionAdapter = createMockAdapter('intersection', 'intersection')
    eventAdapter = createMockAdapter('event', 'event')
    // Clean data-motion-ready from previous tests
    document.documentElement.removeAttribute('data-motion-ready')
  })

  // -----------------------------------------------------------------------
  // registerBlockTargets
  // -----------------------------------------------------------------------

  describe('registerBlockTargets', () => {
    it('stores targets for later scene setup', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el })

      // Verify by loading a scene that needs b1 — adapter.setup should be called
      engine.loadScenes([makeIntersectionScene()])
      expect(intersectionAdapter.setup).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // loadScenes
  // -----------------------------------------------------------------------

  describe('loadScenes', () => {
    it('sets up scenes when targets are available', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })

    it('sets data-motion-ready attribute on document element', () => {
      const { engine } = mountEngine([intersectionAdapter])

      engine.loadScenes([])

      expect(document.documentElement.hasAttribute('data-motion-ready')).toBe(true)
    })

    it('clears previous scenes before loading new ones', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      // Load new scenes — old should be torn down first
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene({ id: 'scene-new' })])
      expect(intersectionAdapter.destroy).toHaveBeenCalled()
    })

    it('does not set up scenes when targets are missing', () => {
      const { engine } = mountEngine([intersectionAdapter])

      // No targets registered
      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // upsertScene
  // -----------------------------------------------------------------------

  describe('upsertScene', () => {
    it('replaces existing scene (tears down old, sets up new)', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      const scene = makeIntersectionScene()
      engine.loadScenes([scene])
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      // Upsert with same id
      const updatedScene = makeIntersectionScene({ entries: [makeEntry({ id: 'entry-updated' })] })
      engine.upsertScene(updatedScene)

      expect(intersectionAdapter.destroy).toHaveBeenCalled()
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(2)
    })

    it('adds new scene without teardown if it did not exist', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.upsertScene(makeIntersectionScene())

      expect(intersectionAdapter.destroy).not.toHaveBeenCalled()
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // removeScene
  // -----------------------------------------------------------------------

  describe('removeScene', () => {
    it('tears down and removes scene', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.loadScenes([makeIntersectionScene()])
      engine.removeScene('scene-1')

      expect(intersectionAdapter.destroy).toHaveBeenCalled()
      expect(engine.getSceneAdapter('scene-1')).toBe('none')
    })
  })

  // -----------------------------------------------------------------------
  // Adapter selection
  // -----------------------------------------------------------------------

  describe('adapter selection', () => {
    it('intersection adapter chosen for intersection scenes', () => {
      const { engine } = mountEngine([intersectionAdapter, eventAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalled()
      expect(eventAdapter.setup).not.toHaveBeenCalled()
      expect(engine.getSceneAdapter('scene-1')).toBe('intersection')
    })

    it('event adapter chosen for event scenes', () => {
      const { engine } = mountEngine([intersectionAdapter, eventAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b2', { root: el })

      engine.loadScenes([makeEventScene()])

      expect(eventAdapter.setup).toHaveBeenCalled()
      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
      expect(engine.getSceneAdapter('scene-2')).toBe('event')
    })

    it('scene not set up if no adapter can handle it', () => {
      const scrollOnlyScene = makeIntersectionScene({
        trigger: {
          type: 'scroll',
          anchor: 'viewport',
          start: { edge: 'top', viewport: 0.85 },
        },
      })
      // Neither mock adapter handles scroll
      const { engine } = mountEngine([intersectionAdapter, eventAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.loadScenes([scrollOnlyScene])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
      expect(eventAdapter.setup).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Deferred setup (targets registered after scenes)
  // -----------------------------------------------------------------------

  describe('deferred setup', () => {
    it('scene not set up until all required targets are registered', () => {
      const { engine } = mountEngine([intersectionAdapter])

      // Load scene first (no targets yet)
      engine.loadScenes([makeIntersectionScene()])
      expect(intersectionAdapter.setup).not.toHaveBeenCalled()

      // Now register targets — scene should be set up
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // unregisterTargets
  // -----------------------------------------------------------------------

  describe('unregisterTargets', () => {
    it('tears down affected scenes', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.loadScenes([makeIntersectionScene()])
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      engine.unregisterTargets('b1')
      expect(intersectionAdapter.destroy).toHaveBeenCalled()
    })

    it('does not tear down scenes for unrelated blocks', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })

      engine.loadScenes([makeIntersectionScene()])

      engine.unregisterTargets('b-unrelated')
      expect(intersectionAdapter.destroy).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // play / pause / scrub
  // -----------------------------------------------------------------------

  describe('play', () => {
    it('forwards to correct adapter instance', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      engine.play('scene-1')
      expect(intersectionAdapter.play).toHaveBeenCalled()
    })

    it('no-op for unknown scene', () => {
      const { engine } = mountEngine([intersectionAdapter])
      // Should not throw
      engine.play('nonexistent')
      expect(intersectionAdapter.play).not.toHaveBeenCalled()
    })
  })

  describe('pause', () => {
    it('forwards to correct adapter instance', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      engine.pause('scene-1')
      expect(intersectionAdapter.pause).toHaveBeenCalled()
    })
  })

  describe('scrub', () => {
    it('forwards to correct adapter instance with progress', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      engine.scrub('scene-1', 0.5)
      expect(intersectionAdapter.scrub).toHaveBeenCalledWith(
        expect.objectContaining({ adapterName: 'intersection' }),
        0.5,
      )
    })
  })

  // -----------------------------------------------------------------------
  // seekAll
  // -----------------------------------------------------------------------

  describe('seekAll', () => {
    it('scrubs all active scenes', () => {
      const { engine } = mountEngine([intersectionAdapter, eventAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })

      engine.loadScenes([makeIntersectionScene(), makeEventScene()])

      engine.seekAll(0.75)

      expect(intersectionAdapter.scrub).toHaveBeenCalledWith(
        expect.objectContaining({ adapterName: 'intersection' }),
        0.75,
      )
      expect(eventAdapter.scrub).toHaveBeenCalledWith(
        expect.objectContaining({ adapterName: 'event' }),
        0.75,
      )
    })
  })

  // -----------------------------------------------------------------------
  // resetAll
  // -----------------------------------------------------------------------

  describe('resetAll', () => {
    it('cleans up everything', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      engine.resetAll()

      expect(intersectionAdapter.destroy).toHaveBeenCalled()
      expect(engine.getSceneAdapter('scene-1')).toBe('none')
      expect(engine.activeAdapters.size).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // getSceneAdapter
  // -----------------------------------------------------------------------

  describe('getSceneAdapter', () => {
    it('returns adapter name for active scene', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(engine.getSceneAdapter('scene-1')).toBe('intersection')
    })

    it('returns "none" for unknown scene', () => {
      const { engine } = mountEngine([intersectionAdapter])
      expect(engine.getSceneAdapter('nonexistent')).toBe('none')
    })
  })

  // -----------------------------------------------------------------------
  // activeAdapters
  // -----------------------------------------------------------------------

  describe('activeAdapters', () => {
    it('reflects current state', () => {
      const { engine } = mountEngine([intersectionAdapter, eventAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })

      expect(engine.activeAdapters.size).toBe(0)

      engine.loadScenes([makeIntersectionScene()])
      expect(engine.activeAdapters.has('intersection')).toBe(true)
      expect(engine.activeAdapters.has('event')).toBe(false)

      engine.loadScenes([makeIntersectionScene(), makeEventScene()])
      expect(engine.activeAdapters.has('intersection')).toBe(true)
      expect(engine.activeAdapters.has('event')).toBe(true)
    })

    it('empties after resetAll', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(engine.activeAdapters.size).toBe(1)
      engine.resetAll()
      expect(engine.activeAdapters.size).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // hasScenes — SPL-076
  // Legacy useSectionReveal reads this to yield when the engine is active.
  // Must be true as soon as scenes are registered, regardless of whether
  // targets are present (i.e. independent of activeAdapters state).
  // -----------------------------------------------------------------------

  describe('hasScenes', () => {
    it('is false before any scenes are loaded', () => {
      const { engine } = mountEngine([intersectionAdapter])
      expect(engine.hasScenes).toBe(false)
    })

    it('is true immediately after loadScenes even without registered targets', () => {
      const { engine } = mountEngine([intersectionAdapter])

      // No targets registered → adapter.setup is NOT called, but scenes are still registered
      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
      expect(engine.hasScenes).toBe(true)
      expect(engine.activeAdapters.size).toBe(0)
    })

    it('is true after upsertScene adds a new scene', () => {
      const { engine } = mountEngine([intersectionAdapter])
      expect(engine.hasScenes).toBe(false)

      engine.upsertScene(makeIntersectionScene())
      expect(engine.hasScenes).toBe(true)
    })

    it('returns false after removeScene empties the registry', () => {
      const { engine } = mountEngine([intersectionAdapter])
      engine.upsertScene(makeIntersectionScene())
      expect(engine.hasScenes).toBe(true)

      engine.removeScene('scene-1')
      expect(engine.hasScenes).toBe(false)
    })

    it('returns false after resetAll clears the registry', () => {
      const { engine } = mountEngine([intersectionAdapter])
      engine.loadScenes([makeIntersectionScene(), makeEventScene()])
      expect(engine.hasScenes).toBe(true)

      engine.resetAll()
      expect(engine.hasScenes).toBe(false)
    })

    it('returns false after loadScenes with an empty array', () => {
      const { engine } = mountEngine([intersectionAdapter])
      engine.loadScenes([makeIntersectionScene()])
      expect(engine.hasScenes).toBe(true)

      engine.loadScenes([])
      expect(engine.hasScenes).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // refreshTargets
  // -----------------------------------------------------------------------

  describe('refreshTargets', () => {
    it('rebinds scenes for the specified block', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      // Refresh — tears down and re-sets up
      engine.refreshTargets('b1')
      expect(intersectionAdapter.destroy).toHaveBeenCalled()
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // Unmount cleanup
  // -----------------------------------------------------------------------

  describe('unmount cleanup', () => {
    it('resets all scenes and removes data-motion-ready on unmount', () => {
      const { engine, wrapper } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(document.documentElement.hasAttribute('data-motion-ready')).toBe(true)

      wrapper.unmount()

      expect(intersectionAdapter.destroy).toHaveBeenCalled()
      expect(document.documentElement.hasAttribute('data-motion-ready')).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // disabledTriggerTypes in motionHints
  // -----------------------------------------------------------------------

  describe('disabledTriggerTypes', () => {
    it('skips scene setup when trigger type is in disabledTriggerTypes', () => {
      const scrollAdapter = createMockAdapter('scroll', 'scroll')
      const { engine } = mountEngine([scrollAdapter, intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el }, {
        disabledTriggerTypes: ['scroll'],
      })

      const scrollScene: AnimationScene = {
        id: 'scene-scroll',
        pageId: 'page-1',
        versionId: 'v-1',
        trigger: {
          type: 'scroll',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
          start: { edge: 'top', viewport: 0.85 },
        },
        entries: [makeEntry({ sceneId: 'scene-scroll' })],
      }

      engine.loadScenes([scrollScene])

      expect(scrollAdapter.setup).not.toHaveBeenCalled()
    })

    it('does not skip intersection scene when only scroll is disabled', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el }, {
        disabledTriggerTypes: ['scroll'],
      })

      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })

    it('passes triggerHints to adapter.setup', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const mockRoot = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el }, {
        intersectionRoot: mockRoot,
      })

      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ intersectionRoot: mockRoot }),
        expect.anything(),
      )
    })
  })
})
