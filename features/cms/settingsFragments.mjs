// Settings fragments — one vocabulary, three loaders.
//
// A `*.settings.json` (or a `theme.json` template `settingsSchema` owner) may
// declare `"$fragments": ["media-side"]`. The fragment file lives at
// `themes/<theme>/settings-fragments/<id>.json` and owns the canonical setting
// ids, option vocabulary, group and `showIf`s for that concern, so two blocks
// can never drift into two spellings of the same control.
//
// Plain ESM on purpose: the three loaders that must agree on the merge are the
// admin glob loader (`blockSchemasAuthoring.ts`), the server filesystem loader
// (`server/services/theme/themeDiscovery.ts`) and the plain-Node generator
// (`scripts/generate-block-registry.mjs`). A `.ts` module is unreachable from
// the last one, and mirroring the merge there is exactly the drift this
// mechanism exists to prevent.

/**
 * @typedef {{ id: string, settings: any[], groups?: any[] }} SettingsFragment
 */

/** Thrown when a schema references an unknown fragment or shadows a fragment id. */
export class SettingsFragmentError extends Error {
  /**
   * @param {string} message
   * @param {string} source Repo-relative path (or theme/template id) of the offending schema.
   */
  constructor(message, source) {
    super(`[settings-fragments] ${source}: ${message}`)
    this.name = 'SettingsFragmentError'
    /** @readonly */
    this.source = source
  }
}

/**
 * Setting ids owned by the given fragments, keyed by owning fragment id.
 * @param {Record<string, SettingsFragment>} fragments
 * @returns {Map<string, string>} setting id -> fragment id
 */
export function fragmentOwnedIds(fragments) {
  /** @type {Map<string, string>} */
  const owned = new Map()
  for (const [fragmentId, fragment] of Object.entries(fragments)) {
    for (const setting of fragment?.settings ?? []) {
      if (typeof setting?.id === 'string') owned.set(setting.id, fragmentId)
    }
  }
  return owned
}

/**
 * Resolve a schema's `$fragments` declaration.
 *
 * Merge semantics:
 * - fragment settings are prepended, in declaration order, so they come first
 *   inside their group;
 * - a local setting may not redeclare an id owned by a fragment the schema
 *   declared (that is the drift the fragment prevents). Ids owned by fragments
 *   the schema did NOT declare are a build-time concern, not a load-time one:
 *   the generator's vocabulary lint reports them with an allowlist for the
 *   pre-fragment schemas still being burned down;
 * - `"$fragmentOverrides": { "<settingId>": { ... } }` shallow-merges onto a
 *   fragment setting. It exists for what is legitimately per-block on a
 *   canonical control — when it applies (`showIf`), what a fresh block starts
 *   as (`default`), how it is worded (`label`, `note`), where its authored
 *   value came from (`migratedFrom`) and which options this block cannot
 *   render (`omitOptions`). Every other key, `id` / `type` / `options`
 *   included, is refused: that is the drift the fragment prevents;
 * - `"$fragmentOmit": ["gapMobile"]` drops a fragment setting entirely, for an
 *   adopter that has no rendering for that concern at all (a grid whose SCSS
 *   reads no gap variable). It is a capability declaration: the alternative is
 *   an inert control, and the dead-setting lint refuses that anyway;
 * - fragment `groups` entries are appended for group ids the schema lacks;
 * - `$fragments` is stripped from the result.
 *
 * Returns the input untouched when it declares no fragments, so loaders can
 * call it unconditionally. Never mutates its arguments.
 *
 * @template {{ settings?: any[], groups?: any[], $fragments?: unknown }} T
 * @param {T} schema
 * @param {Record<string, SettingsFragment>} fragments All fragments of the owning theme.
 * @param {string} source Repo-relative path (or template id) for error messages.
 * @returns {T}
 */
export function applyFragments(schema, fragments, source) {
  const declared = schema?.$fragments
  if (declared === undefined) {
    if (schema?.$fragmentOverrides !== undefined) {
      throw new SettingsFragmentError(
        '"$fragmentOverrides" without "$fragments" — nothing to override',
        source,
      )
    }
    if (schema?.$fragmentOmit !== undefined) {
      throw new SettingsFragmentError(
        '"$fragmentOmit" without "$fragments" — nothing to omit',
        source,
      )
    }
    return schema
  }

  if (!Array.isArray(declared) || declared.some(id => typeof id !== 'string')) {
    throw new SettingsFragmentError('"$fragments" must be an array of fragment ids', source)
  }

  /** @type {any[]} */
  const fragmentSettings = []
  /** @type {any[]} */
  const fragmentGroups = []
  const seenFragments = new Set()

  for (const fragmentId of declared) {
    if (seenFragments.has(fragmentId)) {
      throw new SettingsFragmentError(`duplicate fragment "${fragmentId}"`, source)
    }
    seenFragments.add(fragmentId)

    const fragment = fragments[fragmentId]
    if (!fragment) {
      const available = Object.keys(fragments).sort().join(', ') || '(none)'
      throw new SettingsFragmentError(
        `unknown fragment "${fragmentId}". Available: ${available}`,
        source,
      )
    }
    fragmentSettings.push(...(fragment.settings ?? []))
    fragmentGroups.push(...(fragment.groups ?? []))
  }

  const localSettings = schema.settings ?? []
  const declaredOwnedIds = fragmentOwnedIds(pick(fragments, seenFragments))
  assertNoShadowing(localSettings, declaredOwnedIds, source)

  const kept = applyOmit(fragmentSettings, schema.$fragmentOmit, declaredOwnedIds, source)
  const overridden = applyOverrides(
    kept,
    schema.$fragmentOverrides,
    declaredOwnedIds,
    source,
  )

  const localGroupIds = new Set((schema.groups ?? []).map(g => g?.id))
  const addedGroups = []
  for (const group of fragmentGroups) {
    if (!group?.id || localGroupIds.has(group.id)) continue
    localGroupIds.add(group.id)
    addedGroups.push(group)
  }

  const {
    $fragments: _declared,
    $fragmentOverrides: _overrides,
    $fragmentOmit: _omitted,
    ...rest
  } = /** @type {any} */ (schema)
  return /** @type {T} */ ({
    ...rest,
    settings: [...overridden, ...localSettings],
    ...(schema.groups || addedGroups.length
      ? { groups: [...(schema.groups ?? []), ...addedGroups] }
      : {}),
  })
}

/**
 * @param {Record<string, SettingsFragment>} fragments
 * @param {Set<string>} ids
 * @returns {Record<string, SettingsFragment>}
 */
function pick(fragments, ids) {
  /** @type {Record<string, SettingsFragment>} */
  const out = {}
  for (const id of ids) {
    const fragment = fragments[id]
    if (fragment) out[id] = fragment
  }
  return out
}

/**
 * The only keys a `$fragmentOverrides` entry may carry. An allowlist, not a
 * blocklist: everything a fragment exists to keep identical across adopters
 * (`id`, `type`, the option vocabulary) has to stay unreachable even as
 * schema fields grow, and a per-block key nobody vetted is drift with a
 * friendlier spelling.
 *
 * - `default` / `showIf` — legitimately per-block: what a fresh block starts
 *   as, and when the control applies at all;
 * - `label` / `note` — the same decision worded for one block's vocabulary;
 * - `migratedFrom` — which legacy id this block's authored value came from;
 * - `omitOptions` — values this block physically cannot render (see below).
 */
const ALLOWED_OVERRIDE_KEYS = new Set([
  'default',
  'showIf',
  'label',
  'note',
  'migratedFrom',
  'omitOptions',
])

/**
 * Drop the fragment settings this adopter declares it cannot render.
 *
 * Unlike `omitOptions`, which narrows one control's vocabulary, this removes
 * the control: the block has no rendering for the concern at all, so the
 * honest schema is one without the field. It can only remove ids a declared
 * fragment owns, and it may not empty the fragment out — a schema that keeps
 * nothing should not declare the fragment.
 *
 * @param {any[]} fragmentSettings
 * @param {unknown} omit
 * @param {Map<string, string>} owned Setting ids owned by the DECLARED fragments.
 * @param {string} source
 * @returns {any[]}
 */
function applyOmit(fragmentSettings, omit, owned, source) {
  if (omit === undefined) return fragmentSettings

  if (!Array.isArray(omit) || omit.some(id => typeof id !== 'string')) {
    throw new SettingsFragmentError('"$fragmentOmit" must be an array of setting ids', source)
  }

  for (const settingId of omit) {
    if (!owned.has(settingId)) {
      throw new SettingsFragmentError(
        `"$fragmentOmit" names "${settingId}", which no declared fragment owns`,
        source,
      )
    }
  }

  const omitted = new Set(omit)
  const kept = fragmentSettings.filter(setting => !omitted.has(setting?.id))
  if (kept.length === 0) {
    throw new SettingsFragmentError(
      '"$fragmentOmit" omits every fragment setting — drop the "$fragments" declaration instead',
      source,
    )
  }
  return kept
}

/**
 * Shallow-merge `$fragmentOverrides` onto the fragment settings.
 *
 * `omitOptions` is the one key that rewrites a fragment field rather than
 * patching it: it filters the fragment's options down for an adopter that
 * cannot render them all (a two-column editorial has no "above"), which is
 * the alternative to shipping a control that lists choices doing nothing.
 * It can only ever remove, never add or re-spell, so the fragment still owns
 * the vocabulary — and it may not remove the value the block defaults to, nor
 * the last option standing.
 *
 * @param {any[]} fragmentSettings
 * @param {unknown} overrides
 * @param {Map<string, string>} owned Setting ids owned by the DECLARED fragments.
 * @param {string} source
 * @returns {any[]}
 */
function applyOverrides(fragmentSettings, overrides, owned, source) {
  if (overrides === undefined) return fragmentSettings

  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new SettingsFragmentError(
      '"$fragmentOverrides" must be an object keyed by setting id',
      source,
    )
  }

  const present = new Set(fragmentSettings.map(setting => setting?.id))

  for (const [settingId, patch] of Object.entries(overrides)) {
    if (!owned.has(settingId)) {
      throw new SettingsFragmentError(
        `"$fragmentOverrides" targets "${settingId}", which no declared fragment owns`,
        source,
      )
    }
    if (!present.has(settingId)) {
      throw new SettingsFragmentError(
        `"$fragmentOverrides" targets "${settingId}", which "$fragmentOmit" already removed`,
        source,
      )
    }
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new SettingsFragmentError(
        `"$fragmentOverrides.${settingId}" must be an object`,
        source,
      )
    }
    for (const key of Object.keys(patch)) {
      if (ALLOWED_OVERRIDE_KEYS.has(key)) continue
      throw new SettingsFragmentError(
        `"$fragmentOverrides.${settingId}" may not override "${key}" — `
        + `that is what fragment "${owned.get(settingId)}" owns. Allowed: `
        + `${[...ALLOWED_OVERRIDE_KEYS].join(', ')}`,
        source,
      )
    }
  }

  return fragmentSettings.map((setting) => {
    const patch = typeof setting?.id === 'string'
      ? /** @type {Record<string, any>} */ (overrides)[setting.id]
      : undefined
    if (!patch) return setting

    const { omitOptions, ...rest } = patch
    const merged = { ...setting, ...rest }
    return omitOptions === undefined
      ? merged
      : { ...merged, options: omitFragmentOptions(merged, omitOptions, source) }
  })
}

/**
 * Fragment options minus the ones this adopter cannot render.
 *
 * @param {any} setting Fragment setting with the rest of its patch already merged.
 * @param {unknown} omitOptions
 * @param {string} source
 * @returns {any[]}
 */
function omitFragmentOptions(setting, omitOptions, source) {
  const where = `"$fragmentOverrides.${setting.id}.omitOptions"`

  if (!Array.isArray(omitOptions) || omitOptions.some(value => typeof value !== 'string')) {
    throw new SettingsFragmentError(`${where} must be an array of option values`, source)
  }

  const options = Array.isArray(setting.options) ? setting.options : []
  const vocabulary = new Set(options.map(option => option?.value))

  for (const value of omitOptions) {
    if (!vocabulary.has(value)) {
      throw new SettingsFragmentError(
        `${where} omits "${value}", which is not one of the fragment's options `
        + `(${[...vocabulary].join(', ') || 'none'}) — omit only, never add or re-spell`,
        source,
      )
    }
  }

  const omitted = new Set(omitOptions)
  if (omitted.has(setting.default)) {
    throw new SettingsFragmentError(
      `${where} omits "${setting.default}", which is the value this block defaults to`,
      source,
    )
  }

  const kept = options.filter(option => !omitted.has(option?.value))
  if (kept.length === 0) {
    throw new SettingsFragmentError(`${where} omits every option`, source)
  }

  return kept
}

/**
 * @param {any[]} localSettings
 * @param {Map<string, string>} owned
 * @param {string} source
 */
function assertNoShadowing(localSettings, owned, source) {
  for (const setting of localSettings) {
    const fragmentId = typeof setting?.id === 'string' ? owned.get(setting.id) : undefined
    if (!fragmentId) continue
    throw new SettingsFragmentError(
      `setting "${setting.id}" is owned by declared fragment "${fragmentId}" — remove the local field`,
      source,
    )
  }
}

/**
 * Group fragment modules keyed by an absolute-ish path
 * (`/themes/<theme>/settings-fragments/<id>.json`) into `theme -> id -> fragment`.
 * Shared by the admin glob loader and the server/generator filesystem loaders.
 *
 * @param {Record<string, any>} byPath
 * @returns {Record<string, Record<string, SettingsFragment>>}
 */
export function groupFragmentsByTheme(byPath) {
  /** @type {Record<string, Record<string, SettingsFragment>>} */
  const out = {}
  for (const [path, fragment] of Object.entries(byPath)) {
    const match = path.match(/\/themes\/([^/]+)\/settings-fragments\/([^/]+)\.json$/)
    if (!match) continue
    const [, theme, fileId] = match
    const id = typeof fragment?.id === 'string' ? fragment.id : fileId
    if (id !== fileId) {
      throw new SettingsFragmentError(
        `fragment id "${id}" does not match its filename "${fileId}.json"`,
        path,
      )
    }
    ;(out[theme] ??= {})[id] = fragment
  }
  return out
}
