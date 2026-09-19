// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, inject, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import type {
  AnimationScene,
  AnimationEntry,
  AnimationEngine,
  IntersectionTrigger,
  EventTrigger,
} from '~/shared/types/animation'
import { ENGINE_KEY } from '~/shared/features/cms/animation/constants'

// ---------------------------------------------------------------------------
// Mock useReducedMotion before importing the component
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: { value: false } }),
  resolveReducedMotion: () => 'fade-only',
}))

// ---------------------------------------------------------------------------
// Spy on useAnimationEngine to track calls
// ---------------------------------------------------------------------------

const loadScenesSpy = vi.fn()
const upsertSceneSpy = vi.fn()
const removeSceneSpy = vi.fn()
const resetAllSpy = vi.fn()

const fakeEngine: AnimationEngine = {
  registerBlockTargets: vi.fn(),
  unregisterTargets: vi.fn(),
  loadScenes: loadScenesSpy,
  upsertScene: upsertSceneSpy,
  removeScene: removeSceneSpy,
  refreshTargets: vi.fn(),
  rebindAffectedScenes: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  scrub: vi.fn(),
  seekAll: vi.fn(),
  resetAll: resetAllSpy,
  getSceneAdapter: vi.fn(() => 'none'),
  hasActiveSceneForPart: vi.fn().mockReturnValue(false),
  activeAdapters: new Set<string>(),
}

vi.mock('~/shared/features/cms/animation/useAnimationEngine', () => ({
  useAnimationEngine: vi.fn(() => fakeEngine),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import AnimationEngineProvider from '~/shared/features/cms/animation/AnimationEngineProvider.vue'

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

function makeScene2(): AnimationScene {
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
  }
}

// ---------------------------------------------------------------------------
// Child component that injects engine
// ---------------------------------------------------------------------------

const InjectedChild = defineComponent({
  name: 'InjectedChild',
  setup() {
    const engine = inject(ENGINE_KEY, null)
    return { engine }
  },
  render() {
    return h('div', { class: 'child' }, this.engine ? 'has-engine' : 'no-engine')
  },
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimationEngineProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides engine to child components via inject', () => {
    const wrapper = mount(AnimationEngineProvider, {
      props: { scenes: [] },
      slots: {
        default: () => h(InjectedChild),
      },
    })

    expect(wrapper.find('.child').text()).toBe('has-engine')
  })

  it('calls loadScenes on initial mount', () => {
    const scenes = [makeScene()]
    mount(AnimationEngineProvider, {
      props: { scenes },
      slots: { default: () => h('div') },
    })

    expect(loadScenesSpy).toHaveBeenCalledOnce()
    expect(loadScenesSpy).toHaveBeenCalledWith(scenes)
  })

  it('adding a scene triggers upsertScene', async () => {
    const scene1 = makeScene()
    const scenes = ref<AnimationScene[]>([scene1])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    // Add a second scene
    const scene2 = makeScene2()
    scenes.value = [scene1, scene2]
    await nextTick()

    expect(upsertSceneSpy).toHaveBeenCalledWith(scene2)
  })

  it('removing a scene triggers removeScene', async () => {
    const scene1 = makeScene()
    const scene2 = makeScene2()
    const scenes = ref<AnimationScene[]>([scene1, scene2])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    // Remove scene2
    scenes.value = [scene1]
    await nextTick()

    expect(removeSceneSpy).toHaveBeenCalledWith('scene-2')
  })

  it('modifying a scene triggers upsertScene (not full reload)', async () => {
    const scene1 = makeScene()
    const scenes = ref<AnimationScene[]>([scene1])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    // Clear call history from initial mount
    upsertSceneSpy.mockClear()
    loadScenesSpy.mockClear()

    // Modify scene1's entries
    const modifiedScene = makeScene({
      entries: [
        makeEntry({ duration: 500 }),
      ],
    })
    scenes.value = [modifiedScene]
    await nextTick()

    expect(upsertSceneSpy).toHaveBeenCalledWith(modifiedScene)
    // loadScenes should NOT be called again (no full reload)
    expect(loadScenesSpy).not.toHaveBeenCalled()
  })

  it('renders slot content transparently', () => {
    const wrapper = mount(AnimationEngineProvider, {
      props: { scenes: [] },
      slots: {
        default: () => h('div', { class: 'slot-content' }, 'hello'),
      },
    })

    expect(wrapper.find('.slot-content').exists()).toBe(true)
    expect(wrapper.find('.slot-content').text()).toBe('hello')
  })

  it('unchanged scenes are not upserted', async () => {
    const scene1 = makeScene()
    const scenes = ref<AnimationScene[]>([scene1])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    upsertSceneSpy.mockClear()
    removeSceneSpy.mockClear()

    // Re-assign with identical content
    scenes.value = [makeScene()]
    await nextTick()

    // Same content via JSON comparison — should not upsert
    expect(upsertSceneSpy).not.toHaveBeenCalled()
    expect(removeSceneSpy).not.toHaveBeenCalled()
  })

  // Regression: SPL-016 — scenesEqual previously skipped `choreographyMeta`
  // and `sectionChoreography`, so editing a choreography scene to retarget a
  // section or tweak baseDelay/mode did not tear down + rebuild the adapter.
  // Engine kept stale block membership; mutation to choreographyMeta must
  // trigger `upsertScene` (which performs teardown + setup).
  it('mutating choreographyMeta triggers upsertScene (teardown + rebuild)', async () => {
    const baseScene = makeScene({
      sectionId: 'section-1',
      choreographyMeta: { name: 'Hero reveal', templateId: 'tpl-stagger' },
      sectionChoreography: {
        sectionId: 'section-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const scenes = ref<AnimationScene[]>([baseScene])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    upsertSceneSpy.mockClear()
    loadScenesSpy.mockClear()

    // Mutate choreographyMeta (admin renamed the choreography template)
    const renamedScene = makeScene({
      sectionId: 'section-1',
      choreographyMeta: { name: 'Hero reveal v2', templateId: 'tpl-stagger' },
      sectionChoreography: {
        sectionId: 'section-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    scenes.value = [renamedScene]
    await nextTick()

    expect(upsertSceneSpy).toHaveBeenCalledWith(renamedScene)
    expect(loadScenesSpy).not.toHaveBeenCalled()
  })

  // Regression: SPL-016 — tweaking runtime choreography timing (baseDelay /
  // mode / order) must also rebuild so the resolver recomputes delays.
  it('mutating sectionChoreography.meta.baseDelay triggers upsertScene', async () => {
    const baseScene = makeScene({
      sectionId: 'section-1',
      sectionChoreography: {
        sectionId: 'section-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const scenes = ref<AnimationScene[]>([baseScene])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    upsertSceneSpy.mockClear()

    const retimedScene = makeScene({
      sectionId: 'section-1',
      sectionChoreography: {
        sectionId: 'section-1',
        meta: { mode: 'stagger', baseDelay: 160, order: 'top-down' },
      },
    })
    scenes.value = [retimedScene]
    await nextTick()

    expect(upsertSceneSpy).toHaveBeenCalledWith(retimedScene)
  })

  // Regression: SPL-016 — re-targeting a choreography to a different section
  // (changing `sectionId`) changes the set of blocks that should receive
  // staggered delays. Scene must be rebuilt to pick up the new block set.
  it('mutating sectionId triggers upsertScene', async () => {
    const baseScene = makeScene({ sectionId: 'section-1' })
    const scenes = ref<AnimationScene[]>([baseScene])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    upsertSceneSpy.mockClear()

    const retargetedScene = makeScene({ sectionId: 'section-2' })
    scenes.value = [retargetedScene]
    await nextTick()

    expect(upsertSceneSpy).toHaveBeenCalledWith(retargetedScene)
  })

  // Regression: SPL-080 — JSON.stringify was key-order-sensitive, so scenes
  // rebuilt via spread across multiple sources (same data, different key
  // insertion order) triggered spurious upsertScene calls which tore down and
  // re-set up the adapter mid-animation. scenesEqual must be order-agnostic.
  it('does not upsert when scene is rebuilt with a different key insertion order', async () => {
    const canonical: AnimationScene = {
      id: 'scene-1',
      pageId: 'page-1',
      versionId: 'v-1',
      trigger: {
        type: 'intersection',
        anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
        threshold: 0.5,
        once: true,
      } as IntersectionTrigger,
      entries: [makeEntry()],
    }

    const scenes = ref<AnimationScene[]>([canonical])

    const Host = defineComponent({
      setup() {
        return () =>
          h(AnimationEngineProvider, { scenes: scenes.value }, {
            default: () => h('div'),
          })
      },
    })

    mount(Host)

    upsertSceneSpy.mockClear()
    removeSceneSpy.mockClear()

    // Same content, keys inserted in reverse order on every nesting level.
    const reorderedByKey: AnimationScene = {
      versionId: 'v-1',
      entries: [makeEntry()],
      trigger: {
        once: true,
        threshold: 0.5,
        anchor: { part: 'root', entityId: 'b1', entityType: 'block' },
        type: 'intersection',
      } as IntersectionTrigger,
      pageId: 'page-1',
      id: 'scene-1',
    }

    // Sanity check: JSON.stringify disagrees on these two structurally equal
    // objects — proves the prior diff logic would have fired upsertScene.
    expect(JSON.stringify(canonical) === JSON.stringify(reorderedByKey)).toBe(false)

    scenes.value = [reorderedByKey]
    await nextTick()

    expect(upsertSceneSpy).not.toHaveBeenCalled()
    expect(removeSceneSpy).not.toHaveBeenCalled()
  })
})
