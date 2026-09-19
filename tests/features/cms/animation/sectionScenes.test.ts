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
  TargetRef,
} from '~/shared/types/animation'
import { rejectSectionEntity } from '~/shared/types/animation'

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

function makeTarget(overrides: Partial<TargetRef> = {}): TargetRef {
  return {
    entityType: 'block',
    entityId: 'b1',
    part: 'root',
    ...overrides,
  }
}

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  return {
    id: 'entry-1',
    sceneId: 'scene-1',
    target: makeTarget(),
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    position: { type: 'absolute', ms: 0 },
    presetId: 'float',
    ...overrides,
  }
}

function makeSectionTriggerScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-section',
    pageId: 'page-1',
    versionId: 'v-1',
    allowCrossBlock: true,
    trigger: {
      type: 'intersection',
      anchor: { entityType: 'section', entityId: 'sec-1', part: 'root' },
    } as IntersectionTrigger,
    entries: [
      makeEntry({ id: 'entry-1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
      makeEntry({ id: 'entry-2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
    ],
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

describe('section scenes', () => {
  let intersectionAdapter: MotionAdapter

  beforeEach(() => {
    intersectionAdapter = createMockAdapter('intersection', 'intersection')
    document.documentElement.removeAttribute('data-motion-ready')
  })

  // -----------------------------------------------------------------------
  // 1. rejectSectionEntity returns null (gate lifted)
  // -----------------------------------------------------------------------

  describe('rejectSectionEntity gate lifted', () => {
    it('returns null for section entity type', () => {
      const ref: TargetRef = { entityType: 'section', entityId: 'sec-1', part: 'root' }
      expect(rejectSectionEntity(ref)).toBeNull()
    })

    it('still returns null for block entity type', () => {
      const ref: TargetRef = { entityType: 'block', entityId: 'b1', part: 'root' }
      expect(rejectSectionEntity(ref)).toBeNull()
    })

    it('still returns null for page entity type', () => {
      const ref: TargetRef = { entityType: 'page', entityId: 'p1', part: 'root' }
      expect(rejectSectionEntity(ref)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // 2. Engine accepts section entity type in trigger anchor
  // -----------------------------------------------------------------------

  describe('engine accepts section trigger anchor', () => {
    it('sets up scene when section and block targets are registered', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')

      // Register block targets first, then load scenes (avoids batching issues)
      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.loadScenes([makeSectionTriggerScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })

    it('does not set up scene when section is not registered', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el1 })
      // No registerSection call
      engine.loadScenes([makeSectionTriggerScene()])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 3. Engine resolves section trigger to first block's root element
  // -----------------------------------------------------------------------

  describe('section trigger resolves to first block', () => {
    it('resolves trigger to first block in section for target resolution', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      el1.id = 'first-block'
      const el2 = document.createElement('div')
      el2.id = 'second-block'

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.loadScenes([makeSectionTriggerScene()])

      // Scene should be set up — first block used as trigger anchor
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
      expect(engine.getSceneAdapter('scene-section')).toBe('intersection')
    })

    it('does not set up scene when first block of section has no targets', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el2 = document.createElement('div')

      // Only register b2, not b1 (first block in section)
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.loadScenes([makeSectionTriggerScene()])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 4. registerSection stores section-to-block mapping
  // -----------------------------------------------------------------------

  describe('registerSection', () => {
    it('stores section-to-block mapping retrievable via getSectionBlockIds', () => {
      const { engine } = mountEngine([intersectionAdapter])

      engine.registerSection('sec-1', ['b1', 'b2', 'b3'])

      expect(engine.getSectionBlockIds('sec-1')).toEqual(['b1', 'b2', 'b3'])
    })

    it('returns undefined for unregistered section', () => {
      const { engine } = mountEngine([intersectionAdapter])

      expect(engine.getSectionBlockIds('nonexistent')).toBeUndefined()
    })

    it('overwrites previous mapping on re-register', () => {
      const { engine } = mountEngine([intersectionAdapter])

      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.registerSection('sec-1', ['b3', 'b4'])

      expect(engine.getSectionBlockIds('sec-1')).toEqual(['b3', 'b4'])
    })

    it('unregisterSection removes mapping', () => {
      const { engine } = mountEngine([intersectionAdapter])

      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.unregisterSection('sec-1')

      expect(engine.getSectionBlockIds('sec-1')).toBeUndefined()
    })

    it('resetAll preserves section mappings (sections are structural)', () => {
      const { engine } = mountEngine([intersectionAdapter])

      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.resetAll()

      // Sections survive resetAll — they are page-structural, not per-scene
      expect(engine.getSectionBlockIds('sec-1')).toEqual(['b1', 'b2'])
    })

    it('unmount clears section mappings', () => {
      const { engine, wrapper } = mountEngine([intersectionAdapter])

      engine.registerSection('sec-1', ['b1', 'b2'])
      wrapper.unmount()

      expect(engine.getSectionBlockIds('sec-1')).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // 5. Scene with section trigger and block entries validates successfully
  // -----------------------------------------------------------------------

  describe('validation with section entities', () => {
    it('scene with section trigger and block entries sets up without error', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])

      const scene = makeSectionTriggerScene()
      engine.loadScenes([scene])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
      expect(engine.getSceneAdapter('scene-section')).toBe('intersection')
    })
  })

  // -----------------------------------------------------------------------
  // 6. Section with multiple blocks — trigger on section animates all entries
  // -----------------------------------------------------------------------

  describe('section with multiple blocks', () => {
    it('scene with section trigger sets up with all entry block targets resolved', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      const el3 = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerBlockTargets('b3', { root: el3 })
      engine.registerSection('sec-1', ['b1', 'b2', 'b3'])

      const scene = makeSectionTriggerScene({
        entries: [
          makeEntry({ id: 'e1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
          makeEntry({ id: 'e2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
          makeEntry({ id: 'e3', sceneId: 'scene-section', target: makeTarget({ entityId: 'b3' }) }),
        ],
      })

      engine.loadScenes([scene])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
      expect(engine.getSceneAdapter('scene-section')).toBe('intersection')
    })

    it('deferred setup: registering section after loadScenes triggers setup', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })

      // Load scene before registering section
      engine.loadScenes([makeSectionTriggerScene()])
      expect(intersectionAdapter.setup).not.toHaveBeenCalled()

      // Now register section — should trigger setup synchronously
      engine.registerSection('sec-1', ['b1', 'b2'])
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
    })

    it('unregisterSection tears down affected scenes', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])
      engine.loadScenes([makeSectionTriggerScene()])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      engine.unregisterSection('sec-1')
      expect(intersectionAdapter.destroy).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // 7. Orphaned choreography entries — blocks deleted from section
  // -----------------------------------------------------------------------

  describe('orphaned choreography entries', () => {
    it('skips scene and logs error when section is registered but entry targets orphaned block', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.registerBlockTargets('b1', { root: el1 })
      // Section only contains b1; scene has an entry for b2 (orphaned — deleted from section)
      engine.registerSection('sec-1', ['b1'])

      const scene = makeSectionTriggerScene({
        sectionId: 'sec-1',
        entries: [
          makeEntry({ id: 'e1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
          makeEntry({ id: 'e2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
        ],
      })
      engine.loadScenes([scene])

      expect(intersectionAdapter.setup).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('b2'))
      consoleError.mockRestore()
    })

    it('stays silent when section is not registered (deferred-mount path)', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.registerBlockTargets('b1', { root: el1 })
      // Section not registered yet — deferred mount path, must stay silent
      const scene = makeSectionTriggerScene({
        sectionId: 'sec-1',
        entries: [
          makeEntry({ id: 'e1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
          makeEntry({ id: 'e2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
        ],
      })
      engine.loadScenes([scene])

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('sets up correctly when all entries belong to the registered section', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])

      const scene = makeSectionTriggerScene({
        sectionId: 'sec-1',
        entries: [
          makeEntry({ id: 'e1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
          makeEntry({ id: 'e2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
        ],
      })
      engine.loadScenes([scene])

      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)
      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('detects orphan via upsertScene after block removed from section', () => {
      const { engine } = mountEngine([intersectionAdapter])
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.registerBlockTargets('b1', { root: el1 })
      engine.registerBlockTargets('b2', { root: el2 })
      engine.registerSection('sec-1', ['b1', 'b2'])

      const scene = makeSectionTriggerScene({
        sectionId: 'sec-1',
        entries: [
          makeEntry({ id: 'e1', sceneId: 'scene-section', target: makeTarget({ entityId: 'b1' }) }),
          makeEntry({ id: 'e2', sceneId: 'scene-section', target: makeTarget({ entityId: 'b2' }) }),
        ],
      })
      engine.loadScenes([scene])
      expect(intersectionAdapter.setup).toHaveBeenCalledTimes(1)

      // Simulate block b2 removed from section
      engine.registerSection('sec-1', ['b1'])

      // Scene still references b2 — upsert should detect orphan
      engine.upsertScene(scene)

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('b2'))
      consoleError.mockRestore()
    })
  })
})
