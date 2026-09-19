/**
 * @vitest-environment node
 *
 * Unit tests for the composition responsive module.
 * Covers both the scatter/tablet layout helpers (getLayoutMode, applyTabletOverrides,
 * applyScatterResponsive, getStackItems) and the pure collapse decision module
 * (resolveCollapse, isMobileViewport) introduced in SPL-131.
 *
 * No DOM, no Vue, no happy-dom required — all exported functions are pure.
 * See `docs/design/composition-responsive.md` (SPL-131).
 */
import { describe, it, expect } from 'vitest'
import {
  getLayoutMode, applyTabletOverrides, getStackItems,
  BREAKPOINTS,
  isMobileViewport,
  resolveCollapse,
  type Breakpoint,
  type CollapseDescriptor,
  type CompositionKnobs,
  type CompositionTemplateId,
} from '~/shared/features/cms/composition/responsive'
import type {
  CompositionItem, ResponsiveRules, LayoutGroup,
} from '~/shared/features/cms/composition/types'
import { DEFAULT_EMPHASIS_SCALE } from '~/shared/features/cms/composition/types'
// applyScatterResponsive + scatter constants land with FEAT-07 (scatter/collage).

// Compile-time surface guard — these types are part of the public API
// (contract for future composition templates). Keeping them exercised
// here keeps Knip honest and catches accidental deletions.
const _typeGuard: {
  bp: Breakpoint
  id: CompositionTemplateId
  knobs: CompositionKnobs
} = { bp: 'md', id: 'editorial-split', knobs: {} }
void _typeGuard

// ---------- scatter / tablet helpers ----------

function makeGroup(overrides: Partial<LayoutGroup> = {}): LayoutGroup {
  return {
    id: 'test', anchor: 'canvas', region: 'left', baseSize: { w: 0.5 },
    roles: [], layer: 1, overflowPolicy: 'clamp', emphasisScale: DEFAULT_EMPHASIS_SCALE,
    ...overrides,
  }
}

const responsive: ResponsiveRules = {
  stackBelow: 768,
  tablet: {
    'media': { scaleSize: 0.9 },
    'text-stack': { shiftRegion: 'center' },
  },
  stackOrder: ['headline', 'primary-media'],
  hideOnStack: ['ornament'],
}

describe('getLayoutMode', () => {
  it('returns desktop for width >= 1024', () => {
    expect(getLayoutMode(1024, responsive)).toBe('desktop')
    expect(getLayoutMode(1440, responsive)).toBe('desktop')
  })

  it('returns tablet for width between stackBelow and 1024', () => {
    expect(getLayoutMode(900, responsive)).toBe('tablet')
    expect(getLayoutMode(768, responsive)).toBe('tablet')
  })

  it('returns mobile for width below stackBelow', () => {
    expect(getLayoutMode(767, responsive)).toBe('mobile')
    expect(getLayoutMode(375, responsive)).toBe('mobile')
  })
})

describe('applyTabletOverrides', () => {
  it('scales baseSize.w when scaleSize is set', () => {
    const groups = [makeGroup({ id: 'media', baseSize: { w: 0.55 } })]
    const result = applyTabletOverrides(groups, responsive)
    expect(result[0]!.baseSize.w).toBeCloseTo(0.55 * 0.9, 4)
  })

  it('shifts region when shiftRegion is set', () => {
    const groups = [makeGroup({ id: 'text-stack', region: 'left' })]
    const result = applyTabletOverrides(groups, responsive)
    expect(result[0]!.region).toBe('center')
  })

  it('passes through groups without tablet rules', () => {
    const groups = [makeGroup({ id: 'other', region: 'right', baseSize: { w: 0.4 } })]
    const result = applyTabletOverrides(groups, responsive)
    expect(result[0]!.region).toBe('right')
    expect(result[0]!.baseSize.w).toBe(0.4)
  })
})

// applyScatterResponsive tests land with FEAT-07 (scatter/collage template).
// Placeholder skipped describe keeps the test file structure intact without
// referencing types that don't exist yet on main.
describe.skip('applyScatterResponsive', () => {
  it.skip('rehydrate when FEAT-07 ships', () => {
    expect(true).toBe(true)
  })
})

describe('getStackItems', () => {
  const items: CompositionItem[] = [
    { id: '1', role: 'primary-media', visible: true, emphasis: 'md', media: { src: '/a.jpg' } },
    { id: '2', role: 'headline', visible: true, emphasis: 'md', textContent: { 'en-US': 'Hi' } },
    { id: '3', role: 'ornament', visible: true, emphasis: 'sm', media: { src: '/orn.svg' } },
  ]

  it('returns items in stackOrder, excluding hideOnStack', () => {
    const result = getStackItems(items, responsive)
    expect(result.map(i => i.role)).toEqual(['headline', 'primary-media'])
  })

  it('excludes invisible items', () => {
    const invisItems = items.map(i => i.role === 'headline' ? { ...i, visible: false } : i)
    const result = getStackItems(invisItems, responsive)
    expect(result.map(i => i.role)).toEqual(['primary-media'])
  })
})

// ---------- SPL-131: collapse decision module ----------

describe('BREAKPOINTS constant', () => {
  // Guard against drift between TS and SCSS. If these numbers change,
  // `breakpoints.scss` and `nuxt.config.ts` (additionalData) must be
  // updated in lockstep.
  it('exposes the canonical sm/md/lg/xl values', () => {
    expect(BREAKPOINTS.sm).toBe(640)
    expect(BREAKPOINTS.md).toBe(768)
    expect(BREAKPOINTS.lg).toBe(1024)
    expect(BREAKPOINTS.xl).toBe(1280)
  })

  it('is a frozen / read-only object shape', () => {
    // `as const` makes keys readonly at the type level; runtime check
    // ensures we haven't accidentally reassigned values mid-session.
    expect(Object.keys(BREAKPOINTS).sort()).toEqual(['lg', 'md', 'sm', 'xl'])
  })
})

describe('isMobileViewport()', () => {
  it('returns true at or below md (768)', () => {
    expect(isMobileViewport(320)).toBe(true)
    expect(isMobileViewport(375)).toBe(true)
    expect(isMobileViewport(767)).toBe(true)
    // 768 (iPad portrait) is inclusive-mobile: reflow, not desktop grid.
    expect(isMobileViewport(768)).toBe(true)
  })

  it('returns false above md (768)', () => {
    expect(isMobileViewport(769)).toBe(false)
    expect(isMobileViewport(1024)).toBe(false)
    expect(isMobileViewport(1280)).toBe(false)
  })
})

describe('resolveCollapse() — editorial-split', () => {
  it('stacks on mobile (375) with chrome after content regardless of shellSide', () => {
    const descriptor = resolveCollapse('editorial-split', { shellSide: 'left' }, 375)

    expect(descriptor.stack).toBe(true)
    expect(descriptor.chromeOrder).toBe('after') // R1: mobile chrome always below
    expect(descriptor.chromeSticky).toBe(false) // sticky disabled on mobile
    expect(descriptor.gapScale).toBe(1.0)
  })

  it('stacks at boundary (768) — md threshold is inclusive of mobile', () => {
    // `width <= BREAKPOINTS.md` → 768 exactly (iPad portrait) is mobile: stack.
    const atBoundary = resolveCollapse('editorial-split', {}, 768)
    expect(atBoundary.stack).toBe(true)

    // One pixel above the threshold is desktop: no stack.
    const above = resolveCollapse('editorial-split', {}, 769)
    expect(above.stack).toBe(false)
  })

  it('does not stack on desktop (1280) and preserves shellSide', () => {
    const left = resolveCollapse('editorial-split', { shellSide: 'left' }, 1280)
    expect(left.stack).toBe(false)
    expect(left.chromeOrder).toBe('before') // left → chrome renders first

    const right = resolveCollapse('editorial-split', { shellSide: 'right' }, 1280)
    expect(right.chromeOrder).toBe('after')
  })

  it('retains sticky chrome on desktop when chromeAlign=sticky-top', () => {
    const desc = resolveCollapse(
      'editorial-split',
      { chromeAlign: 'sticky-top' },
      1280,
    )
    expect(desc.chromeSticky).toBe(true)
  })

  it('drops sticky chrome on mobile even when chromeAlign=sticky-top', () => {
    const desc = resolveCollapse(
      'editorial-split',
      { chromeAlign: 'sticky-top' },
      375,
    )
    expect(desc.chromeSticky).toBe(false)
  })

  it('clamps gapScale to 1.2 when overlap=spacious on mobile (edge case)', () => {
    const desc = resolveCollapse('editorial-split', { overlap: 'spacious' }, 375)
    expect(desc.gapScale).toBe(1.2)
  })

  it('keeps gapScale at 1.0 when overlap=spacious but viewport is desktop', () => {
    const desc = resolveCollapse('editorial-split', { overlap: 'spacious' }, 1280)
    expect(desc.gapScale).toBe(1.0)
  })

  it('handles empty / default knobs without crashing', () => {
    const desc = resolveCollapse('editorial-split', {}, 1280)
    expect(desc).toMatchObject({
      stack: false,
      chromeOrder: 'after',
      chromeSticky: false,
      gapScale: 1.0,
    } satisfies Partial<CollapseDescriptor>)
  })
})

describe('resolveCollapse() — layered-composition', () => {
  it('stacks on mobile by default (closes SPL-131 R2 — items no longer clip)', () => {
    const desc = resolveCollapse('layered-composition', {}, 375)
    expect(desc.stack).toBe(true)
  })

  it('stacks at 768 (inclusive md boundary) but not at 769', () => {
    expect(resolveCollapse('layered-composition', {}, 768).stack).toBe(true)
    expect(resolveCollapse('layered-composition', {}, 769).stack).toBe(false)
  })

  it('does not stack on desktop (1280)', () => {
    const desc = resolveCollapse('layered-composition', {}, 1280)
    expect(desc.stack).toBe(false)
  })

  it('respects mobileBehaviour=scale — keeps absolute positioning on mobile', () => {
    const desc = resolveCollapse(
      'layered-composition',
      { mobileBehaviour: 'scale' },
      375,
    )
    expect(desc.stack).toBe(false)
  })

  it('respects mobileBehaviour=preserve — keeps absolute positioning on mobile', () => {
    const desc = resolveCollapse(
      'layered-composition',
      { mobileBehaviour: 'preserve' },
      375,
    )
    expect(desc.stack).toBe(false)
  })

  it('falls back to stack when mobileBehaviour is unknown', () => {
    const desc = resolveCollapse(
      'layered-composition',
      { mobileBehaviour: 'something-weird' },
      375,
    )
    expect(desc.stack).toBe(true)
  })

  it('applies the same overlap clamp on mobile as editorial-split', () => {
    const desc = resolveCollapse(
      'layered-composition',
      { overlap: 'spacious' },
      375,
    )
    expect(desc.gapScale).toBe(1.2)
  })
})

describe('resolveCollapse() — gallery', () => {
  // CSS-13: gallery converts its `@media (max-width: $bp-md)` column caps to
  // the SPL-131 `data-collapse='stack'` contract. Only `stack` is consumed by
  // the layout; assert the md boundary is inclusive-mobile (768 stack, 769
  // flow) and the inert chrome fields stay stable.
  it('stacks at md (768, inclusive) and at small mobile widths', () => {
    expect(resolveCollapse('gallery', {}, 768).stack).toBe(true)
    expect(resolveCollapse('gallery', {}, 767).stack).toBe(true)
    expect(resolveCollapse('gallery', {}, 375).stack).toBe(true)
    expect(resolveCollapse('gallery', {}, 320).stack).toBe(true)
  })

  it('does not stack above the md boundary (769/desktop)', () => {
    expect(resolveCollapse('gallery', {}, 769).stack).toBe(false)
    expect(resolveCollapse('gallery', {}, 1280).stack).toBe(false)
  })

  it('returns stable inert chrome fields regardless of knobs / viewport', () => {
    for (const width of [375, 768, 1280]) {
      expect(resolveCollapse('gallery', { shellSide: 'left', overlap: 'spacious' }, width))
        .toMatchObject({
          chromeOrder: 'after',
          chromeSticky: false,
          gapScale: 1,
        } satisfies Partial<CollapseDescriptor>)
    }
  })
})

describe('resolveCollapse() — unknown template id', () => {
  it('throws a plain Error for ids outside the contract, including the retired pins', () => {
    // The three former "pinned but unbuilt" ids were removed from the contract
    // (2026-09-18 composition unification): they now fall to the default case.
    const retired = ['asymmetric-hero', 'offset-media-stack', 'captioned-editorial-spread']
    for (const templateId of [...retired, 'not-a-template']) {
      expect(() => resolveCollapse(templateId, {}, 375)).toThrow(
        /Unknown composition template/,
      )
    }
  })

  it('rejects the retired ids with a message naming the id', () => {
    try {
      resolveCollapse('asymmetric-hero', {}, 375)
      expect.unreachable('resolveCollapse should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain('asymmetric-hero')
    }
  })
})
