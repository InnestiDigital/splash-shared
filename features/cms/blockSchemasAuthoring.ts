import type { BlockSchema } from '~/shared/types/theme'
import { AVAILABLE_THEMES, isKnownTheme, getSettingsFragments } from '~/shared/features/cms/themeData'
import { applyFragments } from '~/shared/features/cms/settingsFragments.mjs'

// FULL block schemas, including every authoring-only key (labels, help text,
// groups, presets). ~365 KB of JSON, eagerly bundled.
//
// ⚠️ Import this from ADMIN code only. It used to live in `themeData.ts`, which
// the public renderer imports for `getThemeConfig()` — so every visitor
// downloaded the whole settings-panel vocabulary in the entry chunk. The public
// renderer now uses the generated slim bundle in `blockSchemasRuntime.ts`;
// keeping these two globs in a separate module is what keeps them out of the
// public chunk.

// Theme-specific block schemas — keyed by path, e.g.
// "/themes/standalone/components/HeroBlock.settings.json".
const themeSettingsFiles = import.meta.glob<BlockSchema>(
  '/themes/*/components/**/*.settings.json',
  { eager: true, import: 'default' },
)

// Shared block schemas (theme-agnostic) — keyed by path, e.g.
// "/shared/components/FormField.settings.json".
const sharedSettingsFiles = import.meta.glob<BlockSchema>(
  '/shared/components/*.settings.json',
  { eager: true, import: 'default' },
)

const THEME_PATH_RE = /^\/themes\/([^/]+)\//

function themeNameFromPath(path: string): string | null {
  const m = path.match(THEME_PATH_RE)
  return m?.[1] ?? null
}

const sharedSchemas: Record<string, BlockSchema> = (() => {
  const out: Record<string, BlockSchema> = {}
  for (const schema of Object.values(sharedSettingsFiles)) {
    if (schema?.type) out[schema.type] = schema
  }
  return out
})()

const themeSchemas: Record<string, Record<string, BlockSchema>> = (() => {
  const out: Record<string, Record<string, BlockSchema>> = {}
  for (const [path, schema] of Object.entries(themeSettingsFiles)) {
    const themeName = themeNameFromPath(path)
    if (!themeName || !schema?.type) continue
    if (!out[themeName]) out[themeName] = {}
    out[themeName][schema.type] = applyFragments(schema, getSettingsFragments(themeName), path)
  }
  return out
})()

/**
 * Shared schemas belong to no theme, so their `$fragments` can only resolve
 * against the theme they are being merged into — hence per theme, not at load.
 */
function resolveSharedSchemas(theme: string): Record<string, BlockSchema> {
  const fragments = getSettingsFragments(theme)
  const out: Record<string, BlockSchema> = {}
  for (const [type, schema] of Object.entries(sharedSchemas)) {
    out[type] = applyFragments(schema, fragments, `shared/components/${type}.settings.json`)
  }
  return out
}

/**
 * Merge two block-schema maps. Theme entries override shared entries on the
 * same key. Returns a fresh object — does not mutate inputs.
 */
export function mergeSchemas(
  shared: Record<string, BlockSchema>,
  theme: Record<string, BlockSchema>,
): Record<string, BlockSchema> {
  return { ...shared, ...theme }
}

// Memoized per theme: `getBlockSchemas` is called inside render paths, and the
// merge allocated a fresh 80-key object on every call.
const mergedByTheme = new Map<string, Record<string, BlockSchema>>()

export function getBlockSchemas(theme: string): Record<string, BlockSchema> {
  if (!isKnownTheme(theme)) {
    throw new Error(
      `[getBlockSchemas] Unknown theme "${theme}". Available themes: ${AVAILABLE_THEMES.join(', ')}`,
    )
  }
  let merged = mergedByTheme.get(theme)
  if (!merged) {
    merged = mergeSchemas(resolveSharedSchemas(theme), themeSchemas[theme] ?? {})
    mergedByTheme.set(theme, merged)
  }
  return merged
}
