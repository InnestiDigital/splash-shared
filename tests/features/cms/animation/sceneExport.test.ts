import { describe, it, expect, beforeEach } from 'vitest'
import type { AnimationScene, AnimationEntry, TargetRef } from '~/shared/types/animation'
import {
  exportScenes,
  validateImportBundle,
  remapSceneTargets,
  _setUUIDGenerator,
  type ExportedSceneBundle,
} from '~/shared/features/cms/animation/sceneExport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uuidCounter = 0

function makeTarget(overrides: Partial<TargetRef> = {}): TargetRef {
  return {
    entityType: 'block',
    entityId: 'block-1',
    part: 'root',
    ...overrides,
  }
}

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  return {
    id: 'entry-1',
    sceneId: 'scene-1',
    target: makeTarget(),
    keyframes: [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }],
    position: { type: 'absolute', ms: 0 },
    ...overrides,
  }
}

function makeScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-1',
    pageId: 'page-1',
    versionId: '_draft',
    trigger: {
      type: 'intersection',
      anchor: makeTarget(),
    },
    entries: [makeEntry()],
    ...overrides,
  }
}

function makeBlocks() {
  return [
    { id: 'block-1', type: 'hero' },
    { id: 'block-2', type: 'card' },
  ]
}

function makeValidBundle(overrides: Partial<ExportedSceneBundle> = {}): ExportedSceneBundle {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    pageId: 'page-1',
    scenes: [makeScene()],
    targetMap: {
      'block-1': { blockType: 'hero', part: 'root' },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  uuidCounter = 0
  _setUUIDGenerator(() => `new-uuid-${++uuidCounter}`)
})

// ---------------------------------------------------------------------------
// exportScenes
// ---------------------------------------------------------------------------

describe('exportScenes', () => {
  it('creates valid bundle with version and targetMap', () => {
    const scenes = [makeScene()]
    const blocks = makeBlocks()

    const bundle = exportScenes(scenes, blocks)

    expect(bundle.version).toBe('1.0')
    expect(bundle.exportedAt).toBeTruthy()
    expect(bundle.pageId).toBe('page-1')
    expect(bundle.scenes).toHaveLength(1)
    expect(bundle.targetMap['block-1']).toEqual({ blockType: 'hero', part: 'root' })
  })

  it('captures trigger anchor targets in targetMap', () => {
    const scene = makeScene({
      trigger: {
        type: 'scroll',
        anchor: makeTarget({ entityId: 'block-2', part: 'image' }),
        start: { edge: 'top', viewport: 0.85 },
      },
    })

    const bundle = exportScenes([scene], makeBlocks())

    expect(bundle.targetMap['block-2']).toEqual({ blockType: 'card', part: 'image' })
  })

  it('deep-clones scenes (mutations do not affect original)', () => {
    const scenes = [makeScene()]
    const bundle = exportScenes(scenes, makeBlocks())

    bundle.scenes[0].entries[0].target.entityId = 'mutated'
    expect(scenes[0].entries[0].target.entityId).toBe('block-1')
  })
})

// ---------------------------------------------------------------------------
// validateImportBundle
// ---------------------------------------------------------------------------

describe('validateImportBundle', () => {
  it('accepts valid bundle', () => {
    const result = validateImportBundle(makeValidBundle())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects null', () => {
    const result = validateImportBundle(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Bundle must be a non-null object')
  })

  it('rejects wrong version', () => {
    const result = validateImportBundle(makeValidBundle({ version: '2.0' as any }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Unsupported bundle version')
  })

  it('rejects missing scenes array', () => {
    const bundle = makeValidBundle()
    ;(bundle as any).scenes = 'not-an-array'
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('scenes must be an array')
  })

  it('rejects scene without id', () => {
    const bundle = makeValidBundle()
    ;(bundle.scenes[0] as any).id = 123
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('scenes[0].id must be a string')
  })

  it('rejects scene without trigger', () => {
    const bundle = makeValidBundle()
    ;(bundle.scenes[0] as any).trigger = null
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('scenes[0].trigger must be an object')
  })

  it('rejects scene without entries array', () => {
    const bundle = makeValidBundle()
    ;(bundle.scenes[0] as any).entries = 'not-array'
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('scenes[0].entries must be an array')
  })

  it('rejects missing targetMap', () => {
    const bundle = makeValidBundle()
    ;(bundle as any).targetMap = null
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('targetMap must be a non-null object')
  })

  it('rejects missing exportedAt', () => {
    const bundle = makeValidBundle()
    ;(bundle as any).exportedAt = 42
    const result = validateImportBundle(bundle)
    expect(result.valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// remapSceneTargets
// ---------------------------------------------------------------------------

describe('remapSceneTargets', () => {
  it('rewrites all entityIds using the mapping', () => {
    const bundle = makeValidBundle()
    const mapping = { 'block-1': 'new-block-1' }

    const result = remapSceneTargets(bundle, mapping)

    expect(result[0].entries[0].target.entityId).toBe('new-block-1')
  })

  it('rewrites trigger anchor entityIds', () => {
    const bundle = makeValidBundle({
      scenes: [makeScene({
        trigger: {
          type: 'intersection',
          anchor: makeTarget({ entityId: 'block-1' }),
        },
      })],
    })
    const mapping = { 'block-1': 'new-block-1' }

    const result = remapSceneTargets(bundle, mapping)

    const trigger = result[0].trigger as { type: 'intersection'; anchor: TargetRef }
    expect(trigger.anchor.entityId).toBe('new-block-1')
  })

  it('rewrites scroll trigger anchor entityIds', () => {
    const bundle = makeValidBundle({
      scenes: [makeScene({
        trigger: {
          type: 'scroll',
          anchor: makeTarget({ entityId: 'block-1' }),
          start: { edge: 'top', viewport: 0.5 },
        },
      })],
    })

    const result = remapSceneTargets(bundle, { 'block-1': 'mapped-block' })

    const trigger = result[0].trigger as { type: 'scroll'; anchor: TargetRef }
    expect(trigger.anchor.entityId).toBe('mapped-block')
  })

  it('rewrites event trigger source entityIds', () => {
    const bundle = makeValidBundle({
      scenes: [makeScene({
        trigger: {
          type: 'event',
          event: 'click',
          source: makeTarget({ entityId: 'block-1' }),
        },
      })],
    })

    const result = remapSceneTargets(bundle, { 'block-1': 'clicked-block' })

    const trigger = result[0].trigger as { type: 'event'; source: TargetRef }
    expect(trigger.source.entityId).toBe('clicked-block')
  })

  it('generates new scene and entry UUIDs', () => {
    const bundle = makeValidBundle()

    const result = remapSceneTargets(bundle, {})

    expect(result[0].id).not.toBe('scene-1')
    expect(result[0].entries[0].id).not.toBe('entry-1')
    expect(result[0].entries[0].sceneId).toBe(result[0].id)
  })

  it('remaps after-entry position references to new entry UUIDs', () => {
    const entry1 = makeEntry({ id: 'entry-1' })
    const entry2 = makeEntry({
      id: 'entry-2',
      target: makeTarget({ entityId: 'block-1' }),
      position: { type: 'after-entry', entryId: 'entry-1', offsetMs: 200 },
    })

    const bundle = makeValidBundle({
      scenes: [makeScene({ entries: [entry1, entry2] })],
    })

    const result = remapSceneTargets(bundle, {})

    const pos = result[0].entries[1].position
    expect(pos.type).toBe('after-entry')
    if (pos.type === 'after-entry') {
      // Should point to the new UUID of entry-1, not the old one
      expect(pos.entryId).toBe(result[0].entries[0].id)
      expect(pos.entryId).not.toBe('entry-1')
    }
  })

  it('leaves unmapped entityIds unchanged', () => {
    const bundle = makeValidBundle()

    const result = remapSceneTargets(bundle, { 'other-block': 'mapped' })

    expect(result[0].entries[0].target.entityId).toBe('block-1')
  })
})

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip export → import', () => {
  it('preserves scene structure through export and remap', () => {
    const originalScene = makeScene({
      entries: [
        makeEntry({ id: 'e1', target: makeTarget({ entityId: 'block-1', part: 'root' }) }),
        makeEntry({
          id: 'e2',
          target: makeTarget({ entityId: 'block-2', part: 'image' }),
          position: { type: 'after-entry', entryId: 'e1', offsetMs: 100 },
        }),
      ],
      defaults: { duration: 300, easing: 'ease-out' },
    })

    const blocks = makeBlocks()
    const bundle = exportScenes([originalScene], blocks)

    // Simulate importing to a page with different block IDs
    const mapping = { 'block-1': 'target-block-A', 'block-2': 'target-block-B' }
    const imported = remapSceneTargets(bundle, mapping)

    expect(imported).toHaveLength(1)
    const scene = imported[0]

    // Structure preserved
    expect(scene.entries).toHaveLength(2)
    expect(scene.defaults).toEqual({ duration: 300, easing: 'ease-out' })
    expect(scene.trigger.type).toBe('intersection')

    // IDs remapped
    expect(scene.entries[0].target.entityId).toBe('target-block-A')
    expect(scene.entries[1].target.entityId).toBe('target-block-B')

    // New UUIDs
    expect(scene.id).not.toBe(originalScene.id)
    expect(scene.entries[0].id).not.toBe('e1')
    expect(scene.entries[1].id).not.toBe('e2')

    // After-entry ref updated
    const pos = scene.entries[1].position
    expect(pos.type).toBe('after-entry')
    if (pos.type === 'after-entry') {
      expect(pos.entryId).toBe(scene.entries[0].id)
    }

    // Keyframes preserved
    expect(scene.entries[0].keyframes).toEqual(originalScene.entries[0].keyframes)
  })
})
