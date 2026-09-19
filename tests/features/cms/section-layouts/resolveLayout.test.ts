import { describe, it, expect, vi } from 'vitest'
import {
  applyLayoutBindings,
  applyPreset,
  cloneLayout,
  resolveLayoutTier,
  floorTierId,
  parseBindTarget,
  parsePresetTarget,
  presetById,
  resolveBoundValues,
  resolveFlowOptions,
  resolveSectionLayout,
  settingApplies,
  sectionRootStyle,
  gridItemStyle,
  slotFlowStyle,
  zoneFlowStyle,
  stacksAtFloor,
  layeredHeightStyle,
  isStripLargeItem,
  isLayeredOptions,
  effectiveColumns,
  gapRem,
  gapToken,
  carouselItemsPerPage,
  carouselInterval,
  declaredRoles,
  UNROLED_ROLE,
} from '~/shared/features/cms/section-layouts/engine/resolveLayout'
import type {
  BindingContext,
  SchemaSetting,
} from '~/shared/features/cms/section-layouts/engine/types'
import type {
  LayoutDraft,
  SectionLayoutDefinition,
  SectionPresetDefinition,
} from '~/shared/types/sectionTypes'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

function ctx(overrides: Partial<BindingContext> = {}): BindingContext {
  return { activeTier: 'full', sectionIndex: 0, onWarn: vi.fn(), ...overrides }
}

function warned(ctx: BindingContext): string[] {
  return (ctx.onWarn as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0] as string)
}

// A minimal two-tier layout: full (desktop) and stack (floor).
function baseLayout(overrides: Partial<SectionLayoutDefinition> = {}): SectionLayoutDefinition {
  return {
    engine: 'v2',
    tiers: [
      { id: 'full', minWidth: 'lg' },
      { id: 'stack', minWidth: null },
    ],
    areas: { full: ['media text'] },
    columns: { stack: 'minmax(0, 1fr)', full: '2fr 3fr' },
    rows: { stack: 'auto', full: 'auto' },
    gap: { row: 'md', column: 'md' },
    zones: {},
    slots: [
      { role: 'media', zone: null, flow: 'stack', flowOptions: {}, hiddenIn: [] },
      { role: 'text', zone: null, flow: 'stack', flowOptions: {}, hiddenIn: [] },
    ],
    ...overrides,
  } as unknown as SectionLayoutDefinition
}

function draft(layout = baseLayout()): LayoutDraft {
  return cloneLayout(layout)
}

function setting(overrides: Record<string, unknown> = {}): SchemaSetting {
  return { id: 's1', type: 'select', default: 'a', ...overrides } as unknown as SchemaSetting
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

describe('resolveLayoutTier', () => {
  const tiers = [
    { id: 'full', minWidth: 'lg' as const },
    { id: 'stack', minWidth: null },
  ]

  it('activates the floor tier at or below the gated breakpoint', () => {
    expect(resolveLayoutTier(tiers, BREAKPOINTS.lg)).toBe('stack')
  })

  it('activates a gated tier strictly above its breakpoint', () => {
    expect(resolveLayoutTier(tiers, BREAKPOINTS.lg + 1)).toBe('full')
  })

  it('falls back to the last declared tier when no breakpoint matches', () => {
    const unknown = [{ id: 'a', minWidth: 'unknown-key' as never }, { id: 'b', minWidth: null }]
    expect(resolveLayoutTier(unknown, 1440)).toBe('b')
    expect(resolveLayoutTier([{ id: 'a', minWidth: 'unknown-key' as never }], 1440)).toBe('a')
  })

  it('yields null for an empty tier list', () => {
    expect(resolveLayoutTier([], 1440)).toBeNull()
  })
})

describe('floorTierId', () => {
  it('finds the minWidth:null tier', () => {
    expect(floorTierId([{ id: 'full', minWidth: 'lg' as const }, { id: 'stack', minWidth: null }])).toBe('stack')
  })

  it('yields null when no tier declares null', () => {
    expect(floorTierId([{ id: 'full', minWidth: 'lg' as const }])).toBeNull()
    expect(floorTierId([])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// cloneLayout normalisation
// ---------------------------------------------------------------------------

describe('cloneLayout', () => {
  it('normalises every optional field to an explicit value', () => {
    const d = draft(baseLayout({
      areas: {},
      zones: {
        sidebar: { flow: 'stack', gap: 'sm', sticky: { top: '1rem', tiers: ['full'] }, offset: { x: '2px', y: '3px' }, zIndex: 7, hiddenIn: ['stack'] },
      },
    }))
    expect(d.placeItems).toBe('start stretch')
    expect(d.minHeight).toBeNull()
    expect(d.zoneOrder).toEqual(['sidebar'])
    expect(d.zones.sidebar).toEqual({
      flow: 'stack', gap: 'sm', placeSelf: 'start stretch',
      sticky: { top: '1rem', tiers: ['full'] }, offset: { x: '2px', y: '3px' },
      zIndex: 7, hiddenIn: ['stack'],
    })
  })

  it('defaults an absent sticky, offset, zIndex and hiddenIn on a zone', () => {
    const d = draft(baseLayout({ zones: { main: { flow: 'stack', gap: 'md' } } }))
    expect(d.zones.main).toEqual({
      flow: 'stack', gap: 'md', placeSelf: 'start stretch',
      sticky: null, offset: null, zIndex: null, hiddenIn: [],
    })
  })

  it('copies slots with their optional item properties and drops malformed ones', () => {
    const d = draft(baseLayout({
      slots: [
        {
          role: 'media', flow: 'carousel', zone: 'main', flowOptions: { columns: 3 },
          placeSelf: 'center stretch', sticky: { top: '0px', tiers: ['full'] },
          offset: { x: '1px', y: '2px' }, zIndex: 5, hiddenIn: ['stack'],
        },
        {
          role: 'text', flow: 'stack', flowOptions: {},
          place: { column: '1 / -1', row: '2 / span 2' },
          sticky: { top: 3 as never, tiers: 'full' as never }, offset: { x: 1 as never, y: 'ok' },
          zIndex: Number.POSITIVE_INFINITY,
        },
      ],
    }))
    expect(d.slots[0]).toMatchObject({ zone: 'main', place: null, placeSelf: 'center stretch', zIndex: 5 })
    expect(d.slots[1]).toMatchObject({ zone: null, place: { column: '1 / -1', row: '2 / span 2' } })
    expect(d.slots[1]!.sticky).toBeNull()
    expect(d.slots[1]!.offset).toBeNull()
    expect(d.slots[1]!.zIndex).toBeNull()
  })

  it('copies areas and zones as independent mutable arrays (patching does not leak into the schema)', () => {
    const layout = baseLayout({ areas: { full: ['"a b"'] } })
    const d = draft(layout)
    d.areas.full!.push('"c d"')
    expect(layout.areas.full).toEqual(['"a b"'])
  })
})

// ---------------------------------------------------------------------------
// parseBindTarget
// ---------------------------------------------------------------------------

describe('parseBindTarget', () => {
  it('parses grid targets', () => {
    expect(parseBindTarget('columns')).toEqual({ kind: 'grid', field: 'columns' })
    expect(parseBindTarget('gap.row')).toEqual({ kind: 'grid', field: 'gap.row' })
  })

  it('parses zone and slot paths', () => {
    expect(parseBindTarget('zone.body.gap')).toEqual({ kind: 'zone', zone: 'body', field: 'gap' })
    expect(parseBindTarget('slot.media.placeSelf')).toEqual({ kind: 'slot', role: 'media', field: 'placeSelf' })
  })

  it('parses slot flowOptions', () => {
    expect(parseBindTarget('slot.media.flowOptions.columns')).toEqual({ kind: 'slotFlowOption', role: 'media', key: 'columns' })
  })

  it('yields unknown for malformed shapes and typo fields', () => {
    expect(parseBindTarget('zon.body.gap').kind).toBe('unknown')
    expect(parseBindTarget('zone.body').kind).toBe('unknown')
    expect(parseBindTarget('zone.body.bogus').kind).toBe('unknown')
    expect(parseBindTarget('slot.media.flowOptions').kind).toBe('unknown')
    expect(parseBindTarget('not-a-target').kind).toBe('unknown')
    expect(parseBindTarget('zone.body.invented').kind).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// applyLayoutBindings — value guards and warn channel
// ---------------------------------------------------------------------------

describe('applyLayoutBindings — grid targets', () => {
  it('writes tier-scoped column bindings only to their tier', () => {
    const s = setting({
      id: 'cols', default: 'x',
      layoutBind: [{ target: 'columns', tier: 'full' }],
      options: [{ value: 'x', label: 'X', layoutValues: { columns: 'repeat(4, 1fr)' } }],
    }) as unknown as SchemaSetting
    const d = applyLayoutBindings(draft(), [s], { cols: 'x' }, ctx())
    expect(d.columns.full).toBe('repeat(4, 1fr)')
    expect(d.columns.stack).toBe('minmax(0, 1fr)')
  })

  it('applies a non-scoped binding to every declared tier', () => {
    const s = setting({
      id: 'cols', default: 'x',
      layoutBind: [{ target: 'columns' }],
      options: [{ value: 'x', label: 'X', layoutValues: { columns: 'repeat(4, 1fr)' } }],
    }) as unknown as SchemaSetting
    const d = applyLayoutBindings(draft(), [s], { cols: 'x' }, ctx())
    expect(d.columns.full).toBe('repeat(4, 1fr)')
    expect(d.columns.stack).toBe('repeat(4, 1fr)')
  })

  it('warns and drops a track list that is not a string', () => {
    const s = setting({
      layoutBind: [{ target: 'columns' }],
      options: [{ value: 'x', label: 'X', layoutValues: { columns: 42 } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'x' }, c)
    expect(warned(c)[0]).toContain('columns expects a track list string')
  })

  it('warns on an areas binding that is not an array of strings', () => {
    const s = setting({
      layoutBind: [{ target: 'areas' }],
      options: [{ value: 'x', label: 'X', layoutValues: { areas: ['ok', 3] } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'x' }, c)
    expect(warned(c)[0]).toContain('areas expects an array of row strings')
  })

  it('binds tier-scoped areas rows and gap/placeItems/minHeight grid targets', () => {
    const s = setting({
      id: 'variant', default: 'd',
      layoutBind: [
        { target: 'areas', tier: 'full' },
        { target: 'gap.row' },
        { target: 'gap.column' },
        { target: 'placeItems' },
        { target: 'minHeight' },
      ],
      options: [{
        value: 'd', label: 'D',
        layoutValues: {
          areas: ['"one two"', '"three three"'], 'gap.row': 'lg', 'gap.column': 'sm',
          placeItems: 'center center', minHeight: '50vh',
        },
      }],
    }) as unknown as SchemaSetting
    const d = applyLayoutBindings(draft(), [s], { variant: 'd' }, ctx())
    expect(d.areas.full).toEqual(['"one two"', '"three three"'])
    expect(d.gap.row).toBe('lg')
    expect(d.gap.column).toBe('sm')
    expect(d.placeItems).toBe('center center')
    expect(d.minHeight).toBe('50vh')
  })

  it('warns on a gap tier value that is not a spacing tier', () => {
    const s = setting({
      layoutBind: [{ target: 'gap.row' }],
      options: [{ value: 'a', label: 'A', layoutValues: { 'gap.row': 'gigantic' } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'a' }, c)
    expect(warned(c)[0]).toContain('gap.row expects a spacing tier')
  })

  it('warns on non-string placeItems and minHeight', () => {
    for (const target of ['placeItems', 'minHeight'] as const) {
      const s = setting({
        layoutBind: [{ target }],
        options: [{ value: 'a', label: 'A', layoutValues: { [target]: 12 } }],
      }) as unknown as SchemaSetting
      const c = ctx()
      applyLayoutBindings(draft(), [s], { s1: 'a' }, c)
      expect(warned(c)[0]).toMatch(new RegExp(`${target} expects a`))
    }
  })

  it('warns on binding an undeclared zone or slot', () => {
    const s = setting({
      layoutBind: [
        { target: 'zone.ghost.placeSelf' },
        { target: 'slot.ghost.zIndex' },
        { target: 'slot.ghost.flowOptions.columns' },
        { target: 'made.up.target' },
      ],
      options: [{ value: 'a', label: 'A', layoutValues: {
        'zone.ghost.placeSelf': 'center', 'slot.ghost.zIndex': 1,
        'slot.ghost.flowOptions.columns': 4, 'made.up.target': 'x',
      } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'a' }, c)
    expect(warned(c)).toHaveLength(4)
    expect(warned(c)[0]).toContain('undeclared zone "ghost"')
    expect(warned(c)[1]).toContain('undeclared slot "ghost"')
    expect(warned(c)[2]).toContain('undeclared slot "ghost"')
    expect(warned(c)[3]).toContain('unknown layoutBind target')
  })

  it('writes zone bindings of every field kind', () => {
    const layout = baseLayout({ zones: { main: { flow: 'stack', gap: 'sm' } } })
    const s = setting({
      layoutBind: [
        { target: 'zone.main.flow' },
        { target: 'zone.main.gap' },
        { target: 'zone.main.placeSelf' },
        { target: 'zone.main.sticky' },
        { target: 'zone.main.offset' },
        { target: 'zone.main.zIndex' },
        { target: 'zone.main.hiddenIn' },
      ],
      options: [{ value: 'a', label: 'A', layoutValues: {
        'zone.main.flow': 'grid',
        'zone.main.gap': 'xl',
        'zone.main.placeSelf': 'center start',
        'zone.main.sticky': { top: '2rem', tiers: ['full'] },
        'zone.main.offset': { x: '1px', y: '2px' },
        'zone.main.zIndex': 9,
        'zone.main.hiddenIn': ['stack'],
      } }],
    }) as unknown as SchemaSetting
    const d = applyLayoutBindings(draft(layout), [s], { s1: 'a' }, ctx())
    const z = d.zones.main!
    expect(z.flow).toBe('grid')
    expect(z.gap).toBe('xl')
    expect(z.placeSelf).toBe('center start')
    expect(z.sticky).toEqual({ top: '2rem', tiers: ['full'] })
    expect(z.offset).toEqual({ x: '1px', y: '2px' })
    expect(z.zIndex).toBe(9)
    expect(z.hiddenIn).toEqual(['stack'])
  })

  it('warns and drops malformed zone values instead of coercing', () => {
    const layout = baseLayout({ zones: { main: { flow: 'stack', gap: 'sm' } } })
    const s = setting({
      layoutBind: [
        { target: 'zone.main.flow' }, { target: 'zone.main.gap' }, { target: 'zone.main.placeSelf' },
        { target: 'zone.main.sticky' }, { target: 'zone.main.offset' }, { target: 'zone.main.zIndex' },
        { target: 'zone.main.hiddenIn' },
      ],
      options: [{ value: 'a', label: 'A', layoutValues: {
        'zone.main.flow': 'explode', 'zone.main.gap': 'x', 'zone.main.placeSelf': 4,
        'zone.main.sticky': { top: 1 }, 'zone.main.offset': { x: '1px', y: 2 },
        'zone.main.zIndex': 'high', 'zone.main.hiddenIn': 'stack',
      } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(layout), [s], { s1: 'a' }, c)
    expect(warned(c)).toHaveLength(7)
    const z = draft(layout).zones.main!
    expect(z.flow).toBe('stack')
    expect(z.gap).toBe('sm')
    expect(z.sticky).toBeNull()
  })

  it('writes slot bindings of every field kind, resetting place when zoned', () => {
    const layout = baseLayout({
      slots: [
        { role: 'media', zone: null, place: { column: '1 / 2', row: '1 / 2' }, flow: 'grid', flowOptions: { columns: 2 }, hiddenIn: [] },
      ],
    })
    const s = setting({
      layoutBind: [
        { target: 'slot.media.zone' }, { target: 'slot.media.flow' },
        { target: 'slot.media.placeSelf' }, { target: 'slot.media.sticky' },
        { target: 'slot.media.offset' }, { target: 'slot.media.zIndex' },
        { target: 'slot.media.hiddenIn' }, { target: 'slot.media.flowOptions.columns' },
        { target: 'slot.media.flowOptions.newKey' },
      ],
      options: [{ value: 'a', label: 'A', layoutValues: {
        'slot.media.zone': 'main', 'slot.media.flow': 'carousel',
        'slot.media.placeSelf': 'end center', 'slot.media.sticky': null,
        'slot.media.offset': { x: '4px', y: '5px' }, 'slot.media.zIndex': 9,
        'slot.media.hiddenIn': ['stack'], 'slot.media.flowOptions.columns': 5,
        'slot.media.flowOptions.newKey': true,
      } }],
    }) as unknown as SchemaSetting
    const layout2 = baseLayout({ zones: { main: { flow: 'stack', gap: 'sm' } } })
    const d = applyLayoutBindings(draft({ ...layout, zones: layout2.zones }), [s], { s1: 'a' }, ctx())
    const slot = d.slots[0]!
    expect(slot.zone).toBe('main')
    expect(slot.place).toBeNull()
    expect(slot.flow).toBe('carousel')
    expect(slot.placeSelf).toBe('end center')
    expect(slot.sticky).toBeNull()
    expect(slot.offset).toEqual({ x: '4px', y: '5px' })
    expect(slot.zIndex).toBe(9)
    expect(slot.hiddenIn).toEqual(['stack'])
    expect(slot.flowOptions).toEqual({ columns: 5, newKey: true })
  })

  it('warns on malformed slot and flowOption values', () => {
    const s = setting({
      layoutBind: [
        { target: 'slot.media.zone' }, { target: 'slot.media.flow' },
        { target: 'slot.media.placeSelf' }, { target: 'slot.media.sticky' },
        { target: 'slot.media.offset' }, { target: 'slot.media.zIndex' },
        { target: 'slot.media.hiddenIn' }, { target: 'slot.media.flowOptions.columns' },
      ],
      options: [{ value: 'a', label: 'A', layoutValues: {
        'slot.media.zone': 1, 'slot.media.flow': 'nope', 'slot.media.placeSelf': {},
        'slot.media.sticky': 'yes', 'slot.media.offset': 'nope',
        'slot.media.zIndex': '1', 'slot.media.hiddenIn': [1],
        'slot.media.flowOptions.columns': [1, 2],
      } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'a' }, c)
    expect(warned(c)).toHaveLength(8)
  })

  it('drops a flowOptions value that is not a string, number or boolean', () => {
    const s = setting({
      layoutBind: [{ target: 'slot.media.flowOptions.columns' }],
      options: [{ value: 'a', label: 'A', layoutValues: { 'slot.media.flowOptions.columns': ['no'] } }],
    }) as unknown as SchemaSetting
    const c = ctx()
    applyLayoutBindings(draft(), [s], { s1: 'a' }, c)
    expect(warned(c)[0]).toContain('flowOptions.columns expects a string, number or boolean')
  })

  it('skips a tier-scoped binding on a non-tier-mapped target while another tier is active', () => {
    const s = setting({
      id: 'variant', default: 'a',
      layoutBind: [{ target: 'placeItems', tier: 'full' }],
      options: [{ value: 'a', label: 'A', layoutValues: { placeItems: 'center center' } }],
    }) as unknown as SchemaSetting
    const c = ctx({ activeTier: 'stack' })
    const d = applyLayoutBindings(draft(), [s], { variant: 'a' }, c)
    expect(d.placeItems).toBe('start stretch')
    expect(warned(c)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// resolveBoundValues + settingApplies + resolvers
// ---------------------------------------------------------------------------

describe('resolveBoundValues', () => {
  it('returns null for an option list with no default match', () => {
    const s = setting({ options: [{ value: 'b', label: 'B' }] })
    expect(resolveBoundValues(s, 'b', ctx())).toBeNull()
  })

  it('warns and falls back to the default on an unknown stored value', () => {
    const s = setting({
      options: [
        { value: 'a', label: 'A', layoutValues: { columns: '1fr' } },
        { value: 'b', label: 'B', layoutValues: { columns: '2fr' } },
      ],
      default: 'a',
    })
    const c = ctx()
    expect(resolveBoundValues(s, 'banana', c)).toEqual({ columns: '1fr' })
    expect(warned(c)[0]).toContain('unknown stored value "banana"')
  })

  it('does not warn for an absent (undefined/null) value', () => {
    const s = setting({ options: [{ value: 'a', label: 'A', layoutValues: { columns: '1fr' } }] })
    const c = ctx()
    expect(resolveBoundValues(s, undefined, c)).toEqual({ columns: '1fr' })
    expect(resolveBoundValues(s, null, ctx())).toEqual({ columns: '1fr' })
    expect(warned(c)).toHaveLength(0)
  })

  it('treats a non-string stored value as unknown and falls back silently', () => {
    const s = setting({ options: [{ value: 'a', label: 'A', layoutValues: { columns: '1fr' } }] })
    expect(resolveBoundValues(s, 7, ctx())).toEqual({ columns: '1fr' })
  })

  it('reads a toggle from layoutValue / layoutValueOff', () => {
    const on = setting({ type: 'toggle', default: false, layoutValue: { columns: 'repeat(2, 1fr)' }, layoutValueOff: { columns: '1fr' } } as never)
    expect(resolveBoundValues(on, true, ctx())).toEqual({ columns: 'repeat(2, 1fr)' })
    expect(resolveBoundValues(on, false, ctx())).toEqual({ columns: '1fr' })
    expect(resolveBoundValues(on, 'yes', ctx())).toEqual({ columns: '1fr' }) // non-bool → default false
    const defaultOn = setting({ type: 'toggle', default: true, layoutValue: { columns: '2fr' } } as never)
    expect(resolveBoundValues(defaultOn, undefined, ctx())).toEqual({ columns: '2fr' })
    expect(resolveBoundValues(defaultOn, false, ctx())).toBeNull()
  })

  it('returns null when the toggle has no value for its state', () => {
    const s = setting({ type: 'toggle', default: false } as never)
    expect(resolveBoundValues(s, false, ctx())).toBeNull()
  })
})

describe('alternate-by-index resolver', () => {
  function resolverSetting() {
    return setting({
      id: 'shellSide', default: 'right',
      layoutBind: [{ target: 'placeItems' }],
      options: [
        { value: 'right', label: 'Right', layoutResolver: 'alternate-by-index', layoutValues: { placeItems: 'start' } },
        { value: 'left', label: 'Left', layoutResolver: 'alternate-by-index', layoutValues: { placeItems: 'end' } },
        { value: 'plain', label: 'No values' },
      ],
    })
  }

  it('picks the default option at index 0 and alternates over the layoutValues candidates', () => {
    const s = resolverSetting()
    expect(resolveBoundValues(s, 'right', ctx({ sectionIndex: 0 }))).toEqual({ placeItems: 'start' })
    expect(resolveBoundValues(s, 'right', ctx({ sectionIndex: 1 }))).toEqual({ placeItems: 'end' })
    expect(resolveBoundValues(s, 'right', ctx({ sectionIndex: 2 }))).toEqual({ placeItems: 'start' })
  })

  it('handles negative and non-finite indices as 0', () => {
    expect(resolveBoundValues(resolverSetting(), 'right', ctx({ sectionIndex: -3 }))).toEqual({ placeItems: 'end' })
    expect(resolveBoundValues(resolverSetting(), 'right', ctx({ sectionIndex: Number.NaN }))).toEqual({ placeItems: 'start' })
  })

  it('warns when no option carries layoutValues', () => {
    const s = setting({
      layoutBind: [{ target: 'placeItems' }],
      options: [{ value: 'a', label: 'A', layoutResolver: 'alternate-by-index' }],
    }) as unknown as SchemaSetting
    const c = ctx()
    expect(resolveBoundValues(s, 'a', c)).toBeNull()
    expect(warned(c)[0]).toContain('no option carrying layoutValues')
  })

  it('resolves only among options that carry layoutValues, null when none of the winners do', () => {
    const s = setting({
      layoutBind: [{ target: 'placeItems' }],
      options: [
        { value: 'a', label: 'A', layoutResolver: 'alternate-by-index' },
        { value: 'b', label: 'B', layoutResolver: 'alternate-by-index', layoutValues: { placeItems: 'end' } },
      ],
      default: 'a',
    }) as unknown as SchemaSetting
    // Candidates are only the layoutValues-carrying options, so 'a' never wins.
    expect(resolveBoundValues(s, 'a', ctx({ sectionIndex: 0 }))).toEqual({ placeItems: 'end' })
    expect(resolveBoundValues(s, 'a', ctx({ sectionIndex: 5 }))).toEqual({ placeItems: 'end' })
  })
})

describe('settingApplies', () => {
  it('passes with no guard', () => {
    expect(settingApplies(setting(), {})).toBe(true)
  })

  it('evaluates the legacy conditional shape', () => {
    const s = setting({ conditional: { field: 'mode', value: 'grid' } } as never)
    expect(settingApplies(s, { mode: 'grid' })).toBe(true)
    expect(settingApplies(s, { mode: 'masonry' })).toBe(false)
  })

  it('evaluates showIf maps: equality, one-of arrays and boolean truthiness', () => {
    const eq = setting({ showIf: { mode: 'grid' } } as never)
    const oneOf = setting({ showIf: { mode: ['grid', 'masonry'] } } as never)
    const truthy = setting({ showIf: { fancy: true } } as never)
    expect(settingApplies(eq, { mode: 'grid' })).toBe(true)
    expect(settingApplies(eq, { mode: 'x' })).toBe(false)
    expect(settingApplies(oneOf, { mode: 'masonry' })).toBe(true)
    expect(settingApplies(oneOf, { mode: 'stack' })).toBe(false)
    expect(settingApplies(truthy, { fancy: true })).toBe(true)
    expect(settingApplies(truthy, { fancy: false })).toBe(false)
    expect(settingApplies(truthy, {})).toBe(false)
  })

  it('requires both guard shapes to pass', () => {
    const s = setting({
      conditional: { field: 'a', value: 'x' },
      showIf: { b: ['y', 'z'] },
    } as never)
    expect(settingApplies(s, { a: 'x', b: 'y' })).toBe(true)
    expect(settingApplies(s, { a: 'x', b: 'no' })).toBe(false)
    expect(settingApplies(s, { a: 'no', b: 'y' })).toBe(false)
  })
})

describe('applyLayoutBindings — guards and config keys', () => {
  function guardSetting(): SchemaSetting {
    return setting({
      id: 'cols', default: 'a', showIf: { mode: 'grid' },
      layoutBind: [{ target: 'columns', tier: 'full' }],
      options: [
        { value: 'a', label: 'A', layoutValues: { columns: 'repeat(3, 1fr)' } },
        { value: 'b', label: 'B', layoutValues: { columns: 'repeat(4, 1fr)' } },
      ],
    }) as unknown as SchemaSetting
  }

  // The guard values are the section's own declared settings, so `mode` must be
  // a declared setting for the guard to see it.
  function modeSetting(): SchemaSetting {
    return setting({ id: 'mode', default: 'stack' })
  }

  it('skips a setting whose guard fails, so a sharing setting cannot be overwritten', () => {
    const d = applyLayoutBindings(draft(), [modeSetting(), guardSetting()], { cols: 'b', mode: 'masonry' }, ctx())
    expect(d.columns.full).toBe('2fr 3fr')
  })

  it('applies a setting whose guard passes', () => {
    const d = applyLayoutBindings(draft(), [modeSetting(), guardSetting()], { cols: 'b', mode: 'grid' }, ctx())
    expect(d.columns.full).toBe('repeat(4, 1fr)')
  })

  it('uses the declared default when layoutConfig omits the setting', () => {
    const d = applyLayoutBindings(draft(), [modeSetting(), guardSetting()], { mode: 'grid' }, ctx())
    expect(d.columns.full).toBe('repeat(3, 1fr)')
  })

  it('ignores layoutConfig keys no setting declares', () => {
    const c = ctx()
    applyLayoutBindings(draft(), [modeSetting(), guardSetting()], { ghost: 'x', cols: 'b', mode: 'grid' }, c)
    expect(warned(c)).toHaveLength(0)
  })

  it('skips a binding whose target is missing from the resolved values', () => {
    const s = setting({
      layoutBind: [{ target: 'columns', tier: 'full' }, { target: 'minHeight' }],
      options: [{ value: 'a', label: 'A', layoutValues: { minHeight: '20vh' } }],
    }) as unknown as SchemaSetting
    const d = applyLayoutBindings(draft(), [s], { s1: 'a' }, ctx())
    expect(d.minHeight).toBe('20vh')
  })
})

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe('parsePresetTarget / applyPreset / presetById', () => {
  it('rejects tier suffixes on non-tier-mapped fields and malformed shapes', () => {
    expect(parsePresetTarget('minHeight.full')).toBeNull()
    expect(parsePresetTarget('columns..')).toBeNull()
    expect(parsePresetTarget('zone.only.two.parts')).toBeNull()
    expect(parsePresetTarget('zone.x.invented')).toBeNull()
  })

  it('rebuilds zone/slot/flowOption targets and rejects a plain unknown grid key', () => {
    expect(parsePresetTarget('zone.body.gap')).toEqual({ target: 'zone.body.gap' })
    expect(parsePresetTarget('slot.media.hiddenIn')).toEqual({ target: 'slot.media.hiddenIn' })
    expect(parsePresetTarget('slot.media.flowOptions.columns')).toEqual({ target: 'slot.media.flowOptions.columns' })
    expect(parsePresetTarget('nope')).toBeNull()
  })

  it('drops an unparseable value with a warn and applies the rest', () => {
    const c = ctx()
    const d = applyPreset(draft(), { id: 'p', label: 'P', values: { 'not-a-target': 'x', 'gap.row': 'lg' } }, c)
    expect(warned(c)[0]).toContain('unparseable target')
    expect(d.gap.row).toBe('lg')
  })

  it('presetById finds a declared preset and returns null otherwise', () => {
    const schema = { presets: [{ id: 'spread', label: 'S', values: {} }] }
    expect(presetById(schema, 'spread')?.id).toBe('spread')
    expect(presetById(schema, 'other')).toBeNull()
    expect(presetById(schema, undefined)).toBeNull()
    expect(presetById(schema, '')).toBeNull()
    expect(presetById(schema, 42)).toBeNull()
    expect(presetById({ presets: undefined }, 'x')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Geometry resolution
// ---------------------------------------------------------------------------

describe('gap helpers', () => {
  it('gapToken names the theme CSS var and gapRem mirrors the scss map', () => {
    expect(gapToken('md')).toBe('var(--section-gap-md)')
    expect(gapRem('none')).toBe(0)
    expect(gapRem('sm')).toBe(0.5)
    expect(gapRem('md')).toBe(1.5)
    expect(gapRem('lg')).toBe(3)
    expect(gapRem('xl')).toBe(4.8)
  })
})

describe('effectiveColumns', () => {
  it('caps at 2 when stacked and passes through otherwise', () => {
    expect(effectiveColumns(4, 'stack')).toBe(2)
    expect(effectiveColumns(1, 'stack')).toBe(1)
    expect(effectiveColumns(4, 'flow')).toBe(4)
  })
})

describe('isStripLargeItem', () => {
  it('honours first, alternating and every-third patterns', () => {
    expect(Array.from({ length: 6 }, (_u, i) => isStripLargeItem(i, 'first'))).toEqual([true, false, false, false, false, false])
    expect(Array.from({ length: 4 }, (_u, i) => isStripLargeItem(i, 'alternating'))).toEqual([true, false, true, false])
    expect(Array.from({ length: 7 }, (_u, i) => isStripLargeItem(i, 'every-third'))).toEqual([true, false, false, true, false, false, true])
  })
})

describe('carouselItemsPerPage', () => {
  it('reads the raw viewport, with the tablet middle step', () => {
    expect(carouselItemsPerPage(4, BREAKPOINTS.sm)).toBe(1)
    expect(carouselItemsPerPage(4, BREAKPOINTS.sm - 1)).toBe(1)
    expect(carouselItemsPerPage(4, BREAKPOINTS.lg)).toBe(2)
    expect(carouselItemsPerPage(4, BREAKPOINTS.lg + 1)).toBe(4)
    expect(carouselItemsPerPage(8, 1440)).toBe(4)
    expect(carouselItemsPerPage(0, 1440)).toBe(3)
  })
})

describe('carouselInterval', () => {
  it('narrows and clamps to 3–10s', () => {
    expect(carouselInterval(6.5, 5)).toBe(6500)
    expect(carouselInterval(1, 5)).toBe(3000)
    expect(carouselInterval(99, 5)).toBe(10000)
    expect(carouselInterval('fast', 7)).toBe(7000)
    expect(carouselInterval(0, 7)).toBe(5000)
  })
})

describe('resolveFlowOptions', () => {
  it('resolves stack with a spacing-tier gap', () => {
    expect(resolveFlowOptions('stack', { gap: 'lg' })).toEqual({ gap: 'lg' })
    expect(resolveFlowOptions('stack', { gap: 'nope' })).toEqual({ gap: 'md' })
  })

  it('narrows layered options with fallbacks', () => {
    expect(resolveFlowOptions('layered', { gap: 'sm' })).toEqual({
      gap: 'sm', height: 'ratio-16x9', collapse: 'stack', designWidth: 1440,
    })
    expect(resolveFlowOptions('layered', {
      gap: 'sm', height: 'viewport', collapse: 'scale', designWidth: '720', columns: 9,
    })).toEqual({ gap: 'sm', height: 'viewport', collapse: 'scale', designWidth: 720 })
    expect(resolveFlowOptions('layered', { gap: 'sm', height: 'content-min' }).height).toBe('content-min')
    expect(resolveFlowOptions('layered', { height: 'nonsense' }).height).toBe('ratio-16x9')
    expect(resolveFlowOptions('layered', { collapse: 'nonsense' }).collapse).toBe('stack')
    expect(resolveFlowOptions('layered', { designWidth: 0 }).designWidth).toBe(1440)
    expect(resolveFlowOptions('layered', { designWidth: -3 }).designWidth).toBe(1440)
    expect(resolveFlowOptions('layered', { designWidth: 'wide' }).designWidth).toBe(1440)
  })

  it('narrows columnar and strip options', () => {
    expect(resolveFlowOptions('grid', {})).toEqual({ gap: 'md', columns: 3 })
    expect(resolveFlowOptions('masonry', { columns: '5' })).toEqual({ gap: 'md', columns: 5 })
    expect(resolveFlowOptions('grid', { columns: 0 })).toEqual({ gap: 'md', columns: 1 })
    expect(resolveFlowOptions('grid', { columns: 2.7 })).toEqual({ gap: 'md', columns: 2 })
    expect(resolveFlowOptions('strip', { columns: 4, pattern: 'alternating' })).toEqual({
      gap: 'md', columns: 4, pattern: 'alternating',
    })
    expect(resolveFlowOptions('strip', { pattern: 'bogus' }).pattern).toBe('every-third')
  })

  it('narrows carousel options', () => {
    expect(resolveFlowOptions('carousel', { columns: 2, autoplay: true, showDots: false, interval: 8 })).toEqual({
      gap: 'md', columns: 2, autoplay: true, interval: 8, showDots: false, showArrows: true,
    })
    expect(resolveFlowOptions('carousel', {})).toEqual({
      gap: 'md', columns: 3, autoplay: false, interval: 5, showDots: true, showArrows: true,
    })
  })
})

// ---------------------------------------------------------------------------
// resolveSectionLayout + style objects
// ---------------------------------------------------------------------------

function resolvedOf(overrides: Partial<SectionLayoutDefinition> = {}, tier: string | null = 'full') {
  return resolveSectionLayout(draft(baseLayout(overrides)), tier)
}

describe('resolveSectionLayout', () => {
  it('resolves grid geometry with tier tracks and named areas', () => {
    const r = resolvedOf()
    expect(r.tier).toBe('full')
    expect(r.collapse).toBe('flow')
    expect(r.gridTemplateAreas).toBe('"media text"')
    expect(r.gridTemplateColumns).toBe('2fr 3fr')
    expect(r.gridTemplateRows).toBe('auto')
    expect(r.rowGap).toBe('var(--section-gap-md)')
    expect(r.columnGap).toBe('var(--section-gap-md)')
    expect(r.placeItems).toBe('start stretch')
    expect(r.minHeight).toBeNull()
    expect(sectionRootStyle(r)).toEqual({
      display: 'grid',
      gridTemplateColumns: '2fr 3fr',
      gridTemplateRows: 'auto',
      rowGap: 'var(--section-gap-md)',
      columnGap: 'var(--section-gap-md)',
      placeItems: 'start stretch',
      gridTemplateAreas: '"media text"',
    })
  })

  it('uses fallbacks for a tier that declares no tracks or areas, and emits no area style', () => {
    const r = resolvedOf({ areas: {}, columns: {}, rows: {} }, 'full')
    expect(r.gridTemplateAreas).toBeNull()
    expect(r.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(r.gridTemplateRows).toBe('auto')
    expect('gridTemplateAreas' in sectionRootStyle(r)).toBe(false)
  })

  it('degrades a null tier to a single implicit column with stack collapse', () => {
    const r = resolvedOf({ areas: {} }, null)
    expect(r.collapse).toBe('stack')
    expect(r.tier).toBe('')
    expect(r.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(r.gridTemplateRows).toBe('auto')
  })

  it('stacks at the floor tier', () => {
    expect(resolvedOf({}, 'stack').collapse).toBe('stack')
  })

  it('emits minHeight when the draft declares one', () => {
    const d = draft()
    d.minHeight = '40vh'
    const r = resolveSectionLayout(d, 'full')
    expect(sectionRootStyle(r).minHeight).toBe('40vh')
  })

  it('renders zones with named areas or auto placement, and hides by tier', () => {
    const r = resolvedOf({
      zones: {
        hero: { flow: 'stack', gap: 'md', hiddenIn: ['stack'], sticky: { top: '1rem', tiers: ['full'] }, zIndex: 3, offset: { x: '1px', y: '2px' }, placeSelf: 'center stretch' },
        quiet: { flow: 'stack', gap: 'md', hiddenIn: [] },
      },
    }, 'full')
    expect(r.zones.hero).toEqual({
      gridArea: 'hero', placeSelf: 'start stretch', position: 'sticky',
      top: 'calc(var(--header-height, 0px) + 1rem)', transform: 'translate(1px, 2px)', zIndex: 3, rendered: true,
    })
    expect(r.zones.quiet!.position).toBe('static')
    expect(r.zones.quiet!.top).toBeNull()
    expect(gridItemStyle(r.zones.hero!)).toEqual({
      gridArea: 'hero', placeSelf: 'start stretch', position: 'sticky',
      top: 'calc(var(--header-height, 0px) + 1rem)', transform: 'translate(1px, 2px)', zIndex: '3',
    })
  })

  it('hides a zone at a hidden tier and forces start align on sticky items only when sticky is active', () => {
    const r = resolvedOf({
      zones: { hero: { flow: 'stack', gap: 'md', hiddenIn: ['full'], placeSelf: 'stretch end' } },
    }, 'full')
    expect(r.zones.hero!.rendered).toBe(false)
    const notSticky = resolvedOf({
      zones: { hero: { flow: 'stack', gap: 'md', placeSelf: 'stretch end', sticky: { top: '1rem', tiers: ['stack'] } } },
    }, 'full')
    expect(notSticky.zones.hero!.position).toBe('static')
    expect(notSticky.zones.hero!.placeSelf).toBe('stretch end')
  })

  it('renders slots, wiring zone-rendered state and line placement', () => {
    const layout = baseLayout({
      areas: { full: ['canvas body'], stack: ['canvas', 'body'] },
      zones: { canvas: { flow: 'stack', gap: 'md' } },
      slots: [
        { role: 'canvas', zone: null, place: { column: '1 / -1', row: '1 / span 2' }, flow: 'layered', flowOptions: { height: 'viewport', collapse: 'scale' }, hiddenIn: [] },
        { role: 'body', zone: 'canvas', flow: 'stack', flowOptions: {}, hiddenIn: ['stack'] },
      ],
    })
    const r = resolveSectionLayout(draft(layout), 'full')
    expect(r.slots[0]!.rendered).toBe(true)
    expect(r.slots[0]!.item!.gridArea).toBe('1 / 1 / span 2 / -1')
    expect(r.slots[0]!.flowOptions).toEqual({ gap: 'md', height: 'viewport', collapse: 'scale', designWidth: 1440 })
    expect(r.slots[1]!.rendered).toBe(true)

    const stackTier = resolveSectionLayout(draft(layout), 'stack')
    expect(stackTier.slots[1]!.rendered).toBe(false)
  })

  it('hides a slot whose zone is hidden', () => {
    const layout = baseLayout({
      zones: { canvas: { flow: 'stack', gap: 'md', hiddenIn: ['full'] } },
      slots: [{ role: 'body', zone: 'canvas', flow: 'stack', flowOptions: {}, hiddenIn: [] }],
    })
    expect(resolveSectionLayout(draft(layout), 'full').slots[0]!.rendered).toBe(false)
    const unknownZone = baseLayout({
      slots: [{ role: 'body', zone: 'ghost-zone', flow: 'stack', flowOptions: {}, hiddenIn: [] }],
    })
    expect(resolveSectionLayout(draft(unknownZone), 'full').slots[0]!.rendered).toBe(false)
  })

  it('keeps an unzoned slot rendered and builds gridArea from single-line placements', () => {
    const layout = baseLayout({
      slots: [
        { role: 'body', zone: null, place: { column: 'span 2', row: 'auto' }, flow: 'stack', flowOptions: {}, hiddenIn: [] },
      ],
    })
    const r = resolveSectionLayout(draft(layout), 'full')
    expect(r.slots[0]!.rendered).toBe(true)
    expect(r.slots[0]!.item!.gridArea).toBe('auto / span 2 / auto / auto')
  })

  it('gives a zone-less tier auto placement and still resolves', () => {
    const layout = baseLayout({
      areas: { stack: [] },
      zones: { hero: { flow: 'stack', gap: 'md' } },
    })
    const r = resolveSectionLayout(draft(layout), 'stack')
    expect(r.zones.hero!.gridArea).toBe('auto')
    expect(r.gridTemplateAreas).toBeNull()
  })
})

describe('gridItemStyle', () => {
  it('omits null fields', () => {
    expect(gridItemStyle({
      gridArea: 'auto', placeSelf: 'start stretch', position: 'static',
      top: null, transform: null, zIndex: null, rendered: true,
    })).toEqual({ gridArea: 'auto', placeSelf: 'start stretch', position: 'static' })
    expect(gridItemStyle({
      gridArea: 'a', placeSelf: 'p', position: 'static',
      top: '1px', transform: 'translate(1px, 2px)', zIndex: 4, rendered: true,
    })).toEqual({
      gridArea: 'a', placeSelf: 'p', position: 'static', top: '1px',
      transform: 'translate(1px, 2px)',
      zIndex: '4',
    })
  })
})

// ---------------------------------------------------------------------------
// Flow styles
// ---------------------------------------------------------------------------

describe('slotFlowStyle', () => {
  it('stacks as a column flex with the gap token', () => {
    expect(slotFlowStyle('stack', resolveFlowOptions('stack', { gap: 'lg' }), 'flow')).toEqual({
      display: 'flex', flexDirection: 'column', gap: 'var(--section-gap-lg)',
    })
  })

  it('grids and strips a track list capped by collapse', () => {
    expect(slotFlowStyle('grid', resolveFlowOptions('grid', { columns: 4 }), 'flow').gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))')
    expect(slotFlowStyle('grid', resolveFlowOptions('grid', { columns: 4 }), 'stack').gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    expect(slotFlowStyle('strip', resolveFlowOptions('strip', { columns: 3 }), 'flow')).toEqual({
      display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--section-gap-md)',
    })
  })

  it('masonry uses multi-column with per-item margins, no row gap', () => {
    expect(slotFlowStyle('masonry', resolveFlowOptions('masonry', { columns: 3 }), 'flow')).toEqual({
      display: 'block', columnCount: '3', columnGap: 'var(--section-gap-md)',
    })
  })

  it('carousel root is a gap-less vertical stack', () => {
    expect(slotFlowStyle('carousel', resolveFlowOptions('carousel', {}), 'flow')).toEqual({
      display: 'flex', flexDirection: 'column',
    })
  })

  it('layered box when not stacking at floor, else degrades to a column', () => {
    const scale = resolveFlowOptions('layered', { gap: 'sm', collapse: 'scale', height: 'ratio-16x9' })
    const box = slotFlowStyle('layered', scale, 'stack')
    expect(box).toEqual({ display: 'block', position: 'relative', isolation: 'isolate', overflow: 'hidden', aspectRatio: '16 / 9' })
    const stack = resolveFlowOptions('layered', { gap: 'sm', collapse: 'stack', height: 'ratio-16x9' })
    expect(slotFlowStyle('layered', stack, 'stack')).toEqual({
      display: 'flex', flexDirection: 'column', gap: 'var(--section-gap-sm)',
    })
    expect(slotFlowStyle('layered', stack, 'flow')).toEqual({
      display: 'block', position: 'relative', isolation: 'isolate', overflow: 'hidden', aspectRatio: '16 / 9',
    })
  })
})

describe('stacksAtFloor', () => {
  it('is true only for the stack fallback at the floor tier', () => {
    expect(stacksAtFloor({ gap: 'md', collapse: 'stack', height: 'ratio-16x9', designWidth: 1440 }, 'stack')).toBe(true)
    expect(stacksAtFloor({ gap: 'md', collapse: 'stack', height: 'ratio-16x9', designWidth: 1440 }, 'flow')).toBe(false)
    expect(stacksAtFloor({ gap: 'md', collapse: 'scale', height: 'ratio-16x9', designWidth: 1440 }, 'stack')).toBe(false)
  })
})

describe('isLayeredOptions', () => {
  it('narrows the resolved bag', () => {
    expect(isLayeredOptions(resolveFlowOptions('layered', {}))).toBe(true)
    expect(isLayeredOptions(resolveFlowOptions('grid', { columns: 2 }))).toBe(false)
  })
})

describe('layeredHeightStyle', () => {
  it('maps every declared height', () => {
    expect(layeredHeightStyle('ratio-16x9')).toEqual({ aspectRatio: '16 / 9' })
    expect(layeredHeightStyle('ratio-4x3')).toEqual({ aspectRatio: '4 / 3' })
    expect(layeredHeightStyle('viewport')).toEqual({ minHeight: '100svh' })
    expect(layeredHeightStyle('content-min')).toEqual({ minHeight: 'var(--layered-content-min-height, 24rem)' })
  })
})

describe('zoneFlowStyle', () => {
  it('degrades a hand-edited layered zone to a stack', () => {
    const layered = { flow: 'layered', gap: 'sm' } as never
    expect(zoneFlowStyle(layered, 'flow')).toEqual({
      display: 'flex', flexDirection: 'column', gap: 'var(--section-gap-sm)',
    })
  })

  it('renders a grid zone with its gap', () => {
    const grid = { flow: 'grid', gap: 'lg' } as never
    expect(zoneFlowStyle(grid, 'flow')).toEqual({
      display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--section-gap-lg)',
    })
  })
})

describe('declaredRoles', () => {
  it('lists the draft slot roles', () => {
    expect(declaredRoles(draft())).toEqual(['media', 'text'])
  })
})

describe('constants', () => {
  it('unroled bucket name', () => {
    expect(UNROLED_ROLE).toBe('_default')
  })
})