import { describe, it, expect } from 'vitest'
import type {
  AnimationEntry,
  ChoreographyMeta,
} from '~/shared/types/animation'
import { applyChoreographyDelays } from '~/shared/features/cms/animation/sceneResolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  const id = overrides.id ?? 'entry-1'
  const entityId = overrides.target?.entityId ?? 'b1'
  return {
    id,
    sceneId: 'scene-1',
    target: { entityType: 'block', entityId, part: 'root' },
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    position: { type: 'absolute', ms: 0 },
    ...overrides,
  }
}

function chore(overrides: Partial<ChoreographyMeta> = {}): ChoreographyMeta {
  return {
    mode: 'stagger',
    baseDelay: 100,
    order: 'top-down',
    ...overrides,
  }
}

/**
 * Extract `position.ms` from an absolute entry. Throws if not absolute to
 * keep assertions unambiguous.
 */
function posMs(entry: AnimationEntry): number {
  if (entry.position.type !== 'absolute') {
    throw new Error(`expected absolute position, got ${entry.position.type}`)
  }
  return entry.position.ms
}

// ---------------------------------------------------------------------------
// No-op cases
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — no-op cases', () => {
  it('null choreography → returns entries unchanged', () => {
    const entries = [makeEntry({ target: { entityType: 'block', entityId: 'b1', part: 'root' } })]
    const original = entries[0].position
    const result = applyChoreographyDelays(entries, null, 'sec-1', ['b1', 'b2'])
    expect(result).toBe(entries)
    expect(entries[0].position).toBe(original)
  })

  it('undefined choreography → returns entries unchanged', () => {
    const entries = [makeEntry()]
    const before = JSON.stringify(entries)
    applyChoreographyDelays(entries, undefined, 'sec-1', ['b1'])
    expect(JSON.stringify(entries)).toBe(before)
  })

  it("mode 'none' → returns entries unchanged", () => {
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'b2', part: 'root' } }),
    ]
    const before = JSON.stringify(entries)
    applyChoreographyDelays(entries, chore({ mode: 'none' }), 'sec-1', ['b1', 'b2'])
    expect(JSON.stringify(entries)).toBe(before)
  })

  it('empty entries list → no-op', () => {
    const entries: AnimationEntry[] = []
    const result = applyChoreographyDelays(entries, chore(), 'sec-1', ['b1'])
    expect(result).toBe(entries)
    expect(result.length).toBe(0)
  })

  it('empty orderedBlockIds → no-op', () => {
    const entries = [makeEntry()]
    const before = JSON.stringify(entries)
    applyChoreographyDelays(entries, chore(), 'sec-1', [])
    expect(JSON.stringify(entries)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Simultaneous mode
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — simultaneous mode', () => {
  it('writes position.ms = 0 for every matching entry', () => {
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'b2', part: 'root' } }),
      makeEntry({ id: 'e3', target: { entityType: 'block', entityId: 'b3', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'simultaneous' }),
      'sec-1',
      ['b1', 'b2', 'b3'],
    )
    expect(entries.map(posMs)).toEqual([0, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// Stagger mode
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — stagger mode', () => {
  it('top-down: delays follow visual order × baseDelay', () => {
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'b2', part: 'root' } }),
      makeEntry({ id: 'e3', target: { entityType: 'block', entityId: 'b3', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 120, order: 'top-down' }),
      'sec-1',
      ['b1', 'b2', 'b3'],
    )
    expect(posMs(entries[0])).toBe(0)
    expect(posMs(entries[1])).toBe(120)
    expect(posMs(entries[2])).toBe(240)
  })

  it('bottom-up: reverses visual order before assigning delays', () => {
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'b2', part: 'root' } }),
      makeEntry({ id: 'e3', target: { entityType: 'block', entityId: 'b3', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100, order: 'bottom-up' }),
      'sec-1',
      ['b1', 'b2', 'b3'],
    )
    // bottom-up: b3 index 0 → 0ms, b2 index 1 → 100ms, b1 index 2 → 200ms
    expect(posMs(entries[0])).toBe(200) // b1 is now last
    expect(posMs(entries[1])).toBe(100) // b2 is middle
    expect(posMs(entries[2])).toBe(0) // b3 plays first
  })

  it('delay is derived from section position, not entries index', () => {
    // Only one entry but it targets the 3rd block in the section —
    // should get the 3rd block's delay.
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b3', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100, order: 'top-down' }),
      'sec-1',
      ['b1', 'b2', 'b3', 'b4'],
    )
    expect(posMs(entries[0])).toBe(200) // index 2 × 100
  })

  it('entry targeting a block outside the section is skipped', () => {
    const entries = [
      makeEntry({ id: 'e1', target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
      makeEntry({ id: 'e2', target: { entityType: 'block', entityId: 'outside', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100, order: 'top-down' }),
      'sec-1',
      ['b1', 'b2'],
    )
    expect(posMs(entries[0])).toBe(0)
    // outside block untouched — preserves original 0
    expect(posMs(entries[1])).toBe(0)
  })

  it('non-block target entries are skipped', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        target: { entityType: 'section', entityId: 'sec-1', part: 'root' },
        position: { type: 'absolute', ms: 0 },
      }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100 }),
      'sec-1',
      ['b1'],
    )
    // Section-type entry untouched
    expect(entries[0].position).toEqual({ type: 'absolute', ms: 0 })
  })
})

// ---------------------------------------------------------------------------
// Wave mode
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — wave mode', () => {
  it('single block → delay 0', () => {
    const entries = [
      makeEntry({ target: { entityType: 'block', entityId: 'b1', part: 'root' } }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'wave', baseDelay: 100 }),
      'sec-1',
      ['b1'],
    )
    expect(posMs(entries[0])).toBe(0)
  })

  it('multi-block: delays are monotonic non-decreasing', () => {
    const ids = ['b1', 'b2', 'b3', 'b4', 'b5']
    const entries = ids.map((id) =>
      makeEntry({ id: `e-${id}`, target: { entityType: 'block', entityId: id, part: 'root' } }),
    )
    applyChoreographyDelays(
      entries,
      chore({ mode: 'wave', baseDelay: 100 }),
      'sec-1',
      ids,
    )
    const delays = entries.map(posMs)
    // First is 0
    expect(delays[0]).toBe(0)
    // Strictly ascending index × baseDelay offset ensures monotonic
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
    }
  })

  it('wave adds sinusoidal offset on top of linear progression', () => {
    // With baseDelay=100 and 5 blocks, wave amplitude = Math.round(100 * 0.75) = 75.
    // For middle index (i=2, total=5): sin(2π/5) ≈ 0.951 → offset ≈ 71
    // Delay(2) = 200 + 71 = 271 (roughly)
    const ids = ['b1', 'b2', 'b3', 'b4', 'b5']
    const entries = ids.map((id) =>
      makeEntry({ id: `e-${id}`, target: { entityType: 'block', entityId: id, part: 'root' } }),
    )
    applyChoreographyDelays(
      entries,
      chore({ mode: 'wave', baseDelay: 100 }),
      'sec-1',
      ids,
    )
    // Middle block delay must exceed pure-linear (200ms) by the wave amplitude
    expect(posMs(entries[2])).toBeGreaterThan(200)
    // But still below pure-linear + full amplitude (200+75 = 275) since sin < 1
    expect(posMs(entries[2])).toBeLessThanOrEqual(275)
  })

  it('wave with bottom-up order reverses block indexing', () => {
    const ids = ['b1', 'b2', 'b3']
    const entries = ids.map((id) =>
      makeEntry({ id: `e-${id}`, target: { entityType: 'block', entityId: id, part: 'root' } }),
    )
    applyChoreographyDelays(
      entries,
      chore({ mode: 'wave', baseDelay: 100, order: 'bottom-up' }),
      'sec-1',
      ids,
    )
    // bottom-up: b3 → index 0 (delay 0), b1 → index 2 (largest delay)
    expect(posMs(entries[2])).toBe(0) // b3 first
    expect(posMs(entries[0])).toBeGreaterThan(posMs(entries[2])) // b1 last
  })
})

// ---------------------------------------------------------------------------
// Precedence rule — explicit entry timing wins
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — entry-level precedence', () => {
  it('entries with explicit staggerGroup + staggerDelay are untouched', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        target: { entityType: 'block', entityId: 'b1', part: 'root' },
        staggerGroup: 'group-a',
        staggerDelay: 50,
      }),
      makeEntry({
        id: 'e2',
        target: { entityType: 'block', entityId: 'b2', part: 'root' },
      }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100 }),
      'sec-1',
      ['b1', 'b2'],
    )
    // e1 has explicit stagger → choreography must not write position.ms
    expect(entries[0].position).toEqual({ type: 'absolute', ms: 0 })
    // e2 has no explicit timing → choreography applied (index 1 × 100)
    expect(posMs(entries[1])).toBe(100)
  })

  it('entries with non-zero explicit position.ms are untouched', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        target: { entityType: 'block', entityId: 'b1', part: 'root' },
        position: { type: 'absolute', ms: 500 },
      }),
      makeEntry({
        id: 'e2',
        target: { entityType: 'block', entityId: 'b2', part: 'root' },
      }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100 }),
      'sec-1',
      ['b1', 'b2'],
    )
    expect(posMs(entries[0])).toBe(500) // preserved
    expect(posMs(entries[1])).toBe(100) // filled in
  })

  it('entries with after-entry position are untouched', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        target: { entityType: 'block', entityId: 'b1', part: 'root' },
        position: { type: 'after-entry', entryId: 'other', offsetMs: 200 },
      }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100 }),
      'sec-1',
      ['b1'],
    )
    expect(entries[0].position).toEqual({
      type: 'after-entry',
      entryId: 'other',
      offsetMs: 200,
    })
  })

  it('entries with only staggerGroup (no staggerDelay) still receive choreography', () => {
    // Precedence guard requires BOTH staggerGroup + staggerDelay to be set.
    const entries = [
      makeEntry({
        id: 'e1',
        target: { entityType: 'block', entityId: 'b1', part: 'root' },
        staggerGroup: 'group-a',
      }),
    ]
    applyChoreographyDelays(
      entries,
      chore({ mode: 'stagger', baseDelay: 100 }),
      'sec-1',
      ['b1', 'b2'],
    )
    // index 0 × 100 = 0
    expect(posMs(entries[0])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// In-place mutation / return semantics
// ---------------------------------------------------------------------------

describe('applyChoreographyDelays — return semantics', () => {
  it('returns the same array reference (in-place mutation)', () => {
    const entries = [makeEntry()]
    const result = applyChoreographyDelays(
      entries,
      chore(),
      'sec-1',
      ['b1'],
    )
    expect(result).toBe(entries)
  })
})
