import { describe, it, expect } from 'vitest'
import { resolveEntryOrder } from '~/shared/features/cms/animation/adapters/intersectionAdapter'
import type { AnimationEntry } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnimationEntry> & { id: string }): AnimationEntry {
  return {
    sceneId: 'scene-1',
    target: { entityType: 'block', entityId: 'block-1', part: 'root' },
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    position: { type: 'absolute', ms: 0 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEntryOrder', () => {
  it('single after-entry: B plays after A finishes + offset', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'A', duration: 500, position: { type: 'absolute', ms: 0 } }),
      makeEntry({
        id: 'B',
        position: { type: 'after-entry', entryId: 'A', offsetMs: 100 },
      }),
    ]

    const { order, delays, warnings } = resolveEntryOrder(entries, 500)

    expect(warnings).toHaveLength(0)
    expect(order.map((e) => e.id)).toEqual(['A', 'B'])
    expect(delays.get('A')).toBe(0)
    // B starts at A.delay(0) + A.duration(500) + offset(100) = 600
    expect(delays.get('B')).toBe(600)
  })

  it('chain of 3: A → B → C, correct cumulative delays', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'A', duration: 300, position: { type: 'absolute', ms: 0 } }),
      makeEntry({
        id: 'B',
        duration: 200,
        position: { type: 'after-entry', entryId: 'A', offsetMs: 50 },
      }),
      makeEntry({
        id: 'C',
        position: { type: 'after-entry', entryId: 'B', offsetMs: 100 },
      }),
    ]

    const { order, delays, warnings } = resolveEntryOrder(entries, 500)

    expect(warnings).toHaveLength(0)
    expect(order.map((e) => e.id)).toEqual(['A', 'B', 'C'])
    expect(delays.get('A')).toBe(0)
    // B: 0 + 300 + 50 = 350
    expect(delays.get('B')).toBe(350)
    // C: 350 + 200 + 100 = 650
    expect(delays.get('C')).toBe(650)
  })

  it('all absolute positions: no reordering', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'X', position: { type: 'absolute', ms: 200 } }),
      makeEntry({ id: 'Y', position: { type: 'absolute', ms: 0 } }),
      makeEntry({ id: 'Z', position: { type: 'absolute', ms: 100 } }),
    ]

    const { order, delays, warnings } = resolveEntryOrder(entries, 500)

    expect(warnings).toHaveLength(0)
    // All are roots in the dependency graph — original order preserved
    expect(order.map((e) => e.id)).toEqual(['X', 'Y', 'Z'])
    expect(delays.get('X')).toBe(200)
    expect(delays.get('Y')).toBe(0)
    expect(delays.get('Z')).toBe(100)
  })

  it('mixed absolute and after-entry', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'A', duration: 400, position: { type: 'absolute', ms: 100 } }),
      makeEntry({ id: 'B', position: { type: 'absolute', ms: 50 } }),
      makeEntry({
        id: 'C',
        position: { type: 'after-entry', entryId: 'A', offsetMs: 0 },
      }),
    ]

    const { order, delays, warnings } = resolveEntryOrder(entries, 500)

    expect(warnings).toHaveLength(0)
    expect(delays.get('A')).toBe(100)
    expect(delays.get('B')).toBe(50)
    // C: 100 + 400 + 0 = 500
    expect(delays.get('C')).toBe(500)
  })

  it('circular dependency: detected, warning produced, cycle broken', () => {
    const entries: AnimationEntry[] = [
      makeEntry({
        id: 'A',
        duration: 300,
        position: { type: 'after-entry', entryId: 'B', offsetMs: 0 },
      }),
      makeEntry({
        id: 'B',
        duration: 300,
        position: { type: 'after-entry', entryId: 'A', offsetMs: 0 },
      }),
    ]

    const { delays, warnings } = resolveEntryOrder(entries, 500)

    // At least one warning about circular dependency
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((w) => w.includes('Circular dependency'))).toBe(true)

    // Both entries should still have computed delays (cycle broken → absolute 0 for one)
    expect(delays.has('A')).toBe(true)
    expect(delays.has('B')).toBe(true)
  })

  it('after-entry referencing non-existent entry: treated as absolute 0', () => {
    const entries: AnimationEntry[] = [
      makeEntry({
        id: 'A',
        position: { type: 'after-entry', entryId: 'does-not-exist', offsetMs: 200 },
      }),
    ]

    const { delays, warnings } = resolveEntryOrder(entries, 500)

    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('non-existent')
    expect(delays.get('A')).toBe(0)
  })

  it('uses scene default duration when entry has no explicit duration', () => {
    const entries: AnimationEntry[] = [
      makeEntry({ id: 'A', position: { type: 'absolute', ms: 0 } }), // no duration → uses sceneDuration
      makeEntry({
        id: 'B',
        position: { type: 'after-entry', entryId: 'A', offsetMs: 0 },
      }),
    ]

    const { delays } = resolveEntryOrder(entries, 800)

    expect(delays.get('A')).toBe(0)
    // B: 0 + 800 (scene default) + 0 = 800
    expect(delays.get('B')).toBe(800)
  })
})
