/**
 * @vitest-environment happy-dom
 *
 * Which layout path a section takes, after L3.
 *
 * The engine is the DEFAULT: a section type shipping a `.v2.json` with a
 * `layout` block renders through `SchemaSectionLayout` with no flag set. The
 * flag inverted — `NUXT_PUBLIC_LAYOUT_ENGINE_DISABLED` (public runtime config
 * `layoutEngineDisabled`) is an emergency kill switch that forces every section
 * back onto its hand-written component. A type with neither a v2 schema nor a
 * built-in component still fails loud.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

vi.stubGlobal('computed', computed)

const runtimeConfig = { public: {} as Record<string, unknown> }
vi.mock('#imports', () => ({ useRuntimeConfig: () => runtimeConfig }))

const v2Schemas: Record<string, unknown> = {}
vi.mock('~/shared/features/cms/sectionSchemas', () => ({
  getSectionTypeSchema: () => null,
  getSectionTypeSchemaV2: (_theme: string, type: string) => v2Schemas[type],
}))

vi.mock('~/shared/composables/useSectionReveal', () => ({ useSectionReveal: () => {} }))

import SectionRenderer from '~/shared/features/cms/SectionRenderer.vue'

/** Minimal but valid: one tier, one column, one `_default` slot. */
const SPREAD_V2 = {
  type: 'magazine-spread',
  layoutSlots: [],
  settings: [],
  layout: {
    engine: 'grid',
    tiers: [{ id: 'stack', minWidth: null }],
    columns: { stack: 'minmax(0, 1fr)' },
    rows: { stack: 'auto' },
    gap: { row: 'md', column: 'md' },
    slots: [{ role: '_default', place: { column: '1 / -1', row: '1 / -1' }, flow: 'stack', flowOptions: { gap: 'md' } }],
  },
}

function makeSection(sectionType: string) {
  return {
    id: 'sec-1',
    name: 'Test',
    anchor: null,
    isHidden: false,
    colorScheme: 'light',
    sectionRole: null,
    sectionType,
    containerMode: 'measure',
    position: 0,
    sectionSpaceY: 'md',
    containerInsetX: 'md',
    revealPreset: null,
    revealOverrides: null,
    defaultBlockEntrance: null,
    layoutConfig: null,
  }
}

function render(sectionType: string) {
  return mount(SectionRenderer, {
    props: { section: makeSection(sectionType), blocksByRole: {}, themeName: 'acme' },
  })
}

beforeEach(() => {
  runtimeConfig.public = {}
  for (const key of Object.keys(v2Schemas)) delete v2Schemas[key]
})

describe('SectionRenderer layout path selection', () => {
  it('renders a theme-defined type through the engine with NO flag set', () => {
    v2Schemas['magazine-spread'] = SPREAD_V2

    expect(render('magazine-spread').find('.schema-layout').exists()).toBe(true)
  })

  it('renders a builtin type through the engine too, once it ships a v2 schema', () => {
    v2Schemas.stacked = { ...SPREAD_V2, type: 'stacked' }

    expect(render('stacked').find('.schema-layout').exists()).toBe(true)
  })

  it('falls back to the hand-written component for a type with no v2 schema', () => {
    const wrapper = render('stacked')

    expect(wrapper.find('.schema-layout').exists()).toBe(false)
    expect(wrapper.find('.section-renderer').exists()).toBe(true)
  })

  it('kill switch forces a v2-carrying builtin type back onto its legacy component', () => {
    v2Schemas.stacked = { ...SPREAD_V2, type: 'stacked' }
    runtimeConfig.public.layoutEngineDisabled = true

    expect(render('stacked').find('.schema-layout').exists()).toBe(false)
  })

  it('a v2 schema WITHOUT a layout block does not reach the engine', () => {
    v2Schemas.stacked = { type: 'stacked', layoutSlots: [] }

    expect(render('stacked').find('.schema-layout').exists()).toBe(false)
  })

  it('fails loud for a type with neither a v2 schema nor a legacy component', () => {
    expect(() => render('magazine-spread')).toThrow(/Unknown sectionType "magazine-spread"/)
  })

  it('the kill switch turns a theme-defined type into that same loud failure', () => {
    v2Schemas['magazine-spread'] = SPREAD_V2
    runtimeConfig.public.layoutEngineDisabled = true

    expect(() => render('magazine-spread')).toThrow(/Unknown sectionType/)
  })
})
