/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import AnimatedBlock from '~/shared/features/cms/animation/AnimatedBlock.vue'
import { ENGINE_KEY } from '~/shared/features/cms/animation/constants'
import type { AnimationEngine, MotionHints } from '~/shared/types/animation'
import type {
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  AdapterInstance,
  ResolvedTargets,
  IntersectionTrigger,
} from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Mock useReducedMotion before importing the composable
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: { value: false } }),
  resolveReducedMotion: () => 'fade-only',
}))

import { useAnimationEngine } from '~/shared/features/cms/animation/useAnimationEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEngine(): AnimationEngine {
  return {
    registerBlockTargets: vi.fn(),
    unregisterTargets: vi.fn(),
    getBlockHints: vi.fn().mockReturnValue(undefined),
    registerSection: vi.fn(),
    unregisterSection: vi.fn(),
    getSectionBlockIds: vi.fn().mockReturnValue(undefined),
    loadScenes: vi.fn(),
    upsertScene: vi.fn(),
    removeScene: vi.fn(),
    refreshTargets: vi.fn(),
    rebindAffectedScenes: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    scrub: vi.fn(),
    seekAll: vi.fn(),
    resetAll: vi.fn(),
    getSceneAdapter: vi.fn().mockReturnValue('none'),
    hasActiveSceneForPart: vi.fn().mockReturnValue(false),
    activeAdapters: new Set<string>(),
  }
}

/** Child block with data-target attributes for items and headings */
const ChildBlockWithItems = defineComponent({
  name: 'ChildBlockWithItems',
  setup() {
    return () =>
      h('section', { class: 'carousel' }, [
        h('div', { 'data-target': 'items', class: 'item-1' }, 'Item 1'),
        h('div', { 'data-target': 'items', class: 'item-2' }, 'Item 2'),
        h('h1', { 'data-target': 'heading' }, 'Title'),
      ])
  },
})

/** Simple child block */
const SimpleChild = defineComponent({
  name: 'SimpleChild',
  setup() {
    return () =>
      h('section', { class: 'simple' }, [
        h('h1', { 'data-target': 'heading' }, 'Hello'),
      ])
  },
})

function mountAnimatedBlock(options: {
  engine?: AnimationEngine | null
  blockId?: string
  blockType?: string
  targetsSchema?: Record<string, { selector?: string }>
  motionHints?: MotionHints
  child?: ReturnType<typeof defineComponent>
} = {}) {
  const {
    engine = createMockEngine(),
    blockId = 'block-1',
    blockType = `test-block-${Date.now()}-${Math.random()}`,
    targetsSchema = {
      root: {},
      items: { selector: "[data-target='items']" },
      heading: { selector: "[data-target='heading']" },
    },
    motionHints,
    child = ChildBlockWithItems,
  } = options

  const global: Record<string, any> = {}
  if (engine) {
    global.provide = { [ENGINE_KEY as symbol]: engine }
  }

  const wrapper = mount(AnimatedBlock, {
    props: { blockId, blockType, targetsSchema, motionHints },
    slots: {
      default: () => h(child),
    },
    global,
  })

  return { wrapper, engine: engine as AnimationEngine }
}

async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await nextTick()
}

// ---------------------------------------------------------------------------
// Mock adapter factory for engine tests
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

describe('MotionHints', () => {
  // -----------------------------------------------------------------------
  // AnimatedBlock: will-change for prefersLayerPromotion
  // -----------------------------------------------------------------------

  describe('AnimatedBlock applies will-change to elements in prefersLayerPromotion', () => {
    it('sets will-change:transform on targeted elements', async () => {
      const engine = createMockEngine()
      const hints: MotionHints = {
        prefersLayerPromotion: ['items'],
      }

      mountAnimatedBlock({ engine, motionHints: hints })
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]

      // The items element should have will-change set
      const itemsEl = parts.items as HTMLElement
      expect(itemsEl).toBeTruthy()
      expect(itemsEl.style.willChange).toBe('transform')
    })

    it('does not set will-change on elements not in prefersLayerPromotion', async () => {
      const engine = createMockEngine()
      const hints: MotionHints = {
        prefersLayerPromotion: ['items'],
      }

      mountAnimatedBlock({ engine, motionHints: hints })
      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      const headingEl = parts.heading as HTMLElement
      expect(headingEl).toBeTruthy()
      expect(headingEl.style.willChange).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // AnimatedBlock: contain:layout for isolateTransforms
  // -----------------------------------------------------------------------

  describe('AnimatedBlock applies contain:layout to elements in isolateTransforms', () => {
    it('sets contain:layout on targeted elements', async () => {
      const engine = createMockEngine()
      const hints: MotionHints = {
        isolateTransforms: ['items'],
      }

      mountAnimatedBlock({ engine, motionHints: hints })
      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      const itemsEl = parts.items as HTMLElement
      expect(itemsEl).toBeTruthy()
      expect(itemsEl.style.contain).toBe('layout')
    })

    it('does not set contain on elements not in isolateTransforms', async () => {
      const engine = createMockEngine()
      const hints: MotionHints = {
        isolateTransforms: ['items'],
      }

      mountAnimatedBlock({ engine, motionHints: hints })
      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      const headingEl = parts.heading as HTMLElement
      expect(headingEl).toBeTruthy()
      expect(headingEl.style.contain).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // Engine stores hints when registerBlockTargets called with hints
  // -----------------------------------------------------------------------

  describe('Engine stores hints when registerBlockTargets called with hints', () => {
    let intersectionAdapter: MotionAdapter

    beforeEach(() => {
      intersectionAdapter = createMockAdapter('intersection', 'intersection')
    })

    it('stores hints and returns them via getBlockHints', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const hints: MotionHints = {
        containsDynamicChildren: true,
        stableItemKeysTarget: 'items',
      }

      engine.registerBlockTargets('b1', { root: el }, hints)

      expect(engine.getBlockHints('b1')).toEqual(hints)
    })

    it('returns undefined for blocks without hints', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el })

      expect(engine.getBlockHints('b1')).toBeUndefined()
    })

    it('clears hints on unregister', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const hints: MotionHints = { containsDynamicChildren: true }

      engine.registerBlockTargets('b1', { root: el }, hints)
      expect(engine.getBlockHints('b1')).toEqual(hints)

      engine.unregisterTargets('b1')
      expect(engine.getBlockHints('b1')).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // Engine uses triggerRootOverride for scene trigger anchor resolution
  // -----------------------------------------------------------------------

  describe('Engine uses triggerRootOverride for scene trigger anchor resolution', () => {
    let intersectionAdapter: MotionAdapter

    beforeEach(() => {
      intersectionAdapter = createMockAdapter('intersection', 'intersection')
    })

    it('includes override part in resolved targets when triggerRootOverride is set', () => {
      const { engine } = mountEngine([intersectionAdapter])

      const rootEl = document.createElement('div')
      const headingEl = document.createElement('h1')

      const hints: MotionHints = {
        triggerRootOverride: 'heading',
      }

      engine.registerBlockTargets('b1', { root: rootEl, heading: headingEl }, hints)
      engine.loadScenes([makeIntersectionScene()])

      // Adapter should have been set up
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      // The resolved targets passed to setup should include 'heading'
      const setupCall = (intersectionAdapter.setup as ReturnType<typeof vi.fn>).mock.calls[0]
      const resolvedTargets = setupCall[1] as ResolvedTargets
      expect(resolvedTargets.heading).toBe(headingEl)
    })

    it('works normally without triggerRootOverride', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const rootEl = document.createElement('div')

      engine.registerBlockTargets('b1', { root: rootEl })
      engine.loadScenes([makeIntersectionScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
      const setupCall = (intersectionAdapter.setup as ReturnType<typeof vi.fn>).mock.calls[0]
      const resolvedTargets = setupCall[1] as ResolvedTargets
      expect(resolvedTargets.root).toBe(rootEl)
    })
  })

  // -----------------------------------------------------------------------
  // containsDynamicChildren flag stored and accessible
  // -----------------------------------------------------------------------

  describe('containsDynamicChildren flag stored and accessible on registered block', () => {
    let intersectionAdapter: MotionAdapter

    beforeEach(() => {
      intersectionAdapter = createMockAdapter('intersection', 'intersection')
    })

    it('stores containsDynamicChildren: true', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const hints: MotionHints = { containsDynamicChildren: true }

      engine.registerBlockTargets('b1', { root: el }, hints)

      const stored = engine.getBlockHints('b1')
      expect(stored?.containsDynamicChildren).toBe(true)
    })

    it('stores containsDynamicChildren: false', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const hints: MotionHints = { containsDynamicChildren: false }

      engine.registerBlockTargets('b1', { root: el }, hints)

      const stored = engine.getBlockHints('b1')
      expect(stored?.containsDynamicChildren).toBe(false)
    })

    it('stores stableItemKeysTarget alongside containsDynamicChildren', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el = document.createElement('div')
      const hints: MotionHints = {
        containsDynamicChildren: true,
        stableItemKeysTarget: 'items',
      }

      engine.registerBlockTargets('b1', { root: el }, hints)

      const stored = engine.getBlockHints('b1')
      expect(stored?.stableItemKeysTarget).toBe('items')
    })
  })

  // -----------------------------------------------------------------------
  // Blocks without motionHints work normally
  // -----------------------------------------------------------------------

  describe('Blocks without motionHints work normally (no hints = no special behavior)', () => {
    it('AnimatedBlock registers targets without hints', async () => {
      const engine = createMockEngine()

      mountAnimatedBlock({ engine, child: SimpleChild })
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      const [blockId, parts, hints] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(blockId).toBe('block-1')
      expect(parts.root).toBeTruthy()
      expect(hints).toBeUndefined()
    })

    it('AnimatedBlock does not apply will-change or contain styles without hints', async () => {
      const engine = createMockEngine()

      mountAnimatedBlock({
        engine,
        motionHints: undefined,
      })
      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      const itemsEl = parts.items as HTMLElement
      expect(itemsEl).toBeTruthy()
      expect(itemsEl.style.willChange).toBe('')
      expect(itemsEl.style.contain).toBe('')
    })

    it('engine works normally when no hints are provided', () => {
      const adapter = createMockAdapter('intersection', 'intersection')
      const { engine } = mountEngine([adapter])
      const el = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el })
      engine.loadScenes([makeIntersectionScene()])

      expect(adapter.setup).toHaveBeenCalledTimes(1)
      expect(engine.getBlockHints('b1')).toBeUndefined()
    })
  })
})
