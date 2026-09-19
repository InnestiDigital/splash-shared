/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, computed } from 'vue'
import AnimatedBlock from '~/shared/features/cms/animation/AnimatedBlock.vue'
import { ENGINE_KEY, NESTED_MOTION_HINTS_KEY } from '~/shared/features/cms/animation/constants'
import type { AnimationEngine, MotionHints } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEngine(): AnimationEngine {
  return {
    registerBlockTargets: vi.fn(),
    unregisterTargets: vi.fn(),
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

/** Simple child block component with data-target attributes */
const ChildBlock = defineComponent({
  name: 'ChildBlock',
  setup() {
    return () =>
      h('section', { class: 'hero' }, [
        h('h1', { 'data-target': 'heading' }, 'Hello'),
        h('img', { 'data-target': 'media', src: '#' }),
        h('div', { 'data-target': 'overlay' }),
      ])
  },
})

function mountAnimatedBlock(options: {
  engine?: AnimationEngine | null
  blockId?: string
  blockType?: string
  targetsSchema?: Record<string, { selector?: string; multiple?: boolean }>
  child?: ReturnType<typeof defineComponent>
} = {}) {
  const {
    engine = createMockEngine(),
    blockId = 'block-1',
    blockType = 'hero-block',
    targetsSchema = {
      root: {},
      heading: { selector: "[data-target='heading']" },
      media: { selector: "[data-target='media']" },
      overlay: { selector: "[data-target='overlay']" },
    },
    child = ChildBlock,
  } = options

  const global: Record<string, any> = {}
  if (engine) {
    global.provide = { [ENGINE_KEY as symbol]: engine }
  }

  const wrapper = mount(AnimatedBlock, {
    props: { blockId, blockType, targetsSchema },
    slots: {
      default: () => h(child),
    },
    global,
  })

  return { wrapper, engine: engine as AnimationEngine }
}

// Wait for queueMicrotask to flush
async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await nextTick()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedBlock', () => {
  beforeEach(() => {
    // Clear the module-level selector cache between tests
    // Access it via a fresh block type each test or accept caching behavior
  })

  describe('DOM neutrality', () => {
    it('renders slot content inside a display:contents wrapper', () => {
      const { wrapper } = mountAnimatedBlock()
      const root = wrapper.element as HTMLElement

      // Wrapper uses display:contents (layout-neutral)
      expect(root.style.display).toBe('contents')
      expect(root.tagName).toBe('DIV')

      // Slot content is rendered inside
      expect(root.querySelector('section.hero')).toBeTruthy()
      expect(root.querySelector('h1')).toBeTruthy()
    })

    it('has data-animated-block attribute with blockId', () => {
      const { wrapper } = mountAnimatedBlock({ blockId: 'my-block' })
      expect(wrapper.element.getAttribute('data-animated-block')).toBe('my-block')
    })

    it('passes through slot content transparently', () => {
      const { wrapper } = mountAnimatedBlock()
      expect(wrapper.find('h1').text()).toBe('Hello')
      expect(wrapper.find('img').exists()).toBe(true)
      expect(wrapper.find('[data-target="overlay"]').exists()).toBe(true)
    })
  })

  describe('target registration', () => {
    it('queries data-target elements and registers with engine after mount', async () => {
      const engine = createMockEngine()
      mountAnimatedBlock({ engine })

      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      const [blockId, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock
        .calls[0]
      expect(blockId).toBe('block-1')

      // root should be the section element (first child of display:contents wrapper)
      expect(parts.root).toBeTruthy()
      expect(parts.root.tagName).toBe('SECTION')

      // Named targets resolved via selectors
      expect(parts.heading).toBeTruthy()
      expect(parts.heading.tagName).toBe('H1')
      expect(parts.media).toBeTruthy()
      expect(parts.media.tagName).toBe('IMG')
      expect(parts.overlay).toBeTruthy()
    })

    it('registers only root when targetsSchema has no selectors', async () => {
      const engine = createMockEngine()
      mountAnimatedBlock({ engine, blockType: `root-only-${Date.now()}`, targetsSchema: { root: {} } })

      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(parts.root).toBeTruthy()
      expect(Object.keys(parts)).toEqual(['root'])
    })

    it('skips targets whose selectors match nothing', async () => {
      const engine = createMockEngine()
      mountAnimatedBlock({
        engine,
        targetsSchema: {
          root: {},
          missing: { selector: "[data-target='nonexistent']" },
          heading: { selector: "[data-target='heading']" },
        },
      })

      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(parts.root).toBeTruthy()
      expect(parts.heading).toBeTruthy()
      expect(parts.missing).toBeUndefined()
    })
  })

  describe('unregistration', () => {
    it('unregisters targets from engine on unmount', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-42' })

      await flushMicrotasks()
      expect(engine.registerBlockTargets).toHaveBeenCalled()

      wrapper.unmount()
      expect(engine.unregisterTargets).toHaveBeenCalledWith('block-42')
    })
  })

  describe('no engine (graceful no-op)', () => {
    it('renders slot content without errors when no engine is injected', async () => {
      const { wrapper } = mountAnimatedBlock({ engine: null })

      await flushMicrotasks()

      // Content still renders
      expect(wrapper.find('h1').text()).toBe('Hello')
    })

    it('does not throw on unmount when no engine is injected', async () => {
      const { wrapper } = mountAnimatedBlock({ engine: null })
      await flushMicrotasks()

      expect(() => wrapper.unmount()).not.toThrow()
    })
  })

  describe('selector caching', () => {
    it('caches selectors per block type across instances', async () => {
      const engine = createMockEngine()
      const type = `cached-type-${Date.now()}`
      const schema = {
        root: {},
        heading: { selector: "[data-target='heading']" },
      }

      // Mount two instances with same block type
      mountAnimatedBlock({ engine, blockId: 'a', blockType: type, targetsSchema: schema })
      mountAnimatedBlock({ engine, blockId: 'b', blockType: type, targetsSchema: schema })

      await flushMicrotasks()

      // Both should register successfully (caching doesn't break functionality)
      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(2)
      const calls = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls
      expect(calls[0][0]).toBe('a')
      expect(calls[1][0]).toBe('b')
    })
  })

  describe('batched registration', () => {
    it('uses queueMicrotask for registration (not synchronous in mount)', () => {
      const engine = createMockEngine()
      mountAnimatedBlock({ engine })

      // Should not be called synchronously
      expect(engine.registerBlockTargets).not.toHaveBeenCalled()
    })
  })

  describe('boundary scoping', () => {
    it('does not resolve targets from nested AnimatedBlock boundaries', async () => {
      const engine = createMockEngine()

      // Simulate a page-level nested AnimatedBlock with its own [data-target="heading"].
      const NestedBlock = defineComponent({
        name: 'NestedBlock',
        setup() {
          return () =>
            h('div', { style: 'display:contents', 'data-animated-block': 'nested-id' }, [
              h('section', [
                h('h2', { 'data-target': 'heading' }, 'Nested heading'),
              ]),
            ])
        },
      })

      const OuterBlock = defineComponent({
        name: 'OuterBlock',
        setup() {
          return () =>
            h('section', { class: 'outer' }, [
              h('h1', { 'data-target': 'heading' }, 'Outer heading'),
              h(NestedBlock),
            ])
        },
      })

      mountAnimatedBlock({
        engine,
        blockId: 'outer-block',
        blockType: `boundary-test-${Date.now()}`,
        targetsSchema: { root: {}, heading: { selector: "[data-target='heading']" } },
        child: OuterBlock,
      })

      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      // Should resolve to the outer block's heading, not the nested block's
      expect(parts.heading?.tagName).toBe('H1')
      expect(parts.heading?.textContent).toBe('Outer heading')
    })
  })

  // -----------------------------------------------------------------------
  // resolveTargets — multiple: true  (SPL-015)
  // -----------------------------------------------------------------------

  describe('resolveTargets — multiple: true', () => {
    /** Block with 3 [data-target="step"] children */
    const MultiStepBlock = defineComponent({
      name: 'MultiStepBlock',
      setup() {
        return () =>
          h('section', { class: 'narrative' }, [
            h('div', { 'data-target': 'step', 'data-step-index': '0' }, 'Step 1'),
            h('div', { 'data-target': 'step', 'data-step-index': '1' }, 'Step 2'),
            h('div', { 'data-target': 'step', 'data-step-index': '2' }, 'Step 3'),
          ])
      },
    })

    it('collects all matching elements when multiple is true', async () => {
      const engine = createMockEngine()
      mountAnimatedBlock({
        engine,
        blockType: `multi-step-${Date.now()}`,
        targetsSchema: {
          root: {},
          steps: { selector: "[data-target='step']", multiple: true },
        },
        child: MultiStepBlock,
      })

      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(Array.isArray(parts.steps)).toBe(true)
      expect((parts.steps as HTMLElement[]).length).toBe(3)
      ;(parts.steps as HTMLElement[]).forEach((el) => {
        expect(el.getAttribute('data-target')).toBe('step')
      })
    })

    it('still returns single element when multiple is false/absent', async () => {
      const engine = createMockEngine()
      mountAnimatedBlock({
        engine,
        blockType: `single-step-${Date.now()}`,
        targetsSchema: {
          root: {},
          steps: { selector: "[data-target='step']" },
        },
        child: MultiStepBlock,
      })

      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      // Without multiple: true, should return only the first matching element
      expect(Array.isArray(parts.steps)).toBe(false)
      expect((parts.steps as HTMLElement).tagName).toBe('DIV')
      expect((parts.steps as HTMLElement).getAttribute('data-step-index')).toBe('0')
    })

    it('respects AnimatedBlock boundary scoping for multiple targets', async () => {
      const engine = createMockEngine()

      // Outer block with 2 own steps + a nested block containing 1 step
      const NestedWithStep = defineComponent({
        name: 'NestedWithStep',
        setup() {
          return () =>
            h('div', { style: 'display:contents', 'data-animated-block': 'nested-id' }, [
              h('section', [
                h('div', { 'data-target': 'step', 'data-step-index': 'nested' }, 'Nested step'),
              ]),
            ])
        },
      })

      const OuterWithSteps = defineComponent({
        name: 'OuterWithSteps',
        setup() {
          return () =>
            h('section', [
              h('div', { 'data-target': 'step', 'data-step-index': '0' }, 'Step 1'),
              h('div', { 'data-target': 'step', 'data-step-index': '1' }, 'Step 2'),
              h(NestedWithStep),
            ])
        },
      })

      mountAnimatedBlock({
        engine,
        blockId: 'outer-multi',
        blockType: `boundary-multi-${Date.now()}`,
        targetsSchema: {
          root: {},
          steps: { selector: "[data-target='step']", multiple: true },
        },
        child: OuterWithSteps,
      })

      await flushMicrotasks()

      const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
      // Only the 2 outer steps should be collected — nested step is in a different AnimatedBlock boundary
      expect(Array.isArray(parts.steps)).toBe(true)
      expect((parts.steps as HTMLElement[]).length).toBe(2)
      ;(parts.steps as HTMLElement[]).forEach((el) => {
        expect(el.getAttribute('data-step-index')).not.toBe('nested')
      })
    })
  })

  // -----------------------------------------------------------------------
  // Nested motion hints injection  (SPL-035)
  // -----------------------------------------------------------------------

  describe('nested motion hints', () => {
    it('merges injected parent hints with own motionHints prop', async () => {
      const engine = createMockEngine()
      const mockRoot = document.createElement('div')

      const parentHints = computed<Partial<MotionHints>>(() => ({
        disabledTriggerTypes: ['scroll'],
        intersectionRoot: mockRoot,
      }))

      mount(AnimatedBlock, {
        props: {
          blockId: 'block-merged',
          blockType: 'merge-test',
          targetsSchema: { root: {} },
          motionHints: { prefersLayerPromotion: ['root'] } as MotionHints,
        },
        slots: {
          default: () => h(ChildBlock),
        },
        global: {
          provide: {
            [ENGINE_KEY as symbol]: engine,
            [NESTED_MOTION_HINTS_KEY as symbol]: parentHints,
          },
        },
      })

      await flushMicrotasks()

      const calls = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const hints = calls[0][2] as MotionHints
      // Own hints preserved
      expect(hints.prefersLayerPromotion).toEqual(['root'])
      // Parent hints merged (override)
      expect(hints.disabledTriggerTypes).toEqual(['scroll'])
      expect(hints.intersectionRoot).toBe(mockRoot)
    })

    it('falls back to own motionHints when no parent hints provided', async () => {
      const engine = createMockEngine()

      mount(AnimatedBlock, {
        props: {
          blockId: 'block-own',
          blockType: 'own-hints-test',
          targetsSchema: { root: {} },
          motionHints: { prefersLayerPromotion: ['root'] } as MotionHints,
        },
        slots: {
          default: () => h(ChildBlock),
        },
        global: {
          provide: {
            [ENGINE_KEY as symbol]: engine,
          },
        },
      })

      await flushMicrotasks()

      const calls = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const hints = calls[0][2] as MotionHints
      expect(hints.prefersLayerPromotion).toEqual(['root'])
      expect(hints.disabledTriggerTypes).toBeUndefined()
      expect(hints.intersectionRoot).toBeUndefined()
    })

    it('uses parent hints alone when no own motionHints prop is set', async () => {
      const engine = createMockEngine()
      const mockRoot = document.createElement('div')

      const parentHints = computed<Partial<MotionHints>>(() => ({
        disabledTriggerTypes: ['scroll'],
        intersectionRoot: mockRoot,
      }))

      mount(AnimatedBlock, {
        props: {
          blockId: 'block-parent-only',
          blockType: 'parent-only-hints-test',
          targetsSchema: { root: {} },
        },
        slots: {
          default: () => h(ChildBlock),
        },
        global: {
          provide: {
            [ENGINE_KEY as symbol]: engine,
            [NESTED_MOTION_HINTS_KEY as symbol]: parentHints,
          },
        },
      })

      await flushMicrotasks()

      const calls = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const hints = calls[0][2] as MotionHints
      expect(hints.disabledTriggerTypes).toEqual(['scroll'])
      expect(hints.intersectionRoot).toBe(mockRoot)
    })
  })
})
