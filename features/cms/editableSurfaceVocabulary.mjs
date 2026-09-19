// Runtime vocabulary of the editable-surface registry.
//
// Split out of `editableSurface/types.ts` because three consumers need the
// VALUES, not just the types: the builder, the plain-Node drift gate, and the
// tests. A `.ts` module is unreachable from the gate — the same constraint that
// makes `settingsFragments.mjs` plain ESM.
//
// Each tuple carries a JSDoc `@type` annotation spelling the same literals. That
// is checked duplication, not silent duplication: TypeScript compares the array
// literal against the annotation, so the two cannot disagree without a compile
// error. `types.ts` derives its unions from these, so there is one place to add
// a value.

/**
 * `layout` is the site-global header/footer chrome, stored in `navigation_layouts`
 * and written by `update_layout_settings` — a different ROW from the block of the
 * same schema, which is why it is its own class rather than a block scope.
 *
 * @type {readonly ['block', 'section', 'page', 'theme', 'typography', 'layout']}
 */
export const ENTITY_CLASSES = Object.freeze([
  'block', 'section', 'page', 'theme', 'typography', 'layout',
])

/** @type {readonly ['agent-writable', 'author-only', 'migration-only', 'never']} */
export const CAPABILITY_FLAGS = Object.freeze([
  'agent-writable',
  'author-only',
  'migration-only',
  'never',
])

/** @type {readonly ['fail-open', 'fail-closed']} */
export const FAIL_DIRECTIONS = Object.freeze(['fail-open', 'fail-closed'])

/** @type {readonly ['agent', 'author', 'migration']} */
export const PRINCIPALS = Object.freeze(['agent', 'author', 'migration'])

/**
 * `section-container-modes` and `layout-spacing-tiers` are ENGINE vocabularies:
 * one width formula per mode in `containerModeWidth()`, one custom property per
 * tier in `frameTokens.scss`. A theme cannot add a value to either without a
 * `shared/` diff, which is what makes them closed rather than `theme-set`.
 *
 * @type {readonly [
 *   'color-roles', 'section-color-schemes',
 *   'section-container-modes', 'layout-spacing-tiers', 'section-roles',
 * ]}
 */
export const CLOSED_VOCABULARY_IDS = Object.freeze([
  'color-roles',
  'section-color-schemes',
  'section-container-modes',
  'layout-spacing-tiers',
  'section-roles',
])

/**
 * ATOMIC conditions. A `ConditionalCapability.when` is a non-empty list of these
 * read as ANY-OF, so a predicate with two independent routes is composed from
 * two kinds rather than encoded as a third kind naming the disjunction — the
 * latter is how `canvasPlacementAllowed`'s two routes would become unsplittable
 * the moment a third entry needs only one of them.
 *
 * @type {readonly ['section-type-has-layered-slot', 'page-is-brand-canvas']}
 */
export const CONDITION_KINDS = Object.freeze([
  'section-type-has-layered-slot',
  'page-is-brand-canvas',
])

/**
 * Constraint SPECIES. Not a type union with a mode field — a closed enum
 * compiled into `shared/` and an open set derived from files on disk are
 * different things, and collapsing them is what makes a registry lie about
 * which one it is describing (D2).
 *
 * @type {readonly [
 *   'closed-enum', 'theme-set', 'schema-options', 'primitive',
 *   'geometry', 'media-ref', 'site-data', 'opaque',
 * ]}
 */
export const CONSTRAINT_KINDS = Object.freeze([
  'closed-enum',
  'theme-set',
  'schema-options',
  'primitive',
  'geometry',
  'media-ref',
  'site-data',
  'opaque',
])
