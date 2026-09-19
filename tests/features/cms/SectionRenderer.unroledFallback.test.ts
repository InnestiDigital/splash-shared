/**
 * @vitest-environment happy-dom
 *
 * What happens to a block the section layout declares no slot for.
 *
 * A section-type change can leave a block with no role the new type knows
 * (`changeSectionType` clears the incompatible role, and `buildBlocksByRole`
 * drops anything the type does not declare into `_default`). The renderer used
 * to replace those blocks with a red diagnostic box, which read to the operator
 * as "my block disappeared". It renders them instead, appended after the
 * layout, and warns on the console for whoever is debugging the layout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent } from 'vue'

vi.stubGlobal('computed', computed)

vi.mock('#imports', () => ({ useRuntimeConfig: () => ({ public: {} }) }))

const v2Schemas: Record<string, unknown> = {}
vi.mock('~/shared/features/cms/sectionSchemas', () => ({
  getSectionTypeSchema: () => null,
  getSectionTypeSchemaV2: (_theme: string, type: string) => v2Schemas[type],
}))

vi.mock('~/shared/composables/useSectionReveal', () => ({ useSectionReveal: () => {} }))

import SectionRenderer from '~/shared/features/cms/SectionRenderer.vue'

const Marker = defineComponent({
  name: 'Marker',
  props: { label: { type: String, default: '' } },
  template: '<p class="marker">{{ label }}</p>',
})

/** A layout with one named slot and NO `_default` outlet. */
function layoutWithout_default(type: string) {
  return {
    type,
    layoutSlots: [{ role: 'section-heading', required: false, multiple: false }],
    settings: [],
    layout: {
      engine: 'grid',
      tiers: [{ id: 'stack', minWidth: null }],
      columns: { stack: 'minmax(0, 1fr)' },
      rows: { stack: 'auto' },
      gap: { row: 'md', column: 'md' },
      slots: [{
        role: 'section-heading',
        place: { column: '1 / -1', row: '1 / -1' },
        flow: 'stack',
        flowOptions: { gap: 'md' },
      }],
    },
  }
}

function makeSection(sectionType: string) {
  return {
    id: 'sec-1',
    name: 'Apertura',
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

function unroled(id: string, label: string) {
  return { block: { id, type: 'hero-block', placement: null }, component: Marker, props: { label } }
}

function render(sectionType: string, blocksByRole: Record<string, unknown[]>) {
  return mount(SectionRenderer, {
    props: { section: makeSection(sectionType), blocksByRole, themeName: 'acme' },
  })
}

let warn: ReturnType<typeof vi.spyOn>

/**
 * Only this component's warnings. Vue itself warns during these mounts (the
 * layout stubs are deliberately minimal), and asserting on a raw call count
 * would make the test fail for reasons that have nothing to do with the
 * fallback.
 */
function rendererWarnings(): string[] {
  return warn.mock.calls
    .map(call => String(call[0]))
    .filter(message => message.startsWith('[SectionRenderer]'))
}

beforeEach(() => {
  for (const key of Object.keys(v2Schemas)) delete v2Schemas[key]
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('SectionRenderer fallback for blocks with no layout role', () => {
  it('renders the block instead of dropping it', () => {
    v2Schemas['collage-canvas'] = layoutWithout_default('collage-canvas')

    const wrapper = render('collage-canvas', {
      'section-heading': [],
      _default: [unroled('b1', 'orphan copy')],
    })

    expect(wrapper.find('[data-unroled-fallback]').exists()).toBe(true)
    expect(wrapper.findAll('.marker')).toHaveLength(1)
    expect(wrapper.text()).toContain('orphan copy')
  })

  it('renders every orphan, in order', () => {
    v2Schemas['collage-canvas'] = layoutWithout_default('collage-canvas')

    const wrapper = render('collage-canvas', {
      _default: [unroled('b1', 'first'), unroled('b2', 'second')],
    })

    expect(wrapper.findAll('.marker').map(node => node.text())).toEqual(['first', 'second'])
  })

  it('still warns on the console so the drift is debuggable', () => {
    v2Schemas['collage-canvas'] = layoutWithout_default('collage-canvas')

    render('collage-canvas', { _default: [unroled('b1', 'orphan copy')] })

    expect(rendererWarnings()).toHaveLength(1)
    expect(rendererWarnings()[0]).toMatch(/Apertura.*collage-canvas.*fallback/s)
  })

  it('does NOT build a fallback when the layout declares a _default slot', () => {
    const schema = layoutWithout_default('magazine-spread') as any
    schema.layout.slots.push({
      role: '_default',
      place: { column: '1 / -1', row: '1 / -1' },
      flow: 'stack',
      flowOptions: { gap: 'md' },
    })
    v2Schemas['magazine-spread'] = schema

    const wrapper = render('magazine-spread', { _default: [unroled('b1', 'placed copy')] })

    expect(wrapper.find('[data-unroled-fallback]').exists()).toBe(false)
    expect(rendererWarnings()).toHaveLength(0)
    // The engine's own `_default` slot renders it — nothing is lost either way.
    expect(wrapper.text()).toContain('placed copy')
  })

  it('builds no fallback when there are no orphans', () => {
    v2Schemas['collage-canvas'] = layoutWithout_default('collage-canvas')

    const wrapper = render('collage-canvas', { _default: [] })

    expect(wrapper.find('[data-unroled-fallback]').exists()).toBe(false)
    expect(rendererWarnings()).toHaveLength(0)
  })

  it('matches the section container width so the stack lines up with the layout', () => {
    v2Schemas['collage-canvas'] = layoutWithout_default('collage-canvas')

    const fallback = render('collage-canvas', { _default: [unroled('b1', 'orphan copy')] })
      .find('[data-unroled-fallback]')

    expect(fallback.classes()).toContain('section-renderer__container')
    expect(fallback.classes()).toContain('section-renderer__container--measure')
  })
})
