import { describe, it, expect } from 'vitest'
import {
  compositionSolver, topologicalSortGroups,
  lerp, clamp01, toFloat,
  dominanceMultiplier, overlapMultiplier, overlapOffsetScale, alignmentValue,
  DOMINANCE_ENUM, OVERLAP_ENUM,
  DOMINANCE_MIN, DOMINANCE_MAX, OVERLAP_MIN, OVERLAP_MAX,
} from '~/shared/features/cms/composition/solver'
import type { CompositionTemplate, CompositionItem, LayoutGroup } from '~/shared/features/cms/composition/types'
import { DEFAULT_KNOBS, DEFAULT_EMPHASIS_SCALE } from '~/shared/features/cms/composition/types'

function makeGroup(overrides: Partial<LayoutGroup>): LayoutGroup {
  return {
    id: 'test',
    anchor: 'canvas',
    region: 'left',
    baseSize: { w: 0.5 },
    roles: [],
    layer: 1,
    overflowPolicy: 'clamp',
    emphasisScale: DEFAULT_EMPHASIS_SCALE,
    ...overrides,
  }
}

const twoGroupTemplate: CompositionTemplate = {
  id: 'test',
  label: { 'en-US': 'Test' },
  description: { 'en-US': '' },
  defaultHeight: 'large',
  roles: {
    'primary-media': { required: true, contentType: 'media', defaultEmphasis: 'lg' },
    'headline': { required: true, contentType: 'text', defaultEmphasis: 'lg' },
  },
  groups: [
    makeGroup({ id: 'media', anchor: 'canvas', region: 'right', baseSize: { w: 0.55 }, roles: ['primary-media'], layer: 1, overflowPolicy: 'allow' }),
    makeGroup({ id: 'text', anchor: 'canvas', region: 'left', baseSize: { w: 0.45 }, roles: ['headline'], layer: 3 }),
  ],
  floaters: {},
  responsive: { stackBelow: 768, stackOrder: ['headline', 'primary-media'] },
  defaultKnobs: DEFAULT_KNOBS,
}

const items: CompositionItem[] = [
  { id: 'img-1', role: 'primary-media', visible: true, emphasis: 'md', media: { src: '/hero.jpg' } },
  { id: 'txt-1', role: 'headline', visible: true, emphasis: 'md', textContent: { 'en-US': 'Hello' } },
]

describe('topologicalSortGroups', () => {
  it('canvas-anchored groups come first', () => {
    const groups = [
      makeGroup({ id: 'a', anchor: 'canvas' }),
      makeGroup({ id: 'b', anchor: 'canvas' }),
    ]
    const order = topologicalSortGroups(groups)
    expect(order).toHaveLength(2)
  })

  it('dependent groups come after their anchors', () => {
    const groups = [
      makeGroup({ id: 'caption-zone', anchor: 'media' }),
      makeGroup({ id: 'media', anchor: 'canvas' }),
    ]
    const order = topologicalSortGroups(groups)
    expect(order.indexOf('media')).toBeLessThan(order.indexOf('caption-zone'))
  })

  it('throws on cycle', () => {
    const groups = [
      makeGroup({ id: 'a', anchor: 'b' }),
      makeGroup({ id: 'b', anchor: 'a' }),
    ]
    expect(() => topologicalSortGroups(groups)).toThrow(/cycle/i)
  })
})

describe('compositionSolver', () => {
  it('returns resolved rects for groups', () => {
    const result = compositionSolver(twoGroupTemplate, items, DEFAULT_KNOBS, 1200)
    expect(result['group:media']).toBeDefined()
    expect(result['group:text']).toBeDefined()
  })

  it('right-region group has positive left offset', () => {
    const result = compositionSolver(twoGroupTemplate, items, DEFAULT_KNOBS, 1200)
    const left = parseFloat(result['group:media']!.left)
    expect(left).toBeGreaterThan(0)
  })

  it('left-region group has left near 0', () => {
    const result = compositionSolver(twoGroupTemplate, items, DEFAULT_KNOBS, 1200)
    const left = parseFloat(result['group:text']!.left)
    expect(left).toBeLessThanOrEqual(5)
  })

  it('group zIndex matches layer', () => {
    const result = compositionSolver(twoGroupTemplate, items, DEFAULT_KNOBS, 1200)
    expect(result['group:media']!.zIndex).toBe(1)
    expect(result['group:text']!.zIndex).toBe(3)
  })

  it('groups with no visible items are skipped', () => {
    const invisItems = items.map(i => i.role === 'headline' ? { ...i, visible: false } : i)
    const result = compositionSolver(twoGroupTemplate, invisItems, DEFAULT_KNOBS, 1200)
    expect(result['group:text']).toBeUndefined()
    expect(result['group:media']).toBeDefined()
  })

  it('dominance=media scales media group wider', () => {
    const mediaKnobs = { ...DEFAULT_KNOBS, dominance: 'media' as const }
    const balanced = compositionSolver(twoGroupTemplate, items, DEFAULT_KNOBS, 1200)
    const mediaDom = compositionSolver(twoGroupTemplate, items, mediaKnobs, 1200)
    expect(parseFloat(mediaDom['group:media']!.width)).toBeGreaterThan(parseFloat(balanced['group:media']!.width))
  })

  it('floaters are positioned relative to their anchor group', () => {
    const t: CompositionTemplate = {
      ...twoGroupTemplate,
      roles: {
        ...twoGroupTemplate.roles,
        'caption': { required: false, contentType: 'text', defaultEmphasis: 'sm' },
      },
      floaters: {
        'caption': {
          anchor: 'media',
          region: 'bottom-left',
          sizeMode: 'intrinsic-text',
          baseSize: { w: 0.35 },
          overlap: { x: 0.15, y: 0.1 },
          layer: 2,
          emphasisScale: DEFAULT_EMPHASIS_SCALE,
          overflowPolicy: 'clamp',
        },
      },
      responsive: { ...twoGroupTemplate.responsive, stackOrder: ['headline', 'primary-media', 'caption'] },
    }
    const fItems = [
      ...items,
      { id: 'cap-1', role: 'caption' as const, visible: true, emphasis: 'sm' as const, textContent: { 'en-US': 'Cap' } },
    ]
    const result = compositionSolver(t, fItems, DEFAULT_KNOBS, 1200)
    expect(result['cap-1']).toBeDefined()
    expect(result['cap-1']!.height).toBe('auto')
  })

  // SPL-002 regression: continuous `overlap` slider values must reach the
  // floater placement loop. Before the fix, `overlapScale` did an enum-only
  // string match so numeric 0 vs 1 collapsed to the default 1.0 multiplier
  // and floater `left` was identical — the slider was dead in the UI.
  it('continuous knobs.overlap shifts floater position (SPL-002)', () => {
    const t: CompositionTemplate = {
      ...twoGroupTemplate,
      roles: {
        ...twoGroupTemplate.roles,
        'caption': { required: false, contentType: 'text', defaultEmphasis: 'sm' },
      },
      floaters: {
        'caption': {
          anchor: 'media',
          region: 'bottom-left',
          sizeMode: 'intrinsic-text',
          baseSize: { w: 0.35 },
          overlap: { x: 0.15, y: 0.1 },
          layer: 2,
          emphasisScale: DEFAULT_EMPHASIS_SCALE,
          overflowPolicy: 'allow', // don't clamp — we need to observe raw offset
        },
      },
      responsive: { ...twoGroupTemplate.responsive, stackOrder: ['headline', 'primary-media', 'caption'] },
    }
    const fItems = [
      ...items,
      { id: 'cap-1', role: 'caption' as const, visible: true, emphasis: 'sm' as const, textContent: { 'en-US': 'Cap' } },
    ]

    // Cast through unknown because CompositionKnobs.overlap is still typed as
    // the legacy enum (see SPL-120 follow-up) — runtime accepts numbers.
    const tight = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 0 as unknown as typeof DEFAULT_KNOBS.overlap }, 1200)
    const spacious = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 1 as unknown as typeof DEFAULT_KNOBS.overlap }, 1200)

    expect(tight['cap-1']!.left).not.toBe(spacious['cap-1']!.left)
  })

  // SPL-002: legacy enum content must render identically to the matching
  // numeric endpoint so pre-SPL-120 stored knobs keep working.
  it('legacy enum "tight"/"spacious" match numeric 0/1 for floater placement (SPL-002)', () => {
    const t: CompositionTemplate = {
      ...twoGroupTemplate,
      roles: {
        ...twoGroupTemplate.roles,
        'caption': { required: false, contentType: 'text', defaultEmphasis: 'sm' },
      },
      floaters: {
        'caption': {
          anchor: 'media',
          region: 'bottom-left',
          sizeMode: 'intrinsic-text',
          baseSize: { w: 0.35 },
          overlap: { x: 0.15, y: 0.1 },
          layer: 2,
          emphasisScale: DEFAULT_EMPHASIS_SCALE,
          overflowPolicy: 'allow',
        },
      },
      responsive: { ...twoGroupTemplate.responsive, stackOrder: ['headline', 'primary-media', 'caption'] },
    }
    const fItems = [
      ...items,
      { id: 'cap-1', role: 'caption' as const, visible: true, emphasis: 'sm' as const, textContent: { 'en-US': 'Cap' } },
    ]

    const numericTight = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 0 as unknown as typeof DEFAULT_KNOBS.overlap }, 1200)
    const enumTight = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 'tight' }, 1200)
    const numericSpacious = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 1 as unknown as typeof DEFAULT_KNOBS.overlap }, 1200)
    const enumSpacious = compositionSolver(t, fItems, { ...DEFAULT_KNOBS, overlap: 'spacious' }, 1200)

    expect(numericTight['cap-1']!.left).toBe(enumTight['cap-1']!.left)
    expect(numericSpacious['cap-1']!.left).toBe(enumSpacious['cap-1']!.left)
  })
})

// ---------------------------------------------------------------------------
// Continuous knob helpers (SPL-120)
// ---------------------------------------------------------------------------

describe('lerp', () => {
  it('returns start at t=0', () => { expect(lerp(10, 20, 0)).toBe(10) })
  it('returns end at t=1', () => { expect(lerp(10, 20, 1)).toBe(20) })
  it('returns midpoint at t=0.5', () => { expect(lerp(10, 20, 0.5)).toBe(15) })
})

describe('clamp01', () => {
  it('clamps negatives to 0', () => { expect(clamp01(-1)).toBe(0) })
  it('clamps >1 to 1', () => { expect(clamp01(2)).toBe(1) })
  it('passes through valid values', () => { expect(clamp01(0.42)).toBe(0.42) })
})

describe('toFloat', () => {
  it('returns clamped number for numeric input', () => {
    expect(toFloat(0.3, DOMINANCE_ENUM)).toBe(0.3)
    expect(toFloat(2, DOMINANCE_ENUM)).toBe(1)
    expect(toFloat(-0.5, DOMINANCE_ENUM)).toBe(0)
  })
  it('maps known enum strings via table', () => {
    expect(toFloat('media', DOMINANCE_ENUM)).toBe(1)
    expect(toFloat('balanced', DOMINANCE_ENUM)).toBe(0.5)
    expect(toFloat('text', DOMINANCE_ENUM)).toBe(0)
    expect(toFloat('tight', OVERLAP_ENUM)).toBe(0)
    expect(toFloat('normal', OVERLAP_ENUM)).toBe(0.5)
    expect(toFloat('spacious', OVERLAP_ENUM)).toBe(1)
  })
  it('falls back to default for unknown strings', () => {
    expect(toFloat('whatever', DOMINANCE_ENUM)).toBe(0.5)
  })
  it('falls back for null/undefined/NaN', () => {
    expect(toFloat(undefined, DOMINANCE_ENUM)).toBe(0.5)
    expect(toFloat(null, DOMINANCE_ENUM)).toBe(0.5)
    expect(toFloat(NaN, DOMINANCE_ENUM)).toBe(0.5)
  })
  it('uses explicit fallback when provided', () => {
    expect(toFloat(undefined, DOMINANCE_ENUM, 0.9)).toBe(0.9)
  })
})

describe('dominanceMultiplier', () => {
  it('maps endpoints to [DOMINANCE_MIN, DOMINANCE_MAX]', () => {
    expect(dominanceMultiplier(0)).toBeCloseTo(DOMINANCE_MIN, 5)
    expect(dominanceMultiplier(1)).toBeCloseTo(DOMINANCE_MAX, 5)
  })
  it('maps midpoint to range midpoint', () => {
    expect(dominanceMultiplier(0.5)).toBeCloseTo((DOMINANCE_MIN + DOMINANCE_MAX) / 2, 5)
  })
  it('clamps out-of-range numeric inputs', () => {
    expect(dominanceMultiplier(-1)).toBeCloseTo(DOMINANCE_MIN, 5)
    expect(dominanceMultiplier(5)).toBeCloseTo(DOMINANCE_MAX, 5)
  })
  it('accepts legacy enum strings', () => {
    expect(dominanceMultiplier('text')).toBeCloseTo(DOMINANCE_MIN, 5)
    expect(dominanceMultiplier('balanced')).toBeCloseTo((DOMINANCE_MIN + DOMINANCE_MAX) / 2, 5)
    expect(dominanceMultiplier('media')).toBeCloseTo(DOMINANCE_MAX, 5)
  })
  it('falls back to neutral for unknown/undefined', () => {
    const neutral = (DOMINANCE_MIN + DOMINANCE_MAX) / 2
    expect(dominanceMultiplier(undefined)).toBeCloseTo(neutral, 5)
    expect(dominanceMultiplier('bogus')).toBeCloseTo(neutral, 5)
    expect(dominanceMultiplier(null)).toBeCloseTo(neutral, 5)
  })
})

describe('overlapMultiplier', () => {
  it('maps endpoints to [OVERLAP_MIN, OVERLAP_MAX]', () => {
    expect(overlapMultiplier(0)).toBeCloseTo(OVERLAP_MIN, 5)
    expect(overlapMultiplier(1)).toBeCloseTo(OVERLAP_MAX, 5)
  })
  it('maps midpoint to range midpoint', () => {
    expect(overlapMultiplier(0.5)).toBeCloseTo((OVERLAP_MIN + OVERLAP_MAX) / 2, 5)
  })
  it('accepts legacy enum strings', () => {
    expect(overlapMultiplier('tight')).toBeCloseTo(OVERLAP_MIN, 5)
    expect(overlapMultiplier('normal')).toBeCloseTo((OVERLAP_MIN + OVERLAP_MAX) / 2, 5)
    expect(overlapMultiplier('spacious')).toBeCloseTo(OVERLAP_MAX, 5)
  })
  it('has the same output for numeric 1 and legacy "spacious"', () => {
    expect(overlapMultiplier(1)).toBeCloseTo(overlapMultiplier('spacious'), 10)
  })
})

// ---------------------------------------------------------------------------
// overlapOffsetScale (SPL-002 regression — continuous-aware floater offset)
// ---------------------------------------------------------------------------
//
// This helper powers the internal `overlapScale(knobs)` used in the Phase 2
// floater placement loop. Before SPL-002 it ignored numeric slider values and
// always returned 1.0, silently killing the Overlap slider in the editor.

describe('overlapOffsetScale', () => {
  it('maps numeric 0 → OVERLAP_MAX (tight pulls floater further over the anchor edge)', () => {
    expect(overlapOffsetScale(0)).toBeCloseTo(OVERLAP_MAX, 5)
  })
  it('maps numeric 1 → OVERLAP_MIN (spacious keeps floater closer to anchor edge)', () => {
    expect(overlapOffsetScale(1)).toBeCloseTo(OVERLAP_MIN, 5)
  })
  it('maps numeric 0.5 to neutral (≈ 1.0 within <0.1 tolerance)', () => {
    expect(Math.abs(overlapOffsetScale(0.5) - 1)).toBeLessThan(0.1)
  })
  it('interpolates monotonically for intermediate values', () => {
    expect(overlapOffsetScale(0.25)).toBeGreaterThan(overlapOffsetScale(0.5))
    expect(overlapOffsetScale(0.5)).toBeGreaterThan(overlapOffsetScale(0.75))
  })
  it('polarity is inverted vs. overlapMultiplier (high t → smaller offset)', () => {
    expect(overlapOffsetScale(0)).toBeGreaterThan(overlapOffsetScale(1))
  })
  it('accepts legacy enum strings with the same polarity', () => {
    expect(overlapOffsetScale('tight')).toBeCloseTo(OVERLAP_MAX, 5)
    expect(overlapOffsetScale('spacious')).toBeCloseTo(OVERLAP_MIN, 5)
    expect(overlapOffsetScale('normal')).toBeCloseTo((OVERLAP_MIN + OVERLAP_MAX) / 2, 5)
  })
  it('legacy "tight" and numeric 0 produce identical output', () => {
    expect(overlapOffsetScale('tight')).toBeCloseTo(overlapOffsetScale(0), 10)
  })
  it('legacy "spacious" and numeric 1 produce identical output', () => {
    expect(overlapOffsetScale('spacious')).toBeCloseTo(overlapOffsetScale(1), 10)
  })
  it('clamps out-of-range numeric inputs', () => {
    expect(overlapOffsetScale(-1)).toBeCloseTo(OVERLAP_MAX, 5)
    expect(overlapOffsetScale(5)).toBeCloseTo(OVERLAP_MIN, 5)
  })
  it('falls back to neutral for unknown/undefined/null', () => {
    const neutral = (OVERLAP_MIN + OVERLAP_MAX) / 2
    expect(overlapOffsetScale(undefined)).toBeCloseTo(neutral, 5)
    expect(overlapOffsetScale(null)).toBeCloseTo(neutral, 5)
    expect(overlapOffsetScale('bogus')).toBeCloseTo(neutral, 5)
  })
})

describe('alignmentValue', () => {
  it('passes through valid values', () => {
    expect(alignmentValue('left')).toBe('left')
    expect(alignmentValue('balanced')).toBe('balanced')
    expect(alignmentValue('right')).toBe('right')
  })
  it('falls back to "balanced" for unknown/undefined', () => {
    expect(alignmentValue('center')).toBe('balanced')
    expect(alignmentValue(undefined)).toBe('balanced')
    expect(alignmentValue(null)).toBe('balanced')
    expect(alignmentValue(0.5)).toBe('balanced')
  })
})

describe('neutral-default guarantee', () => {
  it('dominance midpoint multiplier stays close to 1', () => {
    expect(Math.abs(dominanceMultiplier(0.5) - 1)).toBeLessThan(0.1)
  })
  it('overlap midpoint multiplier stays close to 1', () => {
    expect(Math.abs(overlapMultiplier(0.5) - 1)).toBeLessThan(0.1)
  })
})
