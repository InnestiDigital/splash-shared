/**
 * Shared test helpers for animation tests.
 * Centralises mock factories and mount helpers that were duplicated across
 * AnimatedBlock, motionHints, performance, and targetsChanged test files.
 */
import { vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import AnimatedBlock from '~/shared/features/cms/animation/AnimatedBlock.vue'
import { ENGINE_KEY } from '~/shared/features/cms/animation/constants'
import type {
  AnimationEngine,
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  MotionHints,
  AdapterInstance,
  ResolvedTargets,
  IntersectionTrigger,
} from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Mock engine factory
// ---------------------------------------------------------------------------

export function createMockEngine(overrides: Partial<AnimationEngine> = {}): AnimationEngine {
  return {
    registerEntityTargets: vi.fn(),
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
    getActiveAdapters: vi.fn().mockReturnValue([]),
    hasActiveSceneForPart: vi.fn().mockReturnValue(false),
    activeAdapters: new Set<string>(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

export function createMockAdapter(name: string, handles: string): MotionAdapter {
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
// Test data factories
// ---------------------------------------------------------------------------

export function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
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

export function makeIntersectionScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
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
// Child block components
// ---------------------------------------------------------------------------

export const ChildBlockWithItems = defineComponent({
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

export const SimpleChild = defineComponent({
  name: 'SimpleChild',
  setup() {
    return () =>
      h('section', { class: 'simple' }, [
        h('h1', { 'data-target': 'heading' }, 'Hello'),
      ])
  },
})

// ---------------------------------------------------------------------------
// Mount helpers
// ---------------------------------------------------------------------------

export function mountAnimatedBlock(options: {
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

export async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await nextTick()
}

/**
 * Mount the useAnimationEngine composable inside a wrapper component.
 * Must be called AFTER vi.mock('~/shared/composables/useReducedMotion', ...).
 */
export function mountEngine(
  useAnimationEngine: Function,
  adapters: MotionAdapter[],
) {
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
