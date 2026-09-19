// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type {
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  AnimationEngine,
  ScrollTrigger,
  IntersectionTrigger,
  EventTrigger,
  AdapterInstance,
  ResolvedTargets,
} from '~/shared/types/animation'
import { downgradeScene } from '~/shared/features/cms/animation/reducedMotionDowngrade'

// ---------------------------------------------------------------------------
// Mock useReducedMotion — reactive ref so tests can toggle it
// ---------------------------------------------------------------------------

const mockIsReducedMotion = ref(false)

vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: mockIsReducedMotion }),
  resolveReducedMotion: () => 'fade-only',
}))

// Import after mocks
import { useAnimationEngine } from '~/shared/features/cms/animation/useAnimationEngine'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  return {
    id: 'entry-1',
    sceneId: 'scene-1',
    target: { entityType: 'block', entityId: 'b1', part: 'root' },
    keyframes: [
      { offset: 0, opacity: 0, transform: { y: '40px' } },
      { offset: 1, opacity: 1, transform: { y: '0px' } },
    ],
    position: { type: 'absolute', ms: 0 },
    presetId: 'float',
    ...overrides,
  }
}

function makeScrubbedParallaxScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-scrub',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'scroll',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
      start: { edge: 'top', viewport: 0.85 },
      end: { edge: 'bottom', viewport: 0.15 },
      scrub: true,
    } as ScrollTrigger,
    entries: [makeEntry({ sceneId: 'scene-scrub' })],
    ...overrides,
  }
}

function makePinnedScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-pin',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'scroll',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
      start: { edge: 'top', viewport: 0 },
      pin: true,
    } as ScrollTrigger,
    entries: [makeEntry({ sceneId: 'scene-pin' })],
    ...overrides,
  }
}

function makeHoverScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-hover',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'event',
      event: 'hover',
      source: { entityType: 'block', entityId: 'b1', part: 'root' },
    } as EventTrigger,
    entries: [makeEntry({ sceneId: 'scene-hover' })],
    ...overrides,
  }
}

function makeIntersectionScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-int',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'intersection',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
    } as IntersectionTrigger,
    entries: [makeEntry({ sceneId: 'scene-int' })],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(name: string, handles: string[]): MotionAdapter {
  return {
    name,
    canHandle: (scene) => handles.includes(scene.trigger.type),
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
// Unit tests: downgradeScene
// ---------------------------------------------------------------------------

describe('downgradeScene', () => {
  it('scrubbed parallax → intersection entrance under fade-only', () => {
    const scene = makeScrubbedParallaxScene()
    const result = downgradeScene(scene, 'fade-only')

    // Trigger should be converted to intersection
    expect(result.trigger.type).toBe('intersection')
    const trigger = result.trigger as IntersectionTrigger
    expect(trigger.once).toBe(true)

    // Entries should have fade-only keyframes
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].keyframes).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ])
    expect(result.entries[0].duration).toBe(200)
  })

  it('scrubbed parallax → empty entries under skip', () => {
    const scene = makeScrubbedParallaxScene()
    const result = downgradeScene(scene, 'skip')

    expect(result.entries).toHaveLength(0)
  })

  it('pinned scene → unpinned with instant keyframes under instant mode', () => {
    const scene = makePinnedScene()
    const result = downgradeScene(scene, 'instant')

    // Pin flag should be removed
    const trigger = result.trigger as ScrollTrigger
    expect(trigger.pin).toBe(false)
    expect(trigger.type).toBe('scroll')

    // Entries should have instant final states (duration 0)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].duration).toBe(0)
    // Instant: final keyframe at offset 0 and 1
    expect(result.entries[0].keyframes).toHaveLength(2)
    expect(result.entries[0].keyframes[0].offset).toBe(0)
    expect(result.entries[0].keyframes[1].offset).toBe(1)
  })

  it('hover scene → empty entries under any reduced-motion mode', () => {
    for (const mode of ['skip', 'fade-only', 'instant'] as const) {
      const scene = makeHoverScene()
      const result = downgradeScene(scene, mode)
      expect(result.entries).toHaveLength(0)
    }
  })

  it('regular intersection scene → entries get applyReducedMotion treatment', () => {
    const scene = makeIntersectionScene()
    const result = downgradeScene(scene, 'fade-only')

    // Trigger should remain intersection
    expect(result.trigger.type).toBe('intersection')

    // Entries should have fade-only substitution
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].keyframes).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ])
    expect(result.entries[0].duration).toBe(200)
  })

  it('downgradeScene with mode that leaves scene unchanged returns transformed entries', () => {
    // Even 'fade-only' transforms entries, so verify a skip mode empties them
    const scene = makeIntersectionScene()
    const resultSkip = downgradeScene(scene, 'skip')
    expect(resultSkip.entries[0].keyframes).toEqual([])
    expect(resultSkip.entries[0].duration).toBe(0)
  })

  // ----- A1: color / backgroundColor / vars reduced-motion rules -----

  it('fade-only preserves color and backgroundColor from last keyframe', () => {
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({
          sceneId: 'scene-int',
          keyframes: [
            { offset: 0, opacity: 0, color: 'red', backgroundColor: 'blue' },
            { offset: 1, opacity: 1, color: 'green', backgroundColor: 'yellow' },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'fade-only')

    // Should have opacity fade + color/bg from last keyframe on final frame
    expect(result.entries[0].keyframes[0]).toEqual({ offset: 0, opacity: 0 })
    expect(result.entries[0].keyframes[1]).toEqual({
      offset: 1,
      opacity: 1,
      color: 'green',
      backgroundColor: 'yellow',
    })
    expect(result.entries[0].duration).toBe(200)
  })

  it('fade-only strips vars from keyframes', () => {
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({
          sceneId: 'scene-int',
          keyframes: [
            {
              offset: 0,
              opacity: 0,
              vars: { '--tint': { type: 'color', value: 'red' } },
            },
            {
              offset: 1,
              opacity: 1,
              vars: { '--tint': { type: 'color', value: 'blue' } },
            },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'fade-only')

    // Vars should be removed
    expect(result.entries[0].keyframes[0].vars).toBeUndefined()
    expect(result.entries[0].keyframes[1].vars).toBeUndefined()
  })

  it('scrubbed parallax fade-only preserves color/bg from last keyframe', () => {
    const scene = makeScrubbedParallaxScene({
      entries: [
        makeEntry({
          sceneId: 'scene-scrub',
          keyframes: [
            { offset: 0, color: 'red', backgroundColor: 'black' },
            { offset: 1, color: 'blue', backgroundColor: 'white' },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'fade-only')

    expect(result.entries[0].keyframes[1]).toEqual(
      expect.objectContaining({ color: 'blue', backgroundColor: 'white' }),
    )
  })

  it('skip mode filters out entries with only vars', () => {
    const scene = makeIntersectionScene({
      entries: [
        // Entry with only vars — should be filtered out
        makeEntry({
          id: 'vars-only',
          sceneId: 'scene-int',
          keyframes: [
            { offset: 0, vars: { '--tint': { type: 'color', value: 'red' } } },
            { offset: 1, vars: { '--tint': { type: 'color', value: 'blue' } } },
          ],
        }),
        // Entry with opacity — should remain (though empty from skip)
        makeEntry({
          id: 'has-opacity',
          sceneId: 'scene-int',
          keyframes: [
            { offset: 0, opacity: 0 },
            { offset: 1, opacity: 1 },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'skip')

    // vars-only entry should be filtered out entirely
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].id).toBe('has-opacity')
  })

  it('skip mode keeps entries that have vars plus other properties', () => {
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({
          id: 'vars-plus-opacity',
          sceneId: 'scene-int',
          keyframes: [
            { offset: 0, opacity: 0, vars: { '--x': { type: 'number', value: 0 } } },
            { offset: 1, opacity: 1, vars: { '--x': { type: 'number', value: 1 } } },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'skip')

    // Entry has opacity, so it should not be filtered
    expect(result.entries).toHaveLength(1)
  })

  it('instant mode snaps to final values including color/bg, strips vars', () => {
    const scene = makeIntersectionScene({
      entries: [
        makeEntry({
          sceneId: 'scene-int',
          keyframes: [
            { offset: 0, opacity: 0, color: 'red', vars: { '--x': { type: 'number', value: 0 } } },
            { offset: 1, opacity: 1, color: 'blue', vars: { '--x': { type: 'number', value: 1 } } },
          ],
        }),
      ],
    })
    const result = downgradeScene(scene, 'instant')

    expect(result.entries[0].duration).toBe(0)
    // Final keyframes should include color but not vars
    const lastKf = result.entries[0].keyframes[1]
    expect(lastKf.color).toBe('blue')
    expect(lastKf.vars).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Engine integration: reactive re-setup on isReducedMotion toggle
// ---------------------------------------------------------------------------

describe('engine reduced-motion re-setup', () => {
  let intersectionAdapter: MotionAdapter
  let scrollAdapter: MotionAdapter

  beforeEach(() => {
    mockIsReducedMotion.value = false
    intersectionAdapter = createMockAdapter('intersection', ['intersection'])
    scrollAdapter = createMockAdapter('scroll', ['scroll'])
  })

  it('re-setups scenes when isReducedMotion toggles', async () => {
    const { engine, wrapper } = mountEngine([intersectionAdapter, scrollAdapter])
    const el = document.createElement('div')

    // Register targets and load a scrubbed parallax scene
    engine.registerBlockTargets('b1', { root: el })
    const scene = makeScrubbedParallaxScene()
    engine.loadScenes([scene])

    // Initially reduced motion is off → scroll adapter should handle it
    expect(scrollAdapter.setup).toHaveBeenCalledTimes(1)
    expect(engine.getSceneAdapter('scene-scrub')).toBe('scroll')

    // Toggle reduced motion on
    mockIsReducedMotion.value = true
    await nextTick()

    // Scene should be torn down and re-setup with downgraded trigger (intersection)
    expect(scrollAdapter.destroy).toHaveBeenCalled()
    expect(intersectionAdapter.setup).toHaveBeenCalled()
    expect(engine.getSceneAdapter('scene-scrub')).toBe('intersection')

    // Toggle reduced motion off → should restore original scroll scene
    mockIsReducedMotion.value = false
    await nextTick()

    expect(intersectionAdapter.destroy).toHaveBeenCalled()
    // Scroll adapter should be used again for the original scene
    expect(scrollAdapter.setup).toHaveBeenCalledTimes(2)
    expect(engine.getSceneAdapter('scene-scrub')).toBe('scroll')

    wrapper.unmount()
  })
})
