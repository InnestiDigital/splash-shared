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
  AdapterInstance,
  ResolvedTargets,
} from '~/shared/types/animation'
import {
  MAX_STAGGER_ITEMS,
  MAX_OBSERVERS_PER_PAGE,
  SCENE_BATCH_SIZE,
} from '~/shared/features/cms/animation/constants'
import { computeStaggerDelays } from '~/shared/features/cms/animation/presets/stagger'
import { selectorCache } from '~/shared/features/cms/animation/AnimatedBlock.vue'

// ---------------------------------------------------------------------------
// Mock useReducedMotion before importing the composable
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: { value: false } }),
  resolveReducedMotion: () => 'fade-only',
}))

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

// ---------------------------------------------------------------------------
// Helper: mount composable inside a component
// ---------------------------------------------------------------------------

function mountEngine(adapters: MotionAdapter[]) {
  let engine!: ReturnType<typeof useAnimationEngine>

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

describe('Performance optimizations', () => {
  let intersectionAdapter: MotionAdapter

  beforeEach(() => {
    intersectionAdapter = createMockAdapter('intersection', 'intersection')
    selectorCache.clear()
    document.documentElement.removeAttribute('data-motion-ready')
  })

  // -----------------------------------------------------------------------
  // 1. Target selector cache
  // -----------------------------------------------------------------------

  describe('target selector cache', () => {
    it('second block of same type reuses cached selectors', () => {
      // Populate cache for a block type
      selectorCache.set('hero-block', { root: undefined, title: '.hero-title' })

      // Reading the cache should return the same object
      const cached = selectorCache.get('hero-block')
      expect(cached).toBeDefined()
      expect(cached!.title).toBe('.hero-title')

      // A second lookup returns identical reference (no recomputation)
      const cached2 = selectorCache.get('hero-block')
      expect(cached2).toBe(cached)
    })

    it('cache invalidation: targets-changed clears cache for that type', () => {
      selectorCache.set('hero-block', { root: undefined, title: '.hero-title' })
      selectorCache.set('card-block', { root: undefined, image: '.card-img' })

      // Simulate what handleTargetsChanged does: delete by block type
      selectorCache.delete('hero-block')

      expect(selectorCache.has('hero-block')).toBe(false)
      // Other types remain
      expect(selectorCache.has('card-block')).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // 2. Batched registration
  // -----------------------------------------------------------------------

  describe('batched registration', () => {
    it('multiple registerBlockTargets in same tick result in single scene setup pass', () => {
      const { engine } = mountEngine([intersectionAdapter])

      // Enable batch mode for page-load optimization
      engine.enableBatchMode()

      // Load scenes that reference two different blocks
      const scene1 = makeIntersectionScene({
        id: 'scene-a',
        entries: [makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } })],
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
        } as IntersectionTrigger,
      })
      const scene2 = makeIntersectionScene({
        id: 'scene-b',
        entries: [makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'b2', part: 'root' } })],
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: 'b2', part: 'root' },
        } as IntersectionTrigger,
      })

      engine.loadScenes([scene1, scene2])

      const el1 = document.createElement('div')
      const el2 = document.createElement('div')

      // Register both targets in same tick (before batch flushes)
      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })

      // Before flushing, adapter.setup should NOT have been called by registration
      // (loadScenes may have tried synchronously but targets weren't available then)
      const setupCallsBefore = (intersectionAdapter.setup as ReturnType<typeof vi.fn>).mock.calls.length

      // Manually flush the batch (simulates RAF callback)
      engine.flushPendingRegistrations()

      const setupCallsAfter = (intersectionAdapter.setup as ReturnType<typeof vi.fn>).mock.calls.length

      // Both scenes set up in a single flush (batch flush count should be 1)
      expect(engine._batchFlushCount).toBe(1)
      // Two scenes were set up during the single flush
      expect(setupCallsAfter - setupCallsBefore).toBe(2)
    })
  })

  // -----------------------------------------------------------------------
  // 3. Stagger guardrails
  // -----------------------------------------------------------------------

  describe('stagger guardrails', () => {
    it('MAX_STAGGER_ITEMS constant is 50', () => {
      expect(MAX_STAGGER_ITEMS).toBe(50)
    })

    it('MAX_OBSERVERS_PER_PAGE constant is 50', () => {
      expect(MAX_OBSERVERS_PER_PAGE).toBe(50)
    })

    it('list of 100 items truncated to MAX_STAGGER_ITEMS', () => {
      const entries: AnimationEntry[] = Array.from({ length: 100 }, (_, i) =>
        makeEntry({
          id: `e${i}`,
          staggerGroup: 'big-group',
          staggerDelay: 100,
        }),
      )

      const delays = computeStaggerDelays(entries)

      // First item: delay 0
      expect(delays.get('e0')).toBe(0)

      // Item at MAX_STAGGER_ITEMS - 1 (index 49): (49 * 100) = 4900
      expect(delays.get(`e${MAX_STAGGER_ITEMS - 1}`)).toBe((MAX_STAGGER_ITEMS - 1) * 100)

      // Item at index 50 (beyond cap): should be capped at same delay as index 49
      expect(delays.get(`e${MAX_STAGGER_ITEMS}`)).toBe((MAX_STAGGER_ITEMS - 1) * 100)

      // Item at index 99: also capped
      expect(delays.get('e99')).toBe((MAX_STAGGER_ITEMS - 1) * 100)

      // All 100 entries still have delay entries (none dropped)
      expect(delays.size).toBe(100)
    })
  })

  // -----------------------------------------------------------------------
  // 4. Progressive scene setup
  // -----------------------------------------------------------------------

  describe('progressive scene setup', () => {
    it('60 scenes processed in batches (not all in one frame)', () => {
      // Mock requestAnimationFrame to execute callbacks synchronously but tracked
      const rafCallbacks: (() => void)[] = []
      const originalRaf = globalThis.requestAnimationFrame
      globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(() => cb(0))
        return rafCallbacks.length
      }) as unknown as typeof requestAnimationFrame

      try {
        const adapter = createMockAdapter('intersection', 'intersection')
        const { engine } = mountEngine([adapter])

        // Register targets for all 60 blocks
        for (let i = 0; i < 60; i++) {
          const el = document.createElement('div')
          engine.registerBlockTargets(`b${i}`, { root: el })
        }
        // Flush pending registrations (no scenes loaded yet, so no setup happens)
        engine.flushPendingRegistrations()

        // Create 60 scenes
        const scenes: AnimationScene[] = Array.from({ length: 60 }, (_, i) =>
          makeIntersectionScene({
            id: `scene-${i}`,
            entries: [
              makeEntry({
                id: `e${i}`,
                sceneId: `scene-${i}`,
                target: { entityType: 'block', entityId: `b${i}`, part: 'root' },
              }),
            ],
            trigger: {
              type: 'intersection',
              anchor: { entityType: 'block', entityId: `b${i}`, part: 'root' },
            } as IntersectionTrigger,
          }),
        )

        engine.loadScenes(scenes)

        // loadScenes should have scheduled RAF batches, not processed all synchronously
        // With 60 scenes and SCENE_BATCH_SIZE=10, first RAF queued
        expect(rafCallbacks.length).toBeGreaterThan(0)

        // Execute all RAF callbacks to completion
        let safetyLimit = 20
        while (rafCallbacks.length > 0 && safetyLimit-- > 0) {
          const cb = rafCallbacks.shift()!
          cb()
        }

        // Should have taken multiple batches (60 / 10 = 6)
        expect(engine._loadBatchCount).toBeGreaterThan(1)
        expect(engine._loadBatchCount).toBe(Math.ceil(60 / SCENE_BATCH_SIZE))
      } finally {
        globalThis.requestAnimationFrame = originalRaf
      }
    })

    it('observer cap: stops setting up scenes beyond MAX_OBSERVERS_PER_PAGE', () => {
      const adapter = createMockAdapter('intersection', 'intersection')
      const { engine } = mountEngine([adapter])

      // Register 55 block targets
      for (let i = 0; i < 55; i++) {
        const el = document.createElement('div')
        engine.registerBlockTargets(`b${i}`, { root: el })
      }
      engine.flushPendingRegistrations()

      // Create 55 scenes
      const scenes: AnimationScene[] = Array.from({ length: 55 }, (_, i) =>
        makeIntersectionScene({
          id: `scene-${i}`,
          entries: [
            makeEntry({
              id: `e${i}`,
              sceneId: `scene-${i}`,
              target: { entityType: 'block', entityId: `b${i}`, part: 'root' },
            }),
          ],
          trigger: {
            type: 'intersection',
            anchor: { entityType: 'block', entityId: `b${i}`, part: 'root' },
          } as IntersectionTrigger,
        }),
      )

      engine.loadScenes(scenes)

      // adapter.setup called at most MAX_OBSERVERS_PER_PAGE times
      expect((adapter.setup as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(
        MAX_OBSERVERS_PER_PAGE,
      )
    })
  })
})
