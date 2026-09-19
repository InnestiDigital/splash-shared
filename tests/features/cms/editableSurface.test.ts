import { describe, it, expect } from 'vitest'
import type {
  EditableSurfaceEntry,
  EditableSurfaceRegistry,
} from '~/shared/features/cms/editableSurface/types'
import {
  buildEditableSurface,
  editableAddress,
  indexByAddress,
  scopeKey,
  EditableSurfaceError,
} from '~/shared/features/cms/editableSurface.mjs'

/**
 * Synthetic themes throughout. The real theme is covered by
 * `editableSurface.parity.test.ts`; here the input is hand-built so a single
 * derivation rule can be isolated — the standalone theme cannot produce a
 * seeded catalog, a layered slot and a `$fragmentOmit` on demand.
 */

const colorRoles = {
  id: 'color-roles',
  settings: [
    {
      id: 'background',
      type: 'select',
      default: 'section',
      options: [
        { value: 'section' }, { value: 'surface' }, { value: 'accent' },
        { value: 'inverse' }, { value: 'transparent' },
      ],
    },
    {
      id: 'textTone',
      type: 'select',
      default: 'section',
      options: [{ value: 'section' }, { value: 'muted' }],
    },
  ],
}

const mediaSide = {
  id: 'media-side',
  settings: [
    { id: 'mediaSide', type: 'select', default: 'left', options: [{ value: 'left' }, { value: 'right' }] },
    { id: 'gapMobile', type: 'select', default: 'md', options: [{ value: 'sm' }, { value: 'md' }] },
  ],
}

const fragments = { 'color-roles': colorRoles, 'media-side': mediaSide }

function input(overrides: Record<string, unknown> = {}) {
  return {
    theme: 'test-theme',
    fragments,
    blockSchemas: [],
    sectionTypeSchemas: [],
    sectionLayoutSchemas: [],
    ...overrides,
  }
}

function entryAt(registry: EditableSurfaceRegistry, address: string): EditableSurfaceEntry | undefined {
  return registry.entries.find(entry => entry.address === address)
}

describe('buildEditableSurface — inputs it refuses', () => {
  it('refuses input with no theme', () => {
    expect(() => buildEditableSurface({ theme: '' } as never)).toThrow(EditableSurfaceError)
  })

  it('refuses a block schema with no type', () => {
    expect(() => buildEditableSurface(input({
      blockSchemas: [{ source: 'a.settings.json', schema: { settings: [] } }],
    }))).toThrow(/has no "type"/)
  })

  it('refuses two block schemas that claim the same type', () => {
    expect(() => buildEditableSurface(input({
      blockSchemas: [
        { source: 'a.settings.json', schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] } },
        { source: 'b.settings.json', schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] } },
      ],
    }))).toThrow(/duplicate address/)
  })
})

describe('buildEditableSurface — block settings', () => {
  const registry = buildEditableSurface(input({
    blockSchemas: [{
      source: 'themes/test-theme/components/Hero.settings.json',
      schema: {
        type: 'hero',
        settings: [
          { id: 'title', type: 'text' },
          { id: 'columns', type: 'number' },
          { id: 'boxed', type: 'toggle' },
          { id: 'align', type: 'select', options: [{ value: 'left' }, { value: 'right' }] },
          { id: 'photo', type: 'image', options: { valueMode: 'id' } },
          { id: 'shots', type: 'image-gallery' },
          { id: 'rows', type: 'repeater', fields: [{ id: 'label', type: 'text' }] },
          { id: '_legacy', type: 'hidden', internal: true },
          { id: 'weird', type: 'not-a-real-type' },
        ],
      },
    }],
  }))

  it('makes a declared setting agent-writable and fail-open', () => {
    const entry = entryAt(registry, 'block:hero#title')
    expect(entry).toMatchObject({
      entity: 'block',
      path: 'title',
      capability: 'agent-writable',
      failDirection: 'fail-open',
      constraint: { kind: 'primitive', primitive: 'string' },
      owner: { level: 'schema', source: 'themes/test-theme/components/Hero.settings.json' },
      settingType: 'text',
    })
  })

  it('maps each schema field type to its constraint species', () => {
    expect(entryAt(registry, 'block:hero#columns')?.constraint).toEqual({ kind: 'primitive', primitive: 'number' })
    expect(entryAt(registry, 'block:hero#boxed')?.constraint).toEqual({ kind: 'primitive', primitive: 'boolean' })
    expect(entryAt(registry, 'block:hero#rows')?.constraint).toEqual({ kind: 'primitive', primitive: 'array' })
    expect(entryAt(registry, 'block:hero#align')?.constraint).toEqual({
      kind: 'schema-options', values: ['left', 'right'], source: 'schema options',
    })
  })

  it('reports an unmapped field type as opaque rather than guessing a shape', () => {
    expect(entryAt(registry, 'block:hero#weird')?.constraint).toEqual({
      kind: 'opaque', reason: 'unmapped field type "not-a-real-type"',
    })
  })

  it('fails CLOSED on media fields, matching attach_media', () => {
    expect(entryAt(registry, 'block:hero#photo')).toMatchObject({
      failDirection: 'fail-closed',
      constraint: { kind: 'media-ref', fieldType: 'image', valueMode: 'id', list: false },
    })
  })

  it('defaults a media field with no valueMode to url, as TImagePicker does', () => {
    expect(entryAt(registry, 'block:hero#shots')?.constraint).toEqual({
      kind: 'media-ref', fieldType: 'image-gallery', valueMode: 'url', list: true,
    })
  })

  it('flags an internal field migration-only, not agent-writable', () => {
    expect(entryAt(registry, 'block:hero#_legacy')?.capability).toBe('migration-only')
  })

  it('does not descend into repeater sub-fields', () => {
    // Only the first path segment is schema-checkable; nesting below a declared
    // id is field-shaped and no schema describes it.
    expect(entryAt(registry, 'block:hero#rows.label')).toBeUndefined()
  })
})

describe('buildEditableSurface — fragment layering', () => {
  const registry = buildEditableSurface(input({
    blockSchemas: [{
      source: 'themes/test-theme/components/Card.settings.json',
      schema: {
        type: 'card',
        $fragments: ['color-roles', 'media-side'],
        $fragmentOverrides: {
          background: { default: 'surface', showIf: { boxed: true } },
          mediaSide: { omitOptions: ['right'] },
        },
        $fragmentOmit: ['gapMobile'],
        settings: [{ id: 'title', type: 'text' }],
      },
    }],
  }))

  it('names the owning fragment instead of flattening it into the block', () => {
    expect(entryAt(registry, 'block:card#background')?.owner).toEqual({
      level: 'fragment',
      fragmentId: 'color-roles',
      patchedKeys: ['default', 'showIf'],
      omittedOptions: [],
    })
  })

  it('keeps block-owned settings at the schema level', () => {
    expect(entryAt(registry, 'block:card#title')?.owner).toMatchObject({ level: 'schema' })
  })

  it('records omitOptions as an adopter patch, and narrows the vocabulary', () => {
    const entry = entryAt(registry, 'block:card#mediaSide')
    expect(entry?.owner).toEqual({
      level: 'fragment', fragmentId: 'media-side', patchedKeys: [], omittedOptions: ['right'],
    })
    expect(entry?.constraint).toMatchObject({ kind: 'schema-options', values: ['left'] })
  })

  it('drops a fragment setting the adopter omitted entirely', () => {
    expect(entryAt(registry, 'block:card#gapMobile')).toBeUndefined()
  })

  it('mints a migration-only companion for each colour-role axis', () => {
    for (const axis of ['background', 'textTone']) {
      expect(entryAt(registry, `block:card#${axis}.custom`)).toMatchObject({
        capability: 'migration-only',
        failDirection: 'fail-closed',
        constraint: { kind: 'primitive', primitive: 'string' },
      })
    }
  })

  it('mints no custom companion for a non-colour fragment', () => {
    expect(entryAt(registry, 'block:card#mediaSide.custom')).toBeUndefined()
  })
})

describe('buildEditableSurface — layout entries', () => {
  const header = {
    source: 'themes/test-theme/components/Header.settings.json',
    schema: {
      type: 'header',
      isLayoutComponent: true,
      settings: [
        { id: 'logoPosition', type: 'select', options: [{ value: 'left' }, { value: 'center' }] },
        { id: 'sticky', type: 'checkbox' },
        { id: 'internalSlot', type: 'text', internal: true },
      ],
    },
  }
  const plainBlock = {
    source: 'themes/test-theme/components/Hero.settings.json',
    schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] },
  }

  it('mints one layoutType-scoped entry per declared setting', () => {
    const registry = buildEditableSurface(input({ blockSchemas: [header, plainBlock] }))
    expect(entryAt(registry, 'layout:header#logoPosition')).toMatchObject({
      entity: 'layout',
      scope: { layoutType: 'header' },
      path: 'logoPosition',
      capability: 'agent-writable',
      constraint: { kind: 'schema-options', values: ['left', 'center'] },
      // Site-global: one write repaints every page, and there is no
      // per-instance schema to fall back onto.
      failDirection: 'fail-closed',
      owner: { level: 'schema', source: header.source },
      settingType: 'select',
    })
    expect(entryAt(registry, 'layout:header#sticky')).toMatchObject({
      constraint: { kind: 'primitive', primitive: 'boolean' },
    })
  })

  it('reads `internal` on a layout setting, as block and theme entries do', () => {
    const registry = buildEditableSurface(input({ blockSchemas: [header] }))
    expect(entryAt(registry, 'layout:header#internalSlot')?.capability).toBe('migration-only')
  })

  it('mints layout entries ONLY for schemas flagged isLayoutComponent', () => {
    const registry = buildEditableSurface(input({ blockSchemas: [header, plainBlock] }))
    expect(entryAt(registry, 'layout:hero#title')).toBeUndefined()
    const layoutTypes = new Set(
      registry.entries.filter(entry => entry.entity === 'layout').map(entry => entry.scope.layoutType),
    )
    expect([...layoutTypes]).toEqual(['header'])
  })

  it('keeps the block-scoped twin, because the two address different storage', () => {
    // `layout:header#logoPosition` is the `navigation_layouts` row the
    // `update_layout_settings` op PUTs; `block:header#logoPosition` is a block
    // row carrying the same field. Same vocabulary, derived from one file by one
    // pair of functions, so the two cannot disagree about a legal value.
    const registry = buildEditableSurface(input({ blockSchemas: [header] }))
    const layout = entryAt(registry, 'layout:header#logoPosition')
    const block = entryAt(registry, 'block:header#logoPosition')
    expect(block).toBeDefined()
    expect(layout?.constraint).toEqual(block?.constraint)
    // …but the classes differ where it matters: a block field write we cannot
    // classify falls open, a site-global layout write does not.
    expect(block?.failDirection).toBe('fail-open')
    expect(layout?.failDirection).toBe('fail-closed')
  })
})

describe('buildEditableSurface — conditional capability', () => {
  const blockSchemas = [{
    source: 'themes/test-theme/components/Hero.settings.json',
    schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] },
  }]

  it('bases placement.canvas on never, so an unknown condition refuses', () => {
    const registry = buildEditableSurface(input({ blockSchemas }))
    expect(entryAt(registry, 'block:hero#placement.canvas')).toMatchObject({
      capability: 'never',
      conditional: {
        // BOTH routes `canvasPlacementAllowed` answers, as an any-of. Pinned as
        // an exact list: dropping either one is how the registry became
        // stricter than the API it describes.
        when: ['section-type-has-layered-slot', 'page-is-brand-canvas'],
        capability: 'agent-writable',
        otherwise: 'never',
      },
      constraint: { kind: 'geometry', geometry: 'canvas-block' },
      failDirection: 'fail-closed',
    })
  })

  it('names the layered section types in its guidance when the theme has one', () => {
    const registry = buildEditableSurface(input({
      blockSchemas,
      sectionTypeSchemas: [{ source: 's', schema: { type: 'collage', layoutSlots: [], settings: [] } }],
      sectionLayoutSchemas: [{
        source: 's2',
        schema: { type: 'collage', layout: { slots: [{ role: 'items', flow: 'layered' }] } },
      }],
    }))
    expect(entryAt(registry, 'block:hero#placement.canvas')?.guidance).toContain('collage')
  })

  it('sees a layered slot reachable only through a layoutBind option', () => {
    // The shared predicate's bound case: a type offering free placement as one
    // option of a layout setting. A local `.some(flow === layered)` would miss it.
    const registry = buildEditableSurface(input({
      blockSchemas,
      sectionTypeSchemas: [{ source: 's', schema: { type: 'flexible', layoutSlots: [], settings: [] } }],
      sectionLayoutSchemas: [{
        source: 's2',
        schema: {
          type: 'flexible',
          layout: { slots: [{ role: 'items', flow: 'stack' }] },
          settings: [{
            id: 'mode',
            type: 'select',
            layoutBind: [{ target: 'slot.items.flow' }],
            options: [
              { value: 'stack', layoutValues: { 'slot.items.flow': 'stack' } },
              { value: 'free', layoutValues: { 'slot.items.flow': 'layered' } },
            ],
          }],
        },
      }],
    }))
    expect(entryAt(registry, 'block:hero#placement.canvas')?.guidance).toContain('flexible')
  })
})

describe('buildEditableSurface — degraded state', () => {
  const seeded = buildEditableSurface(input({
    blockSchemas: [{
      source: 'x', schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] },
    }],
  }))

  it('marks the registry degraded when the theme ships no section-type schemas', () => {
    expect(seeded.degraded).toBe(true)
  })

  it('carries the degradation on the entries whose vocabulary it undermines', () => {
    expect(entryAt(seeded, 'section:*#sectionType')?.degraded).toMatchObject({
      reason: 'seeded-section-type-catalog',
    })
    expect(entryAt(seeded, 'block:hero#placement.canvas')?.degraded).toBeDefined()
  })

  it('presents an EMPTY section-type set rather than the builtin seed as vocabulary', () => {
    expect(entryAt(seeded, 'section:*#sectionType')?.constraint).toMatchObject({
      kind: 'theme-set', values: [],
    })
  })

  it('is not degraded once the theme ships one section type', () => {
    const registry = buildEditableSurface(input({
      sectionTypeSchemas: [{ source: 's', schema: { type: 'hero', layoutSlots: [], settings: [] } }],
    }))
    expect(registry.degraded).toBe(false)
    expect(entryAt(registry, 'section:*#sectionType')?.constraint).toMatchObject({ values: ['hero'] })
  })
})

describe('buildEditableSurface — sections', () => {
  const registry = buildEditableSurface(input({
    sectionTypeSchemas: [{
      source: 'themes/test-theme/section-types/split.settings.json',
      schema: {
        type: 'split',
        layoutSlots: [],
        settings: [{ id: 'shellSide', type: 'select', options: [{ value: 'left' }] }],
      },
    }],
    sectionLayoutSchemas: [{
      source: 'themes/test-theme/section-types/split.v2.json',
      schema: {
        type: 'split',
        layout: { slots: [] },
        settings: [{
          id: 'shellSide',
          type: 'select',
          options: [{ value: 'left' }, { value: 'right' }, { value: 'alternate' }],
        }],
      },
    }],
  }))

  it('routes sectionType and position to their dedicated ops', () => {
    expect(entryAt(registry, 'section:*#sectionType')).toMatchObject({
      capability: 'author-only', guidance: expect.stringContaining('change_section_type'),
    })
    expect(entryAt(registry, 'section:*#position')).toMatchObject({
      capability: 'author-only', guidance: expect.stringContaining('reorder_sections'),
    })
  })

  it('binds colorScheme to a closed enum, not a schema option list', () => {
    expect(entryAt(registry, 'section:*#colorScheme')?.constraint).toEqual({
      kind: 'closed-enum',
      vocabularyId: 'section-color-schemes',
      source: 'shared/types/colorRoles.ts',
    })
  })

  it('prefers the .v2.json option list where both files declare the setting', () => {
    // `.v2.json` is authoritative for the layout engine and carries the
    // layoutBind metadata; the `.settings.json` copy can lag it.
    expect(entryAt(registry, 'section:split#layoutConfig.shellSide')?.constraint).toMatchObject({
      values: ['left', 'right', 'alternate'],
    })
  })

  it('scopes layoutConfig per section type and presentation fields across all of them', () => {
    expect(entryAt(registry, 'section:split#layoutConfig.shellSide')?.scope).toEqual({ sectionType: 'split' })
    expect(entryAt(registry, 'section:*#colorScheme')?.scope).toEqual({})
  })

  it('fails CLOSED on every section address', () => {
    const sections = registry.entries.filter(entry => entry.entity === 'section')
    expect(sections.length).toBeGreaterThan(0)
    expect(sections.every(entry => entry.failDirection === 'fail-closed')).toBe(true)
  })
})

describe('buildEditableSurface — page, theme, typography', () => {
  const registry = buildEditableSurface(input({
    themeManifest: {
      settings: [
        { id: 'primaryColor', type: 'color' },
        { id: 'logoWidth', type: 'number' },
      ],
    },
  }))

  it('states publish and activate as never rather than omitting them', () => {
    expect(entryAt(registry, 'page:*#publish')?.capability).toBe('never')
    expect(entryAt(registry, 'page:*#activate')?.capability).toBe('never')
  })

  it('keeps auth columns author-only, and models the deployed R2 write-tool fields honestly', () => {
    expect(entryAt(registry, 'page:*#requireAuth')?.capability).toBe('author-only')
    expect(entryAt(registry, 'page:*#parentId')?.capability).toBe('author-only')
    expect(entryAt(registry, 'page:*#templateId')?.capability).toBe('author-only')
    // `slug` and `status` are agent-writable, not author-only: the deployed
    // `update_page_settings` R2 tool (WALLE `SplashRuntime/site-write.ts`)
    // PUTs `{ title, slug?, status? }` directly, role editor+. The refusal
    // that matters for slugs lives at the PREFILL adapter layer instead
    // (`admin/utils/prefill/adapters/`), not at this write surface.
    expect(entryAt(registry, 'page:*#slug')?.capability).toBe('agent-writable')
    expect(entryAt(registry, 'page:*#status')).toMatchObject({
      capability: 'agent-writable',
      constraint: { kind: 'schema-options', values: ['draft', 'published'] },
    })
    // `title` is a locale map (`Record<string, string>`), not a plain string —
    // `object` constraint checks shape only, honestly reflecting what this
    // tier can claim about a map whose keys are locales it does not enumerate.
    expect(entryAt(registry, 'page:*#title')).toMatchObject({
      capability: 'agent-writable',
      constraint: { kind: 'primitive', primitive: 'object' },
    })
  })

  it('names site settings and user management as unaddressable, not as never entries', () => {
    expect(registry.unaddressable).toEqual(['site-settings', 'user-management'])
    expect(registry.entries.some(entry => entry.path.includes('user'))).toBe(false)
  })

  it('derives theme settings from the manifest', () => {
    expect(entryAt(registry, 'theme:*#primaryColor')).toMatchObject({
      capability: 'agent-writable',
      constraint: { kind: 'primitive', primitive: 'string' },
      failDirection: 'fail-closed',
    })
    expect(entryAt(registry, 'theme:*#logoWidth')?.constraint).toEqual({ kind: 'primitive', primitive: 'number' })
  })

  it('models colour-role bindings and typography as late per-site data', () => {
    expect(entryAt(registry, 'theme:*#colorRoles')?.constraint).toEqual({
      kind: 'site-data', joinKey: 'color_roles',
    })
    expect(entryAt(registry, 'theme:*#colorRoles.<role>')?.constraint).toEqual({
      kind: 'closed-enum', vocabularyId: 'color-roles', source: 'shared/types/colorRoles.ts',
    })
    expect(entryAt(registry, 'typography:*#roles')?.constraint).toEqual({
      kind: 'site-data', joinKey: 'typography_roles',
    })
  })
})

describe('buildEditableSurface — registry invariants', () => {
  const built = () => buildEditableSurface(input({
    blockSchemas: [
      { source: 'z', schema: { type: 'zebra', settings: [{ id: 'a', type: 'text' }] } },
      { source: 'a', schema: { type: 'apple', settings: [{ id: 'b', type: 'text' }] } },
    ],
  }))

  it('sorts entries by address', () => {
    const addresses = built().entries.map(entry => entry.address)
    expect(addresses).toEqual([...addresses].sort())
  })

  it('is deterministic across builds', () => {
    expect(JSON.stringify(built())).toBe(JSON.stringify(built()))
  })

  it('declares a fail direction for every entity class', () => {
    expect(built().missingAddressFailDirection).toEqual({
      block: 'fail-open',
      section: 'fail-closed',
      page: 'fail-closed',
      theme: 'fail-closed',
      typography: 'fail-closed',
      layout: 'fail-closed',
    })
  })

  it('freezes entries so a consumer cannot widen its own capability', () => {
    const [entry] = built().entries
    expect(entry).toBeDefined()
    expect(() => {
      Object.assign(entry ?? {}, { capability: 'agent-writable' })
    }).toThrow()
  })
})

describe('address helpers', () => {
  it('renders the canonical display form', () => {
    expect(editableAddress('block', 'hero', 'title')).toBe('block:hero#title')
  })

  it('collapses an absent scope to *', () => {
    expect(scopeKey(undefined)).toBe('*')
    expect(scopeKey({})).toBe('*')
    expect(scopeKey({ blockType: 'hero' })).toBe('hero')
    expect(scopeKey({ sectionType: 'split' })).toBe('split')
    expect(scopeKey({ layoutType: 'header' })).toBe('header')
  })

  it('indexes every entry exactly once', () => {
    const registry = buildEditableSurface(input({
      blockSchemas: [{ source: 'a', schema: { type: 'hero', settings: [{ id: 'title', type: 'text' }] } }],
    }))
    expect(indexByAddress(registry).size).toBe(registry.entries.length)
  })
})
