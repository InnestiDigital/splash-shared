import { describe, it, expect } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  IntersectionTrigger,
  ScrollTrigger,
} from '~/shared/types/animation'
import { scenesEqual } from '~/shared/features/cms/animation/sceneEquality'

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

describe('scenesEqual', () => {
  it('returns true for the same reference', () => {
    const scene = makeScene()
    expect(scenesEqual(scene, scene)).toBe(true)
  })

  it('returns true for structurally identical scenes', () => {
    expect(scenesEqual(makeScene(), makeScene())).toBe(true)
  })

  it('returns true when scenes are identical but keys were inserted in different order', () => {
    // A: canonical order
    const a: AnimationScene = {
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

    // B: same data, different key insertion order (triggers different
    // JSON.stringify output but identical structure)
    const b: AnimationScene = {
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

    // Sanity: JSON.stringify would disagree
    expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false)

    // scenesEqual treats them as equal
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('ignores stable fields (id, pageId, versionId) — only mutable fields drive equality', () => {
    const a = makeScene({ id: 'scene-1', pageId: 'page-1', versionId: 'v-1' })
    const b = makeScene({ id: 'scene-999', pageId: 'other-page', versionId: 'v-99' })
    // Stable fields differ but mutable fields match — treated as equal.
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('detects a keyframe offset change', () => {
    const a = makeScene()
    const b = makeScene({
      entries: [makeEntry({ keyframes: [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 0.5 }, // changed
      ] })],
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a trigger type change', () => {
    const a = makeScene()
    const b = makeScene({
      trigger: {
        type: 'scroll',
        anchor: 'viewport',
        start: { edge: 'top', viewport: 0.85 },
      } as ScrollTrigger,
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects an added entry', () => {
    const a = makeScene()
    const b = makeScene({
      entries: [makeEntry(), makeEntry({ id: 'entry-2' })],
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a removed optional field on nested objects', () => {
    const a = makeScene({
      entries: [makeEntry({ duration: 500 })],
    })
    const b = makeScene({
      entries: [makeEntry()],
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects conditions changes', () => {
    const a = makeScene({ conditions: { minBreakpoint: 'md' } })
    const b = makeScene({ conditions: { minBreakpoint: 'lg' } })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats undefined vs missing conditions equivalently', () => {
    const a = makeScene()
    const b = makeScene({ conditions: undefined })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('detects defaults changes', () => {
    const a = makeScene({ defaults: { duration: 300 } })
    const b = makeScene({ defaults: { duration: 600 } })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects allowCrossBlock toggle', () => {
    const a = makeScene({ allowCrossBlock: false })
    const b = makeScene({ allowCrossBlock: true })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats a nested transform object with reordered keys as equal', () => {
    const a = makeScene({
      entries: [makeEntry({
        keyframes: [
          { offset: 0, transform: { x: '0', y: '20px', scale: 1 } },
          { offset: 1, transform: { x: '0', y: '0', scale: 1 } },
        ],
      })],
    })
    const b = makeScene({
      entries: [makeEntry({
        keyframes: [
          { offset: 0, transform: { scale: 1, y: '20px', x: '0' } },
          { offset: 1, transform: { scale: 1, x: '0', y: '0' } },
        ],
      })],
    })
    expect(scenesEqual(a, b)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // SPL-016 — previously uncovered mutable fields
  // ---------------------------------------------------------------------------

  it('detects a disabled toggle', () => {
    const a = makeScene({ disabled: false })
    const b = makeScene({ disabled: true })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats undefined vs missing disabled equivalently', () => {
    const a = makeScene()
    const b = makeScene({ disabled: undefined })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('detects a sectionId change (re-target to a different section)', () => {
    const a = makeScene({ sectionId: 'section-a' })
    const b = makeScene({ sectionId: 'section-b' })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats undefined vs missing sectionId equivalently', () => {
    const a = makeScene()
    const b = makeScene({ sectionId: undefined })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('detects a choreographyMeta.name change', () => {
    const a = makeScene({ choreographyMeta: { name: 'Hero reveal' } })
    const b = makeScene({ choreographyMeta: { name: 'Hero reveal v2' } })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a choreographyMeta.templateId change', () => {
    const a = makeScene({ choreographyMeta: { templateId: 'tpl-stagger' } })
    const b = makeScene({ choreographyMeta: { templateId: 'tpl-wave' } })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats choreographyMeta with reordered keys as equal', () => {
    const a = makeScene({
      choreographyMeta: { name: 'Hero', templateId: 'tpl-1' },
    })
    const b = makeScene({
      choreographyMeta: { templateId: 'tpl-1', name: 'Hero' },
    })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('treats undefined vs missing choreographyMeta equivalently', () => {
    const a = makeScene()
    const b = makeScene({ choreographyMeta: undefined })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('detects a sectionChoreography.meta.mode change', () => {
    const a = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const b = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'wave', baseDelay: 80, order: 'top-down' },
      },
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a sectionChoreography.meta.baseDelay change', () => {
    const a = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const b = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 160, order: 'top-down' },
      },
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a sectionChoreography.meta.order change', () => {
    const a = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const b = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'bottom-up' },
      },
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('detects a sectionChoreography.orderedBlockIds change', () => {
    const a = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
        orderedBlockIds: ['b1', 'b2', 'b3'],
      },
    })
    const b = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
        orderedBlockIds: ['b1', 'b3', 'b2'],
      },
    })
    expect(scenesEqual(a, b)).toBe(false)
  })

  it('treats sectionChoreography.meta with reordered keys as equal', () => {
    const a = makeScene({
      sectionChoreography: {
        sectionId: 's-1',
        meta: { mode: 'stagger', baseDelay: 80, order: 'top-down' },
      },
    })
    const b = makeScene({
      sectionChoreography: {
        meta: { order: 'top-down', baseDelay: 80, mode: 'stagger' },
        sectionId: 's-1',
      },
    })
    expect(scenesEqual(a, b)).toBe(true)
  })

  it('treats undefined vs missing sectionChoreography equivalently', () => {
    const a = makeScene()
    const b = makeScene({ sectionChoreography: undefined })
    expect(scenesEqual(a, b)).toBe(true)
  })
})
