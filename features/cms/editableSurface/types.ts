// shared/features/cms/editableSurface/types.ts
//
// The type half of the editable-surface registry (Editing Surface v2, D2/D3).
// The runtime half is `shared/features/cms/editableSurface.mjs` — plain ESM so
// the admin glob loader, the server fs loader and the plain-Node drift gate all
// consume ONE builder, exactly as `settingsFragments.mjs` does for the merge.
// That module's JSDoc imports these declarations rather than restating them, so
// there is still one description of the entry shape.

// The tuples live in the plain-ESM vocabulary module: the drift gate runs under
// plain Node and cannot import a `.ts`. Re-exported here so importers get types
// and values from one place.
export {
  ENTITY_CLASSES,
  CAPABILITY_FLAGS,
  FAIL_DIRECTIONS,
  PRINCIPALS,
  CLOSED_VOCABULARY_IDS,
  CONDITION_KINDS,
  CONSTRAINT_KINDS,
} from '~/shared/features/cms/editableSurfaceVocabulary.mjs'

import type {
  ENTITY_CLASSES as EntityClasses,
  CAPABILITY_FLAGS as CapabilityFlags,
  FAIL_DIRECTIONS as FailDirections,
  PRINCIPALS as Principals,
  CLOSED_VOCABULARY_IDS as ClosedVocabularyIds,
  CONDITION_KINDS as ConditionKinds,
} from '~/shared/features/cms/editableSurfaceVocabulary.mjs'

/**
 * D1/D8: the class of an address is its entity kind. The undo predicate and the
 * capability defaults both key on it.
 */
export type EntityClass = typeof EntityClasses[number]

export type CapabilityFlag = typeof CapabilityFlags[number]

/**
 * What to do when the host cannot answer whether the write is legal — because a
 * schema is unloadable, not because the value is wrong. The two live precedents
 * disagree (declared-setting-id fails open, media existence fails closed), so
 * D3 makes it per-entry data instead of whichever module answers first.
 */
export type FailDirection = typeof FailDirections[number]

/** Who is attempting the write. Decides which capability flags pass. */
export type Principal = typeof Principals[number]

/**
 * Which layer owns the vocabulary of an entry. Fragment-owned vocabulary and
 * block-owned overrides stay TWO levels (D2): flattening them would erase the
 * distinction the `fragment-vocabulary` lint exists to enforce.
 */
export type VocabularyOwner =
  | {
    readonly level: 'fragment'
    readonly fragmentId: string
    /** `$fragmentOverrides` keys this adopter patched. Never includes `id`/`type`/`options`. */
    readonly patchedKeys: readonly string[]
    /** Option values `omitOptions` removed for this adopter. */
    readonly omittedOptions: readonly string[]
  }
  | { readonly level: 'schema', readonly source: string }
  | { readonly level: 'shared', readonly source: string }

/**
 * Ids of the static vocabularies a `closed-enum` constraint can name. The
 * VALUES are not stored in the registry: they live in `shared/` TypeScript that
 * the plain-ESM builder (and the plain-Node drift gate) cannot import, so the
 * builder records the id and the kernel resolves it from
 * `ValidationContext.closedVocabularies`. `tests/shared/features/cms/
 * editableSurface.vocabulary.test.ts` pins each id to its `shared/` constant.
 */
export type ClosedVocabularyId = typeof ClosedVocabularyIds[number]

/**
 * Constraint SPECIES, not one constraint with a mode field (D2).
 *
 * - `closed-enum` — a static vocabulary compiled into `shared/` (`COLOR_ROLES`,
 *   the section colour schemes). Adding a value is a reviewable `.ts` diff.
 * - `theme-set` — an open set derived from files on disk (section types, the
 *   `motion` presets a theme declares). A theme grows one by adding a file or a
 *   manifest key; nothing in `shared/` moves.
 * - `schema-options` — the option list of one `select`/`radio` field.
 * - `site-data` — the value joins as a late per-request tier (colour-role
 *   bindings, typography presets) and is never baked into the registry.
 *
 * `nullable` on a `theme-set` says `null` is a MEANING, not a missing value:
 * a nullable `revealPreset` column reads "inherit the theme default", which is
 * a different instruction from the `none` sentinel in the same vocabulary. The
 * flag lives on the constraint because it describes the legal value set, and
 * only the two nullable section columns carry it.
 */
export type Constraint =
  | { readonly kind: 'closed-enum', readonly vocabularyId: ClosedVocabularyId, readonly source: string }
  | {
    readonly kind: 'theme-set'
    readonly values: readonly string[]
    readonly source: string
    readonly nullable?: true
  }
  | { readonly kind: 'schema-options', readonly values: readonly string[], readonly source: string }
  | {
    readonly kind: 'primitive'
    readonly primitive: 'string' | 'number' | 'boolean' | 'object' | 'array'
    /** `null` clears the column (same semantics as `theme-set.nullable`). */
    readonly nullable?: true
  }
  | { readonly kind: 'geometry', readonly geometry: 'canvas-block' }
  | {
    readonly kind: 'media-ref'
    readonly fieldType: string
    readonly valueMode: 'id' | 'url'
    /** True for gallery-shaped fields, whose value is a LIST of references. */
    readonly list: boolean
  }
  | { readonly kind: 'site-data', readonly joinKey: string }
  | { readonly kind: 'opaque', readonly reason: string }

/**
 * One ATOMIC fact a capability may depend on — a sibling schema file or a
 * property of the page, not only the address itself.
 */
export type ConditionKind = typeof ConditionKinds[number]

export interface ConditionalCapability {
  /**
   * ANY-OF, and non-empty. `placement.canvas` has two INDEPENDENT routes to
   * legality — a section type declaring a layered slot, or a brand-canvas page,
   * which is free placement end to end — and `canvasPlacementAllowed` answers
   * exactly that disjunction. A list keeps each route an atomic kind the kernel
   * can switch on exhaustively, and keeps a future entry that needs only one of
   * them from having to re-split a fused name.
   */
  readonly when: readonly ConditionKind[]
  /** Capability when at least one condition holds. */
  readonly capability: CapabilityFlag
  /** Capability when every condition is evaluable and none holds. */
  readonly otherwise: CapabilityFlag
}

/**
 * Propagated, never smoothed over: a seeded catalog is a theme that ships no
 * section-type schemas, and its fallback values are NOT that theme's vocabulary.
 */
export interface Degradation {
  readonly reason: 'seeded-section-type-catalog'
  readonly detail: string
}

export interface EntityScope {
  readonly blockType?: string
  readonly sectionType?: string
  readonly layoutType?: string
}

export interface EditableSurfaceEntry {
  /**
   * Canonical string form, for display and logging only — never on the wire
   * (D1). `block:HeroBlock#background`, `section:*#colorScheme`.
   */
  readonly address: string
  readonly entity: EntityClass
  readonly scope: EntityScope
  /** Flat dotted/indexed field path. Only the first segment is schema-checkable. */
  readonly path: string
  readonly capability: CapabilityFlag
  readonly conditional?: ConditionalCapability
  readonly constraint: Constraint
  readonly failDirection: FailDirection
  readonly owner: VocabularyOwner
  /** The schema's declared field type (`select`, `image`, …) where one exists. */
  readonly settingType?: string
  readonly degraded?: Degradation
  /**
   * True for a `layoutConfig` setting that carries `layoutBind` — it RESHAPES
   * the grid rather than decorating it. Absent everywhere else; the distinction
   * only exists for section-layout settings.
   */
  readonly layoutBound?: boolean
  /** D7: usage notes migrate here from the hand-written composition guide. */
  readonly guidance?: string
}

export interface EditableSurfaceRegistry {
  readonly theme: string
  /** Sorted by address, so two loaders of the same theme are byte-comparable. */
  readonly entries: readonly EditableSurfaceEntry[]
  /** True when any entry carries a degradation. */
  readonly degraded: boolean
  /**
   * Fail direction for an address with NO entry, per class. An unknown block
   * field fails open (facade.ts:83-91 — a block whose schema is missing must not
   * make every field write fail); everything else fails closed.
   */
  readonly missingAddressFailDirection: Readonly<Record<EntityClass, FailDirection>>
  /**
   * Capabilities that are deliberately NOT addresses. Site settings and user
   * management are unreachable because they are off the executor facade, and
   * minting a `never`-flagged address for them is the first step toward one
   * that is not `never`. Publish and activate DO get `never` entries: they are
   * page-shaped, so an agent will look for them.
   */
  readonly unaddressable: readonly string[]
}

export type ValidationIssueKind =
  | 'unknown-address'
  | 'forbidden-path'
  | 'oversized-index'
  | 'not-writable'
  | 'conditional-unmet'
  | 'enum-violation'
  | 'type-violation'
  | 'geometry-violation'
  | 'color-role-unknown'
  | 'batch-cap-exceeded'
  | 'payload-cap-exceeded'
  | 'degraded-vocabulary'

export interface ValidationIssue {
  readonly kind: ValidationIssueKind
  /** `warning` is what a fail-OPEN entry produces; a caller may proceed past it. */
  readonly severity: 'error' | 'warning'
  readonly address: string
  readonly path: string
  readonly message: string
}

/** The address SHAPE being validated. The entity *reference* stays structured elsewhere (D1). */
export interface EditableAddress {
  readonly entity: EntityClass
  readonly scope?: EntityScope
  readonly path: string
}

export interface ValidationCaps {
  readonly maxOpsPerBatch: number
  readonly maxSettingsKeys: number
}

/**
 * Everything the kernel is allowed to look at. All of it injected: the kernel
 * never fetches, never imports fs/DOM/Vue/Pinia (D4).
 */
export interface ValidationContext {
  readonly registry: EditableSurfaceRegistry
  readonly principal: Principal
  /**
   * Section types whose `.v2.json` declares a layered slot. Absent means the
   * caller could not determine it — conditional entries then take their fail
   * direction rather than assuming either branch.
   */
  readonly layeredSectionTypes?: ReadonlySet<string>
  /** The section type the addressed entity sits in, where the address needs one. */
  readonly sectionType?: string
  /**
   * The `pageType` of the page the addressed entity sits on. `undefined` means
   * the caller could not determine it and the `page-is-brand-canvas` condition
   * is UNEVALUABLE; `null` is a page that genuinely carries no type, which
   * evaluates the condition to false. Collapsing the two would turn "we did not
   * look" into "it is not a brand-canvas page", which is a verdict.
   */
  readonly pageType?: string | null
  /**
   * Scopes whose schema the caller genuinely loaded. An address whose scope is
   * absent here is unverifiable rather than wrong, so the fail direction — not
   * the miss — decides the verdict.
   */
  readonly loadedScopes?: ReadonlySet<string>
  /**
   * Values behind each `closed-enum` constraint id. Injected rather than baked
   * into the registry so the builder stays plain ESM. An id the caller did not
   * supply is unresolvable, not empty — the entry's fail direction decides.
   */
  readonly closedVocabularies?: Readonly<Partial<Record<ClosedVocabularyId, readonly string[]>>>
  readonly caps?: ValidationCaps
}
