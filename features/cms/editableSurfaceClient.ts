// shared/features/cms/editableSurfaceClient.ts
//
// The bundler half of the dual-load described in D2: eager `import.meta.glob`
// feeds the same `buildEditableSurface` the server feeds from `node:fs`.
//
// ⚠️ Import from ADMIN code only. The globs below are the RAW schemas — the
// public renderer must not pull the settings vocabulary into its entry chunk
// (`blockSchemasAuthoring.ts` states the same constraint for the same reason).
// Vite dedupes these modules against that loader's globs, so this file adds no
// bytes beyond the registry it builds.
import { buildEditableSurface } from '~/shared/features/cms/editableSurface.mjs'
import { getSettingsFragments } from '~/shared/features/cms/themeData'
import type { EditableSurfaceRegistry } from '~/shared/features/cms/editableSurface/types'

// RAW — fragments deliberately NOT applied here. The builder needs the
// unmerged schema to tell fragment-owned vocabulary from block-owned overrides;
// `applyFragments` returns a flat array in which the two are indistinguishable.
const blockSettingsFiles = import.meta.glob<Record<string, unknown>>(
  '/themes/*/components/**/*.settings.json',
  { eager: true, import: 'default' },
)

const sharedSettingsFiles = import.meta.glob<Record<string, unknown>>(
  '/shared/components/*.settings.json',
  { eager: true, import: 'default' },
)

const sectionSettingsFiles = import.meta.glob<Record<string, unknown>>(
  '/themes/*/section-types/*.settings.json',
  { eager: true, import: 'default' },
)

const sectionLayoutFiles = import.meta.glob<Record<string, unknown>>(
  '/themes/*/section-types/*.v2.json',
  { eager: true, import: 'default' },
)

const themeManifests = import.meta.glob<Record<string, unknown>>(
  '/themes/*/theme.json',
  { eager: true, import: 'default' },
)

const THEME_PATH_RE = /^\/themes\/([^/]+)\//

function themeNameFromPath(path: string): string | null {
  return path.match(THEME_PATH_RE)?.[1] ?? null
}

/**
 * Glob paths are absolute-from-root (`/themes/…`); the fs loader reports
 * repo-relative sources (`themes/…`). Entries carry the source, and the parity
 * test compares the two registries — so the two loaders must spell it the same.
 */
function repoRelative(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path
}

function collect(
  files: Record<string, Record<string, unknown>>,
  theme: string | null,
): { source: string, schema: Record<string, unknown> }[] {
  return Object.entries(files)
    .filter(([path]) => theme === null || themeNameFromPath(path) === theme)
    .map(([path, schema]) => ({ source: repoRelative(path), schema }))
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
}

// Memoized per theme: the registry is derived from module-scope constants, so
// two calls for the same theme can only produce the same object.
const cache = new Map<string, EditableSurfaceRegistry>()

export function getEditableSurface(theme: string): EditableSurfaceRegistry {
  const cached = cache.get(theme)
  if (cached) return cached

  // Theme schemas override shared ones on the same block type, exactly as
  // `mergeSchemas` does — and exactly as the fs loader does.
  const byType = new Map<string, { source: string, schema: Record<string, unknown> }>()
  for (const loaded of [...collect(sharedSettingsFiles, null), ...collect(blockSettingsFiles, theme)]) {
    const type = loaded.schema.type
    if (typeof type === 'string') byType.set(type, loaded)
  }

  const manifestEntry = Object.entries(themeManifests)
    .find(([path]) => themeNameFromPath(path) === theme)

  const registry = buildEditableSurface({
    theme,
    fragments: getSettingsFragments(theme),
    blockSchemas: [...byType.values()].sort((a, b) => (a.source < b.source ? -1 : 1)),
    sectionTypeSchemas: collect(sectionSettingsFiles, theme),
    sectionLayoutSchemas: collect(sectionLayoutFiles, theme),
    ...(manifestEntry ? { themeManifest: manifestEntry[1] } : {}),
  })

  cache.set(theme, registry)
  return registry
}
