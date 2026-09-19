// Filesystem input for the editable-surface registry.
//
// The `node:fs` half of the dual-load described in D2: the client feeds
// `buildEditableSurface` from eager `import.meta.glob`, this module feeds it
// from disk. Plain ESM so the server loader (TypeScript) and the plain-Node
// drift gate run the SAME reader — a mirrored fs walk in the gate would drift
// from the one the server actually uses, which is the whole failure this
// program removes.
//
// Reading discipline is deliberately the one `sectionTypeCatalog.ts` already
// uses: an unreadable file is loud and skipped, never fatal, so one malformed
// schema cannot retire a theme.

import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { buildEditableSurface } from './editableSurface.mjs'

const SETTINGS_SUFFIX = '.settings.json'
const LAYOUT_SUFFIX = '.v2.json'

/**
 * Themes on disk, in sorted order. A directory counts as a theme when it
 * carries a `theme.json`, matching `generate-target-registry.mjs`.
 *
 * @param {string} rootDir Repository root.
 * @returns {Promise<string[]>}
 */
export async function discoverThemes(rootDir) {
  const themesDir = join(rootDir, 'themes')
  let entries
  try {
    entries = await readdir(themesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const themes = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (await readJson(join(themesDir, entry.name, 'theme.json')) !== null) themes.push(entry.name)
  }
  return themes.sort()
}

/**
 * Resolve a theme directory, refusing anything that escapes the themes root.
 * `theme` reaches the server from a site row, so a traversal would need a
 * compromised write path — but the guard is one comparison and the blast radius
 * without it is arbitrary file reads (sectionTypeCatalog.ts:60-66).
 *
 * @param {string} rootDir
 * @param {string} theme
 * @returns {string | null}
 */
export function themeDir(rootDir, theme) {
  const themesRoot = resolve(rootDir, 'themes')
  const themeRoot = resolve(themesRoot, theme)
  const themeRelative = relative(themesRoot, themeRoot)
  if (!themeRelative || themeRelative.startsWith('..') || isAbsolute(themeRelative)) return null
  return themeRoot
}

/**
 * Assemble one theme's builder input from disk.
 *
 * @param {string} rootDir Repository root.
 * @param {string} theme
 * @returns {Promise<import('./editableSurface.mjs').EditableSurfaceInput>}
 */
export async function loadEditableSurfaceInput(rootDir, theme) {
  const dir = themeDir(rootDir, theme)
  if (!dir) {
    return { theme, fragments: {}, blockSchemas: [], sectionTypeSchemas: [], sectionLayoutSchemas: [] }
  }

  const [fragments, blockSchemas, sectionFiles, sharedSchemas, themeManifest] = await Promise.all([
    loadFragments(dir, theme),
    loadSchemasIn(join(dir, 'components'), SETTINGS_SUFFIX, `themes/${theme}/components`, true),
    loadSectionFiles(join(dir, 'section-types'), `themes/${theme}/section-types`),
    loadSchemasIn(join(rootDir, 'shared', 'components'), SETTINGS_SUFFIX, 'shared/components', false),
    readJson(join(dir, 'theme.json')),
  ])

  // Theme schemas override shared ones on the same block type, exactly as
  // `mergeSchemas` does client-side.
  const byType = new Map()
  for (const loaded of [...sharedSchemas, ...blockSchemas]) {
    if (typeof loaded.schema?.type === 'string') byType.set(loaded.schema.type, loaded)
  }

  return {
    theme,
    fragments,
    blockSchemas: [...byType.values()].sort(compareBySource),
    sectionTypeSchemas: sectionFiles.settings,
    sectionLayoutSchemas: sectionFiles.layouts,
    ...(themeManifest ? { themeManifest } : {}),
  }
}

/**
 * Build one theme's registry from disk.
 *
 * @param {string} rootDir
 * @param {string} theme
 * @returns {Promise<import('./editableSurface/types').EditableSurfaceRegistry>}
 */
export async function loadEditableSurfaceFromDisk(rootDir, theme) {
  return buildEditableSurface(await loadEditableSurfaceInput(rootDir, theme))
}

/**
 * @param {string} dir
 * @param {string} theme
 * @returns {Promise<Record<string, any>>}
 */
async function loadFragments(dir, theme) {
  const fragmentsDir = join(dir, 'settings-fragments')
  let names
  try {
    names = await readdir(fragmentsDir)
  } catch {
    return {}
  }
  /** @type {Record<string, any>} */
  const out = {}
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue
    const fragment = await readJson(join(fragmentsDir, name))
    if (!fragment) continue
    const fileId = name.slice(0, -'.json'.length)
    const id = typeof fragment.id === 'string' ? fragment.id : fileId
    if (id !== fileId) {
      console.error(
        `[editableSurfaceFs] Ignoring "${theme}/settings-fragments/${name}": `
        + `its id "${id}" does not match the filename`,
      )
      continue
    }
    out[id] = fragment
  }
  return out
}

/**
 * @param {string} dir
 * @param {string} suffix
 * @param {string} sourcePrefix Repo-relative prefix used in the `source` field.
 * @param {boolean} recurse
 * @returns {Promise<Array<{ source: string, schema: any }>>}
 */
async function loadSchemasIn(dir, suffix, sourcePrefix, recurse) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recurse && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        out.push(...await loadSchemasIn(full, suffix, `${sourcePrefix}/${entry.name}`, true))
      }
      continue
    }
    if (!entry.name.endsWith(suffix)) continue
    const schema = await readJson(full)
    if (schema) out.push({ source: `${sourcePrefix}/${entry.name}`, schema })
  }
  return out
}

/**
 * @param {string} dir
 * @param {string} sourcePrefix
 * @returns {Promise<{ settings: any[], layouts: any[] }>}
 */
async function loadSectionFiles(dir, sourcePrefix) {
  const [settings, layouts] = await Promise.all([
    loadSchemasIn(dir, SETTINGS_SUFFIX, sourcePrefix, false),
    loadSchemasIn(dir, LAYOUT_SUFFIX, sourcePrefix, false),
  ])
  return { settings, layouts }
}

/**
 * @param {{ source: string }} a
 * @param {{ source: string }} b
 */
function compareBySource(a, b) {
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0
}

/**
 * @param {string} path
 * @returns {Promise<any | null>}
 */
async function readJson(path) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error(`[editableSurfaceFs] Unreadable JSON "${path}":`, error)
    return null
  }
}
