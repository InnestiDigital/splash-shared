// Editable-surface registry — one builder, three loaders (Editing Surface v2, D2).
//
// Splash keeps three parallel descriptions of "what is editable": the schemas
// (truth), the admin UI (derived), and the assistant op union (a hand-written
// mirror that lags). This module derives the read side from the schemas so the
// lag has one fewer place to live. It answers, per editable ADDRESS SHAPE (not
// per instance): who may write it, what values are legal, which layer owns that
// vocabulary, and what to do when the host cannot tell.
//
// Plain ESM on purpose, exactly as `settingsFragments.mjs`: the three consumers
// that must agree are the admin glob loader (`editableSurfaceClient.ts`), the
// server filesystem loader (`server/services/editableSurface/`) and the
// plain-Node drift gate (`scripts/check-editable-surface.mjs`). A `.ts` module
// is unreachable from the last one, and mirroring the derivation there is
// exactly the drift this mechanism exists to prevent.
//
// Types live in the TypeScript sibling `editableSurface/types.ts` and are
// imported by JSDoc below, so the entry shape still has ONE description.

// Relative, not the `~/` alias: this module is loaded by the plain-Node drift
// gate, which has no alias resolution.
import { applyFragments, fragmentOwnedIds } from './settingsFragments.mjs'
import { declaresLayeredSlot } from './section-layouts/layeredSlots.mjs'

/** @typedef {import('./editableSurface/types').EditableSurfaceEntry} EditableSurfaceEntry */
/** @typedef {import('./editableSurface/types').EditableSurfaceRegistry} EditableSurfaceRegistry */
/** @typedef {import('./editableSurface/types').Constraint} Constraint */
/** @typedef {import('./editableSurface/types').CapabilityFlag} CapabilityFlag */
/** @typedef {import('./editableSurface/types').FailDirection} FailDirection */
/** @typedef {import('./editableSurface/types').VocabularyOwner} VocabularyOwner */
/** @typedef {import('./editableSurface/types').EntityClass} EntityClass */

/** Thrown when a theme's schemas cannot produce a registry. */
export class EditableSurfaceError extends Error {
  /**
   * @param {string} message
   * @param {string} source Repo-relative path (or theme id) of the offending input.
   */
  constructor(message, source) {
    super(`[editable-surface] ${source}: ${message}`)
    this.name = 'EditableSurfaceError'
    /** @readonly */
    this.source = source
  }
}

/**
 * Schema field types whose value is a media reference.
 *
 * A THIRD copy of the set already mirrored between
 * `server/services/media/mediaValueValidation.ts` and
 * `admin/utils/editorOps/applyEditorOp.ts:42-52` — the server's module pulls fs
 * code that must never reach the admin bundle, which is why the mirror exists
 * at all. This copy is pinned to both by
 * `tests/shared/features/cms/editableSurface.vocabulary.test.ts`. Collapsing
 * all three onto this plain-ESM module is the obvious follow-up; it changes
 * admin import graphs, so it is not a P1 refactor.
 */
export const MEDIA_FIELD_TYPES = Object.freeze([
  'image', 'media', 'video', 'image-gallery', 'gallery',
])
/** Of those, the ones whose value is a LIST rather than one reference. */
export const GALLERY_FIELD_TYPES = Object.freeze(['image-gallery', 'gallery'])

const MEDIA_FIELD_TYPE_SET = new Set(MEDIA_FIELD_TYPES)
const GALLERY_FIELD_TYPE_SET = new Set(GALLERY_FIELD_TYPES)

/**
 * The fragment whose two settings are the semantic colour axes. Its ids get a
 * companion `<id>.custom` address flagged `migration-only`: `{ custom: '#hex' }`
 * is writable by the C2 migration and readable by the renderer, and deliberately
 * absent from the editor picker (CLAUDE.md, Phase F). The registry has to be
 * able to SAY that, or the migration path violates its own registry.
 */
const COLOR_ROLE_FRAGMENT_ID = 'color-roles'

/**
 * Section columns an `update_section`-shaped write may carry.
 *
 * Restated here rather than imported from
 * `admin/lib/protocol/types/splash-editor-ops.ts`: that module is vendored and
 * checksummed, and `shared/` may not depend on `admin/lib`. The two are pinned
 * by `tests/shared/features/cms/editableSurface.vocabulary.test.ts`.
 */
const SECTION_PRESENTATION_FIELDS = Object.freeze([
  'name', 'anchor', 'colorScheme', 'containerMode', 'containerInsetX',
  'sectionSpaceY', 'sectionRole', 'isHidden', 'revealPreset',
  'defaultBlockEntrance',
])

/**
 * Page columns, and the two page-shaped ACTIONS that are deliberately
 * unreachable. `publish` / `activate` get `never` entries rather than silence:
 * an agent will look for them, and "no entry" is indistinguishable from "not
 * built yet", while `never` is a stated refusal.
 */
const PAGE_FIELDS = Object.freeze([
  // A LOCALE MAP (`Record<string, string>`, `server/database/schema/pages.ts`
  // — `title: json('title')`), not a plain string. The deployed R2 write tool
  // (`update_page_settings`, WALLE `SplashRuntime/site-write.ts`) builds this
  // with `buildLocaleMap(...)` and PUTs the object directly — `primitive:
  // 'string'` here would 422 every real call. `object` checks shape only
  // (a non-array object), which is what this tier can honestly claim about a
  // map whose keys are locales this registry does not enumerate.
  { path: 'title', capability: 'agent-writable', constraint: { kind: 'primitive', primitive: 'object' } },
  { path: 'noIndex', capability: 'agent-writable', constraint: { kind: 'primitive', primitive: 'boolean' } },
  { path: 'canonicalUrl', capability: 'author-only', constraint: { kind: 'primitive', primitive: 'string' } },
  // Routing identity — but the deployed R2 write tool deliberately sends
  // `slug` (same tool, same file). The refusal that matters for slugs lives
  // at the PREFILL adapter layer instead (`admin/utils/prefill/adapters/`:
  // "NEVER password/media/slug fields") — a different surface serving a
  // different risk (staging an unreviewed slug into the editor UI, not an
  // agent write the tool's own contract already allows). Reclassified to
  // match the tool this registry is meant to describe.
  { path: 'slug', capability: 'agent-writable', constraint: { kind: 'primitive', primitive: 'string' } },
  { path: 'parentId', capability: 'author-only', constraint: { kind: 'primitive', primitive: 'string' } },
  { path: 'templateId', capability: 'author-only', constraint: { kind: 'primitive', primitive: 'string' } },
  { path: 'requireAuth', capability: 'author-only', constraint: { kind: 'primitive', primitive: 'boolean' } },
  { path: 'published', capability: 'author-only', constraint: { kind: 'primitive', primitive: 'boolean' } },
  // Publication state. Legal values mirror the `status` MySQL enum
  // (`pages.ts`: `mysqlEnum('status', ['draft', 'published'])`). The deployed
  // R2 write tool sends this key directly, not through a separate publish
  // action — `schema-options` (a closed, self-contained value list) rather
  // than a boolean, because the wire value is the enum string.
  {
    path: 'status',
    capability: 'agent-writable',
    constraint: { kind: 'schema-options', values: ['draft', 'published'], source: 'server/database/schema/pages.ts' },
  },
  { path: 'publish', capability: 'never', constraint: { kind: 'primitive', primitive: 'boolean' } },
  { path: 'activate', capability: 'never', constraint: { kind: 'primitive', primitive: 'boolean' } },
])

/**
 * Capabilities with no address at all. Site settings and user management are
 * unreachable because they are not on the executor facade (facade.ts:50-60);
 * minting a `never`-flagged address for them is the first step toward one that
 * is not `never`, so they are named here and nowhere else.
 */
const UNADDRESSABLE = Object.freeze(['site-settings', 'user-management'])

/**
 * Missing-address fail direction per entity class.
 *
 * Block fields fail OPEN because that precedent is explicit and load-bearing:
 * "an existing block whose schema is missing must not make every field write
 * fail" (facade.ts:83-91). Every other class fails closed — a section, page,
 * theme or typography write we cannot classify has no equivalent argument, and
 * the section PUT that has no server gate at all is where the cost of guessing
 * otherwise already showed up (D3).
 */
const MISSING_ADDRESS_FAIL_DIRECTION = Object.freeze({
  block: 'fail-open',
  section: 'fail-closed',
  page: 'fail-closed',
  theme: 'fail-closed',
  typography: 'fail-closed',
  // Site-global chrome, for the same reason as theme settings: one write repaints
  // every page, and there is no per-instance schema to fall back onto.
  layout: 'fail-closed',
})

/**
 * @typedef {{ source: string, schema: any }} LoadedSchema
 *
 * @typedef {object} EditableSurfaceInput
 * @property {string} theme
 * @property {Record<string, any>} fragments Every settings fragment of the theme, by id.
 * @property {LoadedSchema[]} blockSchemas RAW block schemas — fragments NOT yet applied.
 * @property {LoadedSchema[]} sectionTypeSchemas `section-types/<type>.settings.json`.
 * @property {LoadedSchema[]} sectionLayoutSchemas `section-types/<type>.v2.json`.
 * @property {any} [themeManifest] `theme.json`, for the theme-settings entries.
 */

/**
 * Build one theme's editable-surface registry.
 *
 * Pure: same input, same output, entries sorted by address, no clock, no
 * filesystem, no network. That is what lets the drift gate compare a
 * fs-loaded registry against a committed snapshot and mean something.
 *
 * @param {EditableSurfaceInput} input
 * @returns {EditableSurfaceRegistry}
 */
export function buildEditableSurface(input) {
  if (!input || typeof input.theme !== 'string' || input.theme.length === 0) {
    throw new EditableSurfaceError('input requires a non-empty "theme"', '(input)')
  }

  const fragments = input.fragments ?? {}
  /** @type {EditableSurfaceEntry[]} */
  const entries = []

  const layered = layeredTypes(input.sectionLayoutSchemas ?? [])
  const sectionTypes = (input.sectionTypeSchemas ?? [])
    .map(({ schema }) => (typeof schema?.type === 'string' ? schema.type : null))
    .filter(type => type !== null)
    .sort()

  // A theme that ships no section-type schemas is not a theme with no section
  // types — it is a theme that predates them, and the catalog seeds the builtin
  // four (sectionTypeCatalog.ts:36-42). The registry must carry that as
  // degradation rather than present the seed as this theme's vocabulary (D2).
  const degradation = sectionTypes.length === 0
    ? Object.freeze({
      reason: 'seeded-section-type-catalog',
      detail: `theme "${input.theme}" ships no section-types/*.settings.json; `
        + 'the section-type set is the builtin seed, not this theme\'s vocabulary',
    })
    : undefined

  for (const loaded of input.blockSchemas ?? []) {
    entries.push(...blockEntries(loaded, fragments))
  }
  entries.push(...sectionEntries(sectionTypes, input.sectionTypeSchemas ?? [], input.sectionLayoutSchemas ?? [], degradation, input.themeManifest))
  entries.push(...placementEntries(input.blockSchemas ?? [], layered, degradation))
  entries.push(...layoutEntries(input.blockSchemas ?? [], fragments))
  entries.push(...pageEntries())
  entries.push(...themeEntries(input.themeManifest))
  entries.push(...typographyEntries())

  entries.sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0))

  const duplicate = firstDuplicateAddress(entries)
  if (duplicate) {
    throw new EditableSurfaceError(`duplicate address "${duplicate}"`, input.theme)
  }

  return Object.freeze({
    theme: input.theme,
    entries: Object.freeze(entries),
    degraded: entries.some(entry => entry.degraded !== undefined),
    missingAddressFailDirection: MISSING_ADDRESS_FAIL_DIRECTION,
    unaddressable: UNADDRESSABLE,
  })
}

/**
 * Canonical display form. For display and logging ONLY — never on the wire, and
 * never parsed back: three of the four targeting modes cannot be a string (D1).
 *
 * @param {EntityClass} entity
 * @param {string} scope Result of `scopeKey`.
 * @param {string} path
 */
export function editableAddress(entity, scope, path) {
  return `${entity}:${scope}#${path}`
}

/** @param {import('./editableSurface/types').EntityScope} [scope] */
export function scopeKey(scope) {
  return scope?.blockType ?? scope?.sectionType ?? scope?.layoutType ?? '*'
}

/**
 * `.v2.json` types that can carry a layered slot — the one thing that makes
 * `placement.canvas` legal outside a brand-canvas page
 * (sectionTypeCatalog.ts:46-51). The predicate is the shared one, not a local
 * `.some` over declared flows: a type may reach `layered` through a
 * `slot.<role>.flow` binding, and a gate that missed that would refuse geometry
 * for a section the author legitimately switched over.
 *
 * @param {LoadedSchema[]} layoutSchemas
 * @returns {Set<string>}
 */
function layeredTypes(layoutSchemas) {
  const layered = new Set()
  for (const { schema } of layoutSchemas) {
    if (typeof schema?.type === 'string' && declaresLayeredSlot(schema)) layered.add(schema.type)
  }
  return layered
}

/**
 * One block schema's settings, with fragment ownership preserved.
 *
 * The RAW schema is what arrives, not the merged one: `applyFragments` returns a
 * flat settings array in which fragment-owned and block-owned fields are
 * indistinguishable, and that two-level model is exactly what the registry must
 * re-encode (D2).
 *
 * @param {LoadedSchema} loaded
 * @param {Record<string, any>} fragments
 * @returns {EditableSurfaceEntry[]}
 */
function blockEntries(loaded, fragments) {
  const { source, schema } = loaded
  const blockType = schema?.type
  if (typeof blockType !== 'string' || blockType.length === 0) {
    throw new EditableSurfaceError('block schema has no "type"', source)
  }

  const declared = Array.isArray(schema.$fragments) ? schema.$fragments : []
  /** @type {Record<string, any>} */
  const declaredFragments = {}
  for (const id of declared) {
    if (fragments[id]) declaredFragments[id] = fragments[id]
  }
  const owned = fragmentOwnedIds(declaredFragments)
  const overrides = schema.$fragmentOverrides ?? {}

  const merged = applyFragments(schema, fragments, source)
  /** @type {EditableSurfaceEntry[]} */
  const entries = []

  for (const setting of merged.settings ?? []) {
    if (typeof setting?.id !== 'string' || setting.id.length === 0) continue

    const fragmentId = owned.get(setting.id)
    const patch = fragmentId ? (overrides[setting.id] ?? {}) : {}
    /** @type {VocabularyOwner} */
    const owner = fragmentId
      ? {
        level: 'fragment',
        fragmentId,
        patchedKeys: Object.keys(patch).filter(key => key !== 'omitOptions').sort(),
        omittedOptions: [...(patch.omitOptions ?? [])].sort(),
      }
      : { level: 'schema', source }

    const scope = { blockType }
    const address = editableAddress('block', blockType, setting.id)
    const constraint = constraintForField(setting)

    entries.push(freezeEntry({
      address,
      entity: 'block',
      scope,
      path: setting.id,
      capability: capabilityForField(setting),
      constraint,
      // Media fields fail CLOSED, mirroring `attach_media`: an op whose whole
      // premise is "this is a media field" must not proceed when the host
      // cannot see that it is one (applyEditorOp.ts, attach_media). Everything
      // else on a block fails open, per the declared-setting-id precedent.
      failDirection: constraint.kind === 'media-ref' ? 'fail-closed' : 'fail-open',
      owner,
      settingType: typeof setting.type === 'string' ? setting.type : undefined,
    }))

    if (fragmentId === COLOR_ROLE_FRAGMENT_ID) {
      entries.push(freezeEntry({
        address: editableAddress('block', blockType, `${setting.id}.custom`),
        entity: 'block',
        scope,
        path: `${setting.id}.custom`,
        capability: 'migration-only',
        constraint: { kind: 'primitive', primitive: 'string' },
        failDirection: 'fail-closed',
        owner: { level: 'shared', source: 'docs/architecture/color-roles-phase-f.md' },
        guidance: 'Migration-only hex escape. Written by the C2 block-colour migration, '
          + 'read by the renderer, deliberately absent from the editor picker — the count of '
          + 'instances still holding one is the burn-down metric. Do not mint new ones.',
      }))
    }
  }

  return entries
}

/**
 * `placement.canvas` for every block type, capability CONDITIONAL on the
 * enclosing section type declaring a layered slot. Capability can depend on a
 * sibling schema file, not just on the address itself (D2).
 *
 * @param {LoadedSchema[]} blockSchemas
 * @param {Set<string>} layered
 * @param {any} [degradation]
 * @returns {EditableSurfaceEntry[]}
 */
function placementEntries(blockSchemas, layered, degradation) {
  const guidance = layered.size > 0
    ? `Legal inside section types with a layered slot (${[...layered].sort().join(', ')}), `
      + 'and on brand-canvas pages regardless.'
    : 'No section type in this theme declares a layered slot, so this is legal only on '
      + 'brand-canvas pages.'

  return blockSchemas
    .map(({ schema }) => schema?.type)
    .filter(type => typeof type === 'string' && type.length > 0)
    .map(blockType => freezeEntry({
      address: editableAddress('block', blockType, 'placement.canvas'),
      entity: 'block',
      scope: { blockType },
      path: 'placement.canvas',
      // The base flag is what applies when NEITHER route can be evaluated.
      capability: 'never',
      // Both routes `canvasPlacementAllowed` answers, as an ANY-OF: a section
      // type with a layered slot, OR a brand-canvas page, which is free
      // placement end to end and qualifies every block on it regardless of
      // section type. Modelling only the first made the registry stricter than
      // the API, so the executor had to ask the shared predicate and then
      // discard the kernel's capability verdict to avoid refusing a move the
      // author can make by dragging.
      conditional: {
        when: ['section-type-has-layered-slot', 'page-is-brand-canvas'],
        capability: 'agent-writable',
        otherwise: 'never',
      },
      constraint: { kind: 'geometry', geometry: 'canvas-block' },
      failDirection: 'fail-closed',
      owner: { level: 'shared', source: 'shared/types/placement.ts' },
      guidance,
      ...(degradation ? { degraded: degradation } : {}),
    }))
}

/**
 * Site-global layout chrome: every setting a layout-component schema declares,
 * scoped by its layout type (`header`, `footer`, …).
 *
 * These are a SECOND address for schemas that also produce block entries, and
 * that is not duplication — it is two storages. A layout component's settings
 * live in `navigation_layouts`, one row per site per type, written by
 * `PUT /api/admin/s/:siteId/layout-settings/:type` (the `update_layout_settings`
 * op); the block entries of the same schema describe a block ROW carrying the
 * same fields. Same vocabulary, derived by the same two functions from the same
 * file, so the two cannot disagree about what a legal value is — while the
 * capability, the fail direction and the undo class differ, which is exactly
 * what a separate entity class is for.
 *
 * The set is NOT the op's `layoutType` enum. A theme may declare a layout
 * component the protocol has no op for (the reference theme's `search-bar`);
 * the registry describes the surface, and the op union narrows it.
 *
 * @param {LoadedSchema[]} blockSchemas
 * @param {Record<string, any>} fragments
 * @returns {EditableSurfaceEntry[]}
 */
function layoutEntries(blockSchemas, fragments) {
  /** @type {EditableSurfaceEntry[]} */
  const entries = []

  for (const { source, schema } of blockSchemas) {
    if (schema?.isLayoutComponent !== true) continue
    const layoutType = schema.type
    if (typeof layoutType !== 'string' || layoutType.length === 0) continue

    // Fragments applied for the same reason block entries apply them: a layout
    // component that adopts one declares its fields through `$fragments`, and a
    // raw read would report the schema as declaring fewer ids than it does.
    const merged = applyFragments(schema, fragments, source)
    for (const setting of merged.settings ?? []) {
      if (typeof setting?.id !== 'string' || setting.id.length === 0) continue
      entries.push(freezeEntry({
        address: editableAddress('layout', layoutType, setting.id),
        entity: 'layout',
        scope: { layoutType },
        path: setting.id,
        capability: capabilityForField(setting),
        constraint: constraintForField(setting),
        // Site-global: the PUT replaces the whole settings object for the type,
        // so a write the host cannot classify has no per-page blast radius to
        // bound it. Same argument as theme settings.
        failDirection: 'fail-closed',
        owner: { level: 'schema', source },
        settingType: typeof setting.type === 'string' ? setting.type : undefined,
      }))
    }
  }

  return entries
}

/**
 * Section presentation columns, the type/position columns that have a dedicated
 * op instead, and every `layoutConfig.<id>` a section type declares.
 *
 * @param {string[]} sectionTypes
 * @param {LoadedSchema[]} sectionTypeSchemas
 * @param {LoadedSchema[]} sectionLayoutSchemas
 * @param {any} [degradation]
 * @param {any} [themeManifest] `theme.json`, for the two motion vocabularies.
 * @returns {EditableSurfaceEntry[]}
 */
function sectionEntries(sectionTypes, sectionTypeSchemas, sectionLayoutSchemas, degradation, themeManifest) {
  /** @type {EditableSurfaceEntry[]} */
  const entries = []
  const degraded = degradation ? { degraded: degradation } : {}

  for (const field of SECTION_PRESENTATION_FIELDS) {
    entries.push(freezeEntry({
      address: editableAddress('section', '*', field),
      entity: 'section',
      scope: {},
      path: field,
      capability: 'agent-writable',
      constraint: sectionPresentationConstraint(field, themeManifest),
      failDirection: 'fail-closed',
      owner: { level: 'shared', source: 'shared/features/cms/editableSurface.mjs' },
    }))
  }

  entries.push(freezeEntry({
    address: editableAddress('section', '*', 'sectionType'),
    entity: 'section',
    scope: {},
    path: 'sectionType',
    // `change_section_type` routes through a dedicated re-planning endpoint that
    // moves blocks between roles; a bare column write skips the re-plan and
    // orphans every placed block.
    capability: 'author-only',
    constraint: {
      kind: 'theme-set',
      values: sectionTypes,
      source: 'themes/<theme>/section-types/*.settings.json',
    },
    failDirection: 'fail-closed',
    owner: { level: 'schema', source: 'themes/<theme>/section-types' },
    guidance: 'Use the change_section_type op, which re-plans block placement.',
    ...degraded,
  }))

  entries.push(freezeEntry({
    address: editableAddress('section', '*', 'position'),
    entity: 'section',
    scope: {},
    path: 'position',
    capability: 'author-only',
    constraint: { kind: 'primitive', primitive: 'number' },
    failDirection: 'fail-closed',
    owner: { level: 'shared', source: 'shared/features/cms/editableSurface.mjs' },
    guidance: 'Use the reorder_sections op, which writes a whole-list order.',
  }))

  entries.push(freezeEntry({
    address: editableAddress('section', '*', 'choreographyMeta'),
    entity: 'section',
    scope: {},
    path: 'choreographyMeta',
    capability: 'agent-writable',
    // `{ mode, baseDelay, order }` (`shared/types/animation.ts` —
    // `ChoreographyMeta`) or `null`, which clears the choreography back to
    // the theme default. Shape only: the kernel cannot enumerate
    // `ChoreographyMode`/`ChoreographyOrder` without pulling the type layer
    // into an .mjs module, and a wrong value is inert at the resolver.
    constraint: { kind: 'primitive', primitive: 'object', nullable: true },
    failDirection: 'fail-closed',
    owner: { level: 'shared', source: 'shared/features/cms/editableSurface.mjs' },
  }))

  // The `.v2.json` settings win where both files declare an id: that file is
  // authoritative for the layout engine and carries the `layoutBind` metadata.
  const byType = new Map()
  for (const { source, schema } of sectionTypeSchemas) {
    if (typeof schema?.type === 'string') byType.set(schema.type, { source, settings: schema.settings ?? [] })
  }
  for (const { source, schema } of sectionLayoutSchemas) {
    if (typeof schema?.type === 'string') byType.set(schema.type, { source, settings: schema.settings ?? [] })
  }

  for (const sectionType of [...byType.keys()].sort()) {
    const { source, settings } = byType.get(sectionType)
    for (const setting of settings) {
      if (typeof setting?.id !== 'string' || setting.id.length === 0) continue
      // Whether the setting RESHAPES the grid (`layoutBind`) or only decorates
      // it. A registry fact rather than a second read of `.v2.json` by every
      // consumer: the composition guide marks these for the model, and a guide
      // that re-derived it from the schema files would be the parallel
      // description this registry exists to collapse (D7).
      const layoutBound = Array.isArray(setting.layoutBind) && setting.layoutBind.length > 0
      entries.push(freezeEntry({
        address: editableAddress('section', sectionType, `layoutConfig.${setting.id}`),
        entity: 'section',
        scope: { sectionType },
        path: `layoutConfig.${setting.id}`,
        // `capabilityForField`, not a flat `agent-writable`: an `internal: true`
        // id or a `hidden` control is written by migrations and by section
        // creation, never by a person or an agent — and that is as true of a
        // section-layout setting as of a block one. Block and theme entries have
        // always read it through this function; these did not, which made
        // `layoutConfig` the one place where `internal` meant nothing.
        capability: capabilityForField(setting),
        constraint: constraintForField(setting),
        failDirection: 'fail-closed',
        owner: { level: 'schema', source },
        settingType: typeof setting.type === 'string' ? setting.type : undefined,
        ...(layoutBound ? { layoutBound: true } : {}),
      }))
    }
  }

  return entries
}

/**
 * `'none'` is a SENTINEL on both motion fields, not a preset id: it means
 * "explicitly no motion here", as opposed to `null`, which inherits the theme
 * default. Always offered, so a theme that declares no presets at all still has
 * a non-empty vocabulary rather than a `theme-set` that refuses everything.
 */
const MOTION_NONE = 'none'

/**
 * Preset ids declared under one key of `theme.json`'s `motion` block, plus the
 * `none` sentinel — sorted, so the registry stays deterministic under a
 * key-order change in the manifest.
 *
 * @param {any} themeManifest
 * @param {string} key `revealPresets` | `entrancePresets`
 * @returns {string[]}
 */
function motionPresetIds(themeManifest, key) {
  const presets = themeManifest?.motion?.[key]
  const ids = presets && typeof presets === 'object' && !Array.isArray(presets)
    ? Object.keys(presets).filter(id => id !== MOTION_NONE)
    : []
  return [...ids.sort(), MOTION_NONE]
}

/**
 * @param {string} field
 * @param {any} [themeManifest]
 */
function sectionPresentationConstraint(field, themeManifest) {
  switch (field) {
    case 'colorScheme':
      return { kind: 'closed-enum', vocabularyId: 'section-color-schemes', source: 'shared/types/colorRoles.ts' }
    case 'sectionRole':
      // Page-semantic role (hero/content/divider/footer; `null` = untagged,
      // the select's "None" option). The legacy free-form values blueprints
      // used to seed are normalized by the 2026_09_19 migration and guarded
      // by blueprintValidation — this enum is the contract now.
      return { kind: 'closed-enum', vocabularyId: 'section-roles', nullable: true, source: 'shared/types/layout.ts#SECTION_ROLES' }
    case 'isHidden':
      return { kind: 'primitive', primitive: 'boolean' }
    case 'name':
    case 'anchor':
      return { kind: 'primitive', primitive: 'string' }

    // The three placement fields are ENGINE vocabularies — one width formula
    // per container mode, one custom property per spacing tier — so they are
    // `closed-enum` against a `shared/` constant, resolved by
    // `CLOSED_VOCABULARIES` for the same reason `color-roles` is: this builder
    // is plain ESM and cannot import the `.ts` module that declares them.
    case 'containerMode':
      return { kind: 'closed-enum', vocabularyId: 'section-container-modes', source: 'shared/types/layout.ts' }
    case 'containerInsetX':
    case 'sectionSpaceY':
      return { kind: 'closed-enum', vocabularyId: 'layout-spacing-tiers', source: 'shared/types/layout.ts' }

    // The two motion fields are genuinely per-theme: `useSectionReveal`
    // resolves `revealPreset` against `motion.revealPresets` from the client
    // config, and the entrance loader builds its presets out of
    // `motion.entrancePresets`. A `shared/` constant would be a fifth copy that
    // a theme edit silently invalidates, so these read the manifest — the same
    // file `themeEntries` already reads.
    case 'revealPreset':
      return {
        kind: 'theme-set',
        values: motionPresetIds(themeManifest, 'revealPresets'),
        nullable: true,
        source: 'themes/<theme>/theme.json#motion.revealPresets',
      }
    case 'defaultBlockEntrance':
      return {
        kind: 'theme-set',
        values: motionPresetIds(themeManifest, 'entrancePresets'),
        nullable: true,
        source: 'themes/<theme>/theme.json#motion.entrancePresets',
      }

    default:
      return { kind: 'opaque', reason: `unmapped section presentation field "${field}"` }
  }
}

/** @returns {EditableSurfaceEntry[]} */
function pageEntries() {
  return PAGE_FIELDS.map(field => freezeEntry({
    address: editableAddress('page', '*', field.path),
    entity: 'page',
    scope: {},
    path: field.path,
    capability: field.capability,
    constraint: field.constraint,
    failDirection: 'fail-closed',
    owner: { level: 'shared', source: 'server/database/schema/pages.ts' },
    ...(field.capability === 'never'
      ? {
        guidance: 'Not on the executor facade (facade.ts:50-60). Reachable only through the '
          + 'admin UI, by a human, in an authenticated session.',
      }
      : {}),
  }))
}

/**
 * `theme.json` settings, plus one address per colour role.
 *
 * The role ADDRESSES are a closed enum; the VALUE each one binds is per-site
 * data that joins at request time and is never baked in (D2).
 *
 * @param {any} manifest
 * @returns {EditableSurfaceEntry[]}
 */
function themeEntries(manifest) {
  /** @type {EditableSurfaceEntry[]} */
  const entries = []

  for (const setting of manifest?.settings ?? []) {
    if (typeof setting?.id !== 'string' || setting.id.length === 0) continue
    entries.push(freezeEntry({
      address: editableAddress('theme', '*', setting.id),
      entity: 'theme',
      scope: {},
      path: setting.id,
      capability: capabilityForField(setting),
      constraint: constraintForField(setting),
      // Theme settings use a 2-tier cascade with no theme-defaults tier, so a
      // missing schema means the write has no default to fall back onto.
      failDirection: 'fail-closed',
      owner: { level: 'schema', source: 'themes/<theme>/theme.json' },
      settingType: typeof setting.type === 'string' ? setting.type : undefined,
    }))
  }

  entries.push(freezeEntry({
    address: editableAddress('theme', '*', 'colorRoles'),
    entity: 'theme',
    scope: {},
    path: 'colorRoles',
    // No op writes colour-role bindings today, and the binding surface is the
    // one that repaints an entire site in one write.
    capability: 'author-only',
    constraint: { kind: 'site-data', joinKey: 'color_roles' },
    failDirection: 'fail-closed',
    owner: { level: 'shared', source: 'shared/types/colorRoles.ts' },
    guidance: 'Role name → theme-manifest colour setting id. Never a hex. '
      + 'A site with zero rows renders exactly as before this tier existed.',
  }))

  entries.push(freezeEntry({
    address: editableAddress('theme', '*', 'colorRoles.<role>'),
    entity: 'theme',
    scope: {},
    path: 'colorRoles.<role>',
    capability: 'author-only',
    constraint: { kind: 'closed-enum', vocabularyId: 'color-roles', source: 'shared/types/colorRoles.ts' },
    failDirection: 'fail-closed',
    owner: { level: 'shared', source: 'shared/types/colorRoles.ts' },
  }))

  return entries
}

/** @returns {EditableSurfaceEntry[]} */
function typographyEntries() {
  return [
    freezeEntry({
      address: editableAddress('typography', '*', 'roles'),
      entity: 'typography',
      scope: {},
      path: 'roles',
      capability: 'agent-writable',
      constraint: { kind: 'site-data', joinKey: 'typography_roles' },
      failDirection: 'fail-closed',
      owner: { level: 'shared', source: 'server/services/typography/typographyTypes.ts' },
      guidance: 'The complete role map is PUT and the server replaces all mappings, so a '
        + 'partial map merged into an unloaded one clears every role on the site.',
    }),
    freezeEntry({
      address: editableAddress('typography', '*', 'presets'),
      entity: 'typography',
      scope: {},
      path: 'presets',
      capability: 'agent-writable',
      constraint: { kind: 'site-data', joinKey: 'typography_presets' },
      failDirection: 'fail-closed',
      owner: { level: 'shared', source: 'server/services/typography/typographyTypes.ts' },
    }),
  ]
}

/**
 * Capability for one schema-declared field.
 *
 * Schema-declared settings are agent-writable by default — that is the whole
 * point of deriving the registry. The exceptions are fields the editor itself
 * never exposes: `internal: true` ids and `hidden` types are written by
 * migrations and by block creation, never by a person or an agent.
 *
 * @param {any} setting
 * @returns {CapabilityFlag}
 */
function capabilityForField(setting) {
  if (setting?.internal === true) return 'migration-only'
  if (setting?.type === 'hidden') return 'migration-only'
  return 'agent-writable'
}

/**
 * Constraint for one schema-declared field.
 *
 * @param {any} setting
 * @returns {Constraint}
 */
function constraintForField(setting) {
  const type = typeof setting?.type === 'string' ? setting.type : ''

  if (MEDIA_FIELD_TYPE_SET.has(type)) {
    // `TImagePicker` reads `options.valueMode`, defaulting to `url`; only the
    // record form of `options` carries it, so read it defensively.
    const options = setting.options
    const valueMode = options && !Array.isArray(options) ? options.valueMode : undefined
    return {
      kind: 'media-ref',
      fieldType: type,
      valueMode: valueMode === 'id' ? 'id' : 'url',
      list: GALLERY_FIELD_TYPE_SET.has(type),
    }
  }

  switch (type) {
    case 'select':
    case 'radio': {
      const options = Array.isArray(setting.options) ? setting.options : []
      return {
        kind: 'schema-options',
        values: options
          .map(option => option?.value)
          .filter(value => typeof value === 'string'),
        source: 'schema options',
      }
    }
    case 'toggle':
    case 'checkbox':
    // `boolean` is a fragment spelling of the same control; the schema lints do
    // not unify the three, so the registry maps all three rather than reporting
    // a fragment-owned field as an unmapped type.
    case 'boolean':
      return { kind: 'primitive', primitive: 'boolean' }
    case 'number':
    case 'range':
      return { kind: 'primitive', primitive: 'number' }
    case 'text':
    case 'textarea':
    case 'url':
    case 'color':
    case 'hidden':
    case 'api-method':
    case 'richtext':
    case 'richtext-single':
    case 'richtext-inline':
    case 'richtext-block':
      return { kind: 'primitive', primitive: 'string' }
    case 'repeater':
    case 'blocks':
      // Row identity does not exist and index addresses are unstable under
      // concurrent reorder (D1) — the legal write is the whole list.
      return { kind: 'primitive', primitive: 'array' }
    default:
      return { kind: 'opaque', reason: `unmapped field type "${type}"` }
  }
}

/** @param {EditableSurfaceEntry[]} entries */
function firstDuplicateAddress(entries) {
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.address)) return entry.address
    seen.add(entry.address)
  }
  return null
}

/**
 * @param {any} entry
 * @returns {EditableSurfaceEntry}
 */
function freezeEntry(entry) {
  return Object.freeze(entry)
}

/**
 * Index a registry by canonical address. Built on demand rather than stored:
 * the registry itself has to stay a plain, deterministically serialisable
 * object for the drift gate to compare it against a snapshot.
 *
 * @param {EditableSurfaceRegistry} registry
 * @returns {Map<string, EditableSurfaceEntry>}
 */
export function indexByAddress(registry) {
  return new Map(registry.entries.map(entry => [entry.address, entry]))
}
