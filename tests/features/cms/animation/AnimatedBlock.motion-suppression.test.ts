/**
 * @vitest-environment happy-dom
 *
 * SPL — data-motion-suppressed exclusion filter (Task D.1)
 *
 * When a target element carries data-motion-suppressed="true", the animation
 * target resolver must skip it so that motion-driven presets do not compete
 * with interactive positioning on the same element.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import AnimatedBlock from '~/shared/features/cms/animation/AnimatedBlock.vue'
import { ENGINE_KEY } from '~/shared/features/cms/animation/constants'
import type { AnimationEngine } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Helpers (kept local; smaller surface than the shared mountAnimatedBlock).
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

async function flushMicrotasks() {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  await nextTick()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedBlock — data-motion-suppressed filter', () => {
  it('multiple:true — excludes elements with data-motion-suppressed="true"', async () => {
    const engine = createMockEngine()

    const MixedItems = defineComponent({
      name: 'MixedItems',
      setup() {
        return () =>
          h('section', [
            h('div', { 'data-target': 'items', id: 'keep' }, 'keep'),
            h(
              'div',
              { 'data-target': 'items', 'data-motion-suppressed': 'true', id: 'skip' },
              'skip',
            ),
            h(
              'div',
              { 'data-target': 'items', 'data-motion-suppressed': 'false', id: 'explicit-keep' },
              'explicit-keep',
            ),
            h('div', { 'data-target': 'items', id: 'implicit-keep' }, 'implicit-keep'),
          ])
      },
    })

    mount(AnimatedBlock, {
      props: {
        blockId: 'mixed-block',
        blockType: `motion-suppressed-multi-${Date.now()}`,
        targetsSchema: {
          root: {},
          items: { selector: "[data-target='items']", multiple: true },
        },
      },
      slots: { default: () => h(MixedItems) },
      global: { provide: { [ENGINE_KEY as symbol]: engine } },
    })

    await flushMicrotasks()

    const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(Array.isArray(parts.items)).toBe(true)
    const ids = (parts.items as HTMLElement[]).map((el) => el.id)
    expect(ids).toContain('keep')
    expect(ids).toContain('explicit-keep')
    expect(ids).toContain('implicit-keep')
    expect(ids).not.toContain('skip')
    expect(ids).toHaveLength(3)
  })

  it('multiple:true — elements without the attribute are included (implicit false)', async () => {
    const engine = createMockEngine()

    const UntaggedItems = defineComponent({
      name: 'UntaggedItems',
      setup() {
        return () =>
          h('section', [
            h('div', { 'data-target': 'items', id: 'a' }),
            h('div', { 'data-target': 'items', id: 'b' }),
          ])
      },
    })

    mount(AnimatedBlock, {
      props: {
        blockId: 'implicit-block',
        blockType: `motion-suppressed-implicit-${Date.now()}`,
        targetsSchema: {
          root: {},
          items: { selector: "[data-target='items']", multiple: true },
        },
      },
      slots: { default: () => h(UntaggedItems) },
      global: { provide: { [ENGINE_KEY as symbol]: engine } },
    })

    await flushMicrotasks()

    const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(Array.isArray(parts.items)).toBe(true)
    expect((parts.items as HTMLElement[]).map((el) => el.id)).toEqual(['a', 'b'])
  })

  it('multiple:true — data-motion-suppressed="false" is included', async () => {
    const engine = createMockEngine()

    const ExplicitFalseItems = defineComponent({
      name: 'ExplicitFalseItems',
      setup() {
        return () =>
          h('section', [
            h('div', { 'data-target': 'items', 'data-motion-suppressed': 'false', id: 'a' }),
            h('div', { 'data-target': 'items', 'data-motion-suppressed': 'false', id: 'b' }),
          ])
      },
    })

    mount(AnimatedBlock, {
      props: {
        blockId: 'explicit-false-block',
        blockType: `motion-suppressed-false-${Date.now()}`,
        targetsSchema: {
          root: {},
          items: { selector: "[data-target='items']", multiple: true },
        },
      },
      slots: { default: () => h(ExplicitFalseItems) },
      global: { provide: { [ENGINE_KEY as symbol]: engine } },
    })

    await flushMicrotasks()

    const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(Array.isArray(parts.items)).toBe(true)
    expect((parts.items as HTMLElement[]).map((el) => el.id)).toEqual(['a', 'b'])
  })

  it('single-target — suppressed sole match yields no registration for that part', async () => {
    const engine = createMockEngine()

    const SingleSuppressed = defineComponent({
      name: 'SingleSuppressed',
      setup() {
        return () =>
          h('section', [
            h(
              'div',
              { 'data-target': 'hero', 'data-motion-suppressed': 'true', id: 'only' },
              'only',
            ),
          ])
      },
    })

    mount(AnimatedBlock, {
      props: {
        blockId: 'single-suppressed-block',
        blockType: `motion-suppressed-single-${Date.now()}`,
        targetsSchema: {
          root: {},
          hero: { selector: "[data-target='hero']" },
        },
      },
      slots: { default: () => h(SingleSuppressed) },
      global: { provide: { [ENGINE_KEY as symbol]: engine } },
    })

    await flushMicrotasks()

    const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
    // When the only candidate is suppressed, the part is omitted entirely
    // (matches the "no element found" behavior of the existing resolver).
    expect(parts.hero).toBeUndefined()
    expect(parts.root).toBeTruthy()
  })

  it('single-target — skips suppressed match and falls through to next candidate', async () => {
    const engine = createMockEngine()

    const FirstSuppressed = defineComponent({
      name: 'FirstSuppressed',
      setup() {
        return () =>
          h('section', [
            h(
              'div',
              { 'data-target': 'hero', 'data-motion-suppressed': 'true', id: 'first' },
              'first',
            ),
            h('div', { 'data-target': 'hero', id: 'second' }, 'second'),
          ])
      },
    })

    mount(AnimatedBlock, {
      props: {
        blockId: 'fallthrough-block',
        blockType: `motion-suppressed-fallthrough-${Date.now()}`,
        targetsSchema: {
          root: {},
          hero: { selector: "[data-target='hero']" },
        },
      },
      slots: { default: () => h(FirstSuppressed) },
      global: { provide: { [ENGINE_KEY as symbol]: engine } },
    })

    await flushMicrotasks()

    const [, parts] = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(parts.hero).toBeTruthy()
    expect((parts.hero as HTMLElement).id).toBe('second')
  })
})
