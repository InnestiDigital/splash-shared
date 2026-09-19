// shared/features/cms/editableSurface/validateAddress.ts
//
// The synchronous pure half of the validation kernel (Editing Surface v2, D4).
//
// Covers everything derivable from schema + vocabulary + geometry: shape, type,
// enum membership, declared setting ids, geometry bounds, colour-role names,
// path-safety patterns, batch and payload caps.
//
// It does NOT cover media-id existence, layered-slot legality against live
// section rows, `allowedBlocks`, RBAC or site access. Those need a DB or fs read
// and live in the declared async server tier. The split is structural, not lazy:
// media existence pulls fs code that must never reach the admin bundle,
// unflushed inspector autosaves change what "current settings" even means, and
// loaded-state races are session-local. "One kernel" that pretended to cover
// them would be two kernels with shared cosmetics.
//
// Never fetches. Imports no fs, no DOM, no Vue, no Pinia. Everything it looks at
// arrives in `ValidationContext`.
import { isCanvasBlockGeometry } from '~/shared/types/placement'
import { BRAND_CANVAS_PAGE_TYPE } from '~/shared/types/brandCanvas'
import { indexByAddress, editableAddress, scopeKey } from '~/shared/features/cms/editableSurface.mjs'
import type {
  CapabilityFlag,
  ConditionKind,
  Constraint,
  EditableAddress,
  EditableSurfaceEntry,
  EditableSurfaceRegistry,
  Principal,
  ValidationCaps,
  ValidationContext,
  ValidationIssue,
} from '~/shared/features/cms/editableSurface/types'

/**
 * Path segments that reach `Object.prototype` through a deep set. Ported
 * VERBATIM from the guard in
 * `server/api/admin/s/[siteId]/pages/[pageId]/blocks/[blockId].put.ts:68`,
 * which that endpoint now calls instead of restating.
 */
export const FORBIDDEN_PATH_RE = /(?:^|\.)(__proto__|constructor|prototype)(?:\.|$|\[)/

/**
 * An array index large enough that materialising it is the attack. Ported
 * verbatim from the same endpoint (`[blockId].put.ts:73`).
 */
export const LARGE_INDEX_RE = /\[(\d{5,})\]/

/** Mirrors the protocol's own caps; a caller may pass its own. */
export const DEFAULT_CAPS: ValidationCaps = { maxOpsPerBatch: 20, maxSettingsKeys: 40 }

/** Which capability flags each principal may write. One map, not two sets. */
const WRITABLE_BY: Readonly<Record<Principal, ReadonlySet<CapabilityFlag>>> = {
  agent: new Set<CapabilityFlag>(['agent-writable']),
  author: new Set<CapabilityFlag>(['agent-writable', 'author-only']),
  migration: new Set<CapabilityFlag>(['agent-writable', 'author-only', 'migration-only']),
}

/**
 * Only the FIRST segment of a field path is schema-checkable: nesting below a
 * declared id is field-shaped and no schema describes it (applyEditorOp.ts:82-90).
 * Empty when the path starts with a separator, which names no setting.
 */
export function rootSegment(fieldPath: string): string {
  return fieldPath.split(/[.[]/, 1)[0] ?? ''
}

/**
 * Path safety alone, for callers that hold a raw `fieldPath` and no address —
 * the block PUT endpoint runs exactly this before it knows which block it is
 * writing.
 */
export function validateFieldPathSafety(fieldPath: string, address = '(unknown)'): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (FORBIDDEN_PATH_RE.test(fieldPath)) {
    issues.push({
      kind: 'forbidden-path',
      severity: 'error',
      address,
      path: fieldPath,
      message: 'Invalid fieldPath',
    })
  }
  if (LARGE_INDEX_RE.test(fieldPath)) {
    issues.push({
      kind: 'oversized-index',
      severity: 'error',
      address,
      path: fieldPath,
      message: 'Invalid fieldPath',
    })
  }
  return issues
}

/**
 * Canvas geometry alone, for the same reason as above.
 *
 * Delegates to `isCanvasBlockGeometry` rather than re-deriving the bounds, so
 * the kernel and the snapshot-ingestion / preview-postMessage guard cannot
 * disagree about what a legal placement is.
 */
export function validateCanvasGeometry(value: unknown, address = '(unknown)'): ValidationIssue[] {
  return isCanvasBlockGeometry(value)
    ? []
    : [{
        kind: 'geometry-violation',
        severity: 'error',
        address,
        path: 'placement.canvas',
        message: 'Invalid canvas block geometry',
      }]
}

/**
 * Batch and payload caps. Separate from `validate` because they are properties
 * of a BATCH, not of any one address.
 */
export function validateCaps(
  input: { readonly opCount?: number, readonly settingsKeyCounts?: readonly number[] },
  caps: ValidationCaps = DEFAULT_CAPS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (input.opCount !== undefined && input.opCount > caps.maxOpsPerBatch) {
    issues.push({
      kind: 'batch-cap-exceeded',
      severity: 'error',
      address: '(batch)',
      path: '',
      message: `at most ${caps.maxOpsPerBatch} ops per batch (got ${input.opCount})`,
    })
  }
  for (const count of input.settingsKeyCounts ?? []) {
    if (count <= caps.maxSettingsKeys) continue
    issues.push({
      kind: 'payload-cap-exceeded',
      severity: 'error',
      address: '(batch)',
      path: '',
      message: `at most ${caps.maxSettingsKeys} settings keys per op (got ${count})`,
    })
  }
  return issues
}

/**
 * The kernel. Synchronous, pure, total: same inputs, same issues, no throw for
 * an input it cannot classify — an unclassifiable input is an issue, because a
 * throw is a verdict the caller cannot put in a preflight response.
 *
 * An EMPTY result means "nothing derivable from schema and vocabulary refuses
 * this". It never means the commit will land: media existence, version pinning
 * and concurrent edits all sit past this function (D4).
 */
export function validate(
  address: EditableAddress,
  value: unknown,
  context: ValidationContext,
): ValidationIssue[] {
  const canonical = editableAddress(address.entity, scopeKey(address.scope), address.path)

  const pathIssues = validateFieldPathSafety(address.path, canonical)
  // A path that reaches Object.prototype is refused before anything looks it up:
  // the lookup itself would be the exploit's first hop.
  if (pathIssues.length > 0) return pathIssues

  const entry = findEntry(context.registry, address)
  if (!entry) return [missingAddressIssue(address, canonical, context)]

  const issues: ValidationIssue[] = []

  const capability = resolveCapability(entry, context, issues, canonical)
  if (!WRITABLE_BY[context.principal].has(capability)) {
    issues.push({
      kind: 'not-writable',
      severity: 'error',
      address: canonical,
      path: address.path,
      message: `${canonical} is ${capability}; ${context.principal} may not write it`,
    })
    // The value is irrelevant once the write is refused, and reporting a second
    // reason invites a retry that fixes the wrong one.
    return issues
  }

  if (entry.degraded) {
    issues.push({
      kind: 'degraded-vocabulary',
      severity: 'warning',
      address: canonical,
      path: address.path,
      message: entry.degraded.detail,
    })
  }

  issues.push(...validateValue(entry, canonical, value, context))
  return issues
}

/**
 * Address index per registry. Memoized because a preflight validates a whole
 * batch against one registry and rebuilding a ~1500-entry Map per op is work
 * the kernel's purity does not require it to repeat.
 */
const indexCache = new WeakMap<EditableSurfaceRegistry, Map<string, EditableSurfaceEntry>>()

function addressIndex(registry: EditableSurfaceRegistry): Map<string, EditableSurfaceEntry> {
  let index = indexCache.get(registry)
  if (!index) {
    index = indexByAddress(registry)
    indexCache.set(registry, index)
  }
  return index
}

/**
 * Entry lookup. Falls back from the scoped address to the entity-wide one:
 * section presentation fields are declared once for every section type, while
 * `layoutConfig.*` is declared per type.
 *
 * Exported so server-only callers (section-write policy, the async validation
 * tier) can ask "does this address even have an entry, and what capability
 * does it carry" without re-deriving the scoped/entity-wide fallback rule a
 * second time.
 */
export function findEntry(
  registry: EditableSurfaceRegistry,
  address: EditableAddress,
): EditableSurfaceEntry | undefined {
  const index = addressIndex(registry)
  const scoped = index.get(editableAddress(address.entity, scopeKey(address.scope), address.path))
  if (scoped) return scoped
  return index.get(editableAddress(address.entity, '*', address.path))
}

/**
 * The verdict for an address with no entry, per the class's declared fail
 * direction (D3). Fail-open reports a warning — a block whose schema is missing
 * must not make every field write fail — fail-closed reports an error.
 */
function missingAddressIssue(
  address: EditableAddress,
  canonical: string,
  context: ValidationContext,
): ValidationIssue {
  const direction = context.registry.missingAddressFailDirection[address.entity]
  const scope = scopeKey(address.scope)
  const scopeIsLoaded = context.loadedScopes?.has(scope) ?? false

  // A scope the caller DID load is a different claim: the schema was readable
  // and does not declare this id, which is an error even where the class fails
  // open. That is the `set_block_field` declared-id check, exactly.
  const severity = direction === 'fail-open' && !scopeIsLoaded ? 'warning' : 'error'

  return {
    kind: 'unknown-address',
    severity,
    address: canonical,
    path: address.path,
    message: severity === 'warning'
      ? `no registry entry for ${canonical}; the schema for "${scope}" was not loaded, so this is unverified`
      : `"${rootSegment(address.path) || address.path}" is not a declared address of ${scope}`,
  }
}

/**
 * A condition's answer, with "the caller did not supply what it takes to know"
 * kept DISTINCT from "no". Collapsing the two is what would make an any-of over
 * an unknown route and a false route report a confident refusal.
 */
type ConditionVerdict = 'holds' | 'fails' | 'unevaluable'

/** Why one condition could not be evaluated, for the `conditional-unmet` warning. */
const UNEVALUABLE_REASON: Readonly<Record<ConditionKind, string>> = {
  'section-type-has-layered-slot': 'the enclosing section type is unknown, so layered-slot '
    + 'legality could not be evaluated',
  'page-is-brand-canvas': 'the page type is unknown, so brand-canvas legality could not be '
    + 'evaluated',
}

/**
 * One ATOMIC condition against the injected facts. Exhaustive over
 * `ConditionKind` with a `never` default: adding a kind stops the build here
 * until someone says how to answer it.
 */
function evaluateCondition(kind: ConditionKind, context: ValidationContext): ConditionVerdict {
  switch (kind) {
    case 'section-type-has-layered-slot': {
      if (!context.layeredSectionTypes || context.sectionType === undefined) return 'unevaluable'
      return context.layeredSectionTypes.has(context.sectionType) ? 'holds' : 'fails'
    }
    case 'page-is-brand-canvas': {
      // `null` is a page that carries no type — evaluable, and not a brand
      // canvas. Only `undefined` means the caller did not look.
      if (context.pageType === undefined) return 'unevaluable'
      return context.pageType === BRAND_CANVAS_PAGE_TYPE ? 'holds' : 'fails'
    }
    default: {
      const exhaustive: never = kind
      throw new Error(`unhandled condition kind: ${String(exhaustive)}`)
    }
  }
}

/**
 * Resolve a conditional capability against the injected catalog facts.
 *
 * `when` is an ANY-OF: one route holding is enough, which is what lets
 * `placement.canvas` model both halves of `canvasPlacementAllowed` — a layered
 * slot on an ordinary page, or a brand-canvas page regardless of section type.
 *
 * The three-way outcome is deliberate. If no route holds but some route could
 * not be evaluated, the entry's BASE capability applies and a warning says so —
 * the base of every conditional entry shipped today is `never`, so an unknowable
 * route refuses rather than permits. `otherwise` is reached only when every
 * route was genuinely answered and every answer was no.
 */
function resolveCapability(
  entry: EditableSurfaceEntry,
  context: ValidationContext,
  issues: ValidationIssue[],
  canonical: string,
): CapabilityFlag {
  const conditional = entry.conditional
  if (!conditional) return entry.capability

  const unevaluable: ConditionKind[] = []
  for (const kind of conditional.when) {
    const verdict = evaluateCondition(kind, context)
    if (verdict === 'holds') return conditional.capability
    if (verdict === 'unevaluable') unevaluable.push(kind)
  }

  if (unevaluable.length === 0) return conditional.otherwise

  issues.push({
    kind: 'conditional-unmet',
    severity: 'warning',
    address: canonical,
    path: entry.path,
    message: `${unevaluable.map(kind => UNEVALUABLE_REASON[kind]).join('; ')}; falling back to `
      + 'the entry\'s base capability',
  })
  return entry.capability
}

function validateValue(
  entry: EditableSurfaceEntry,
  canonical: string,
  value: unknown,
  context: ValidationContext,
): ValidationIssue[] {
  const constraint: Constraint = entry.constraint
  const issue = (kind: ValidationIssue['kind'], message: string): ValidationIssue[] => [{
    kind,
    severity: 'error',
    address: canonical,
    path: entry.path,
    message,
  }]

  switch (constraint.kind) {
    case 'closed-enum': {
      const values = context.closedVocabularies?.[constraint.vocabularyId]
      if (!values) {
        // The vocabulary is a `shared/` constant the caller did not inject.
        // Unresolvable is not empty — treat it as the entry's fail direction.
        return entry.failDirection === 'fail-open'
          ? [{
              kind: 'enum-violation',
              severity: 'warning',
              address: canonical,
              path: entry.path,
              message: `vocabulary "${constraint.vocabularyId}" was not supplied, so the value is unverified`,
            }]
          : issue('enum-violation', `vocabulary "${constraint.vocabularyId}" was not supplied`)
      }
      if (typeof value !== 'string' || !values.includes(value)) {
        const kind = constraint.vocabularyId === 'color-roles' ? 'color-role-unknown' : 'enum-violation'
        return issue(kind, `${describe(value)} is not one of: ${values.join(', ')}`)
      }
      return []
    }

    case 'theme-set':
    case 'schema-options': {
      // `null` clears a nullable column back to the theme default. Checked
      // before the empty-vocabulary guard: "inherit the default" stays legal on
      // a theme that declares no presets to name.
      if (value === null && constraint.kind === 'theme-set' && constraint.nullable) return []
      if (constraint.values.length === 0) {
        return entry.failDirection === 'fail-open'
          ? []
          : issue('enum-violation', 'this address declares no legal values')
      }
      return typeof value === 'string' && constraint.values.includes(value)
        ? []
        : issue('enum-violation', `${describe(value)} is not one of: ${constraint.values.join(', ')}`)
    }

    case 'primitive':
      return validatePrimitive(constraint.primitive, value)
        ? []
        : issue('type-violation', `expected ${constraint.primitive}, got ${describe(value)}`)

    case 'geometry':
      return validateCanvasGeometry(value, canonical).map(found => ({ ...found, path: entry.path }))

    case 'media-ref': {
      // Existence is the async tier's job. What is derivable here is shape:
      // a gallery holds a LIST, and writing one reference at its root replaces
      // every image in it with a bare string the renderer cannot iterate.
      if (constraint.list && !Array.isArray(value)) {
        return issue('type-violation', `${entry.path} is a gallery and holds a list — attach to one index`)
      }
      if (!constraint.list && typeof value !== 'string') {
        return issue('type-violation', `expected a media ${constraint.valueMode}, got ${describe(value)}`)
      }
      return []
    }

    case 'site-data':
      // The legal values are rows in `${joinKey}`, which only a request-time
      // join knows. Shape is all this tier can claim.
      return value === null || typeof value === 'object' || typeof value === 'string'
        ? []
        : issue('type-violation', `expected per-site ${constraint.joinKey} data, got ${describe(value)}`)

    case 'opaque':
      return []

    default: {
      const exhaustive: never = constraint
      throw new Error(`unhandled constraint kind: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function validatePrimitive(primitive: string, value: unknown): boolean {
  switch (primitive) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    case 'array': return Array.isArray(value)
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value)
    default: return false
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'string') return `"${value}"`
  return typeof value
}
