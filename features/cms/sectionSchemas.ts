// shared/features/cms/sectionSchemas.ts
//
// Section-type schema discovery. Mirrors the eager cross-theme glob already used
// for block schemas in themeData.ts: every `/themes/*/section-types/*.settings.json`
// is bundled at build time and grouped by theme, keyed by the schema's parsed
// `.type` field. Themes reuse the renderer's four explicit section layout
// primitives while owning their settings schemas independently.
import type { SectionTypeSchema, SectionType, SectionTypeSchemaV2 } from '~/shared/types/sectionTypes'

// Eager because section JSON is tiny (a few KB per theme) and resolution is
// synchronous; identical to themeData.ts's block-schema glob.
const sectionSettingsFiles = import.meta.glob<SectionTypeSchema>(
  '/themes/*/section-types/*.settings.json',
  { eager: true, import: 'default' },
)

// The schema-driven geometry a section type declares, in a sibling file so the
// glob above cannot pick it up. `.settings.json` stays authoritative for the
// admin settings panel and the authoring slots; `.v2.json` is authoritative for
// the layout engine only, and only where a `layout` block is present.
const sectionLayoutFiles = import.meta.glob<SectionTypeSchemaV2>(
  '/themes/*/section-types/*.v2.json',
  { eager: true, import: 'default' },
)

const THEME_PATH_RE = /^\/themes\/([^/]+)\//

function themeNameFromPath(path: string): string | null {
  return path.match(THEME_PATH_RE)?.[1] ?? null
}

const schemasByTheme: Record<string, Record<string, SectionTypeSchema>> = (() => {
  const out: Record<string, Record<string, SectionTypeSchema>> = {}
  for (const [path, schema] of Object.entries(sectionSettingsFiles)) {
    const theme = themeNameFromPath(path)
    if (!theme || !schema?.type) continue
    ;(out[theme] ??= {})[schema.type] = schema
  }
  return out
})()

/**
 * Get all section type schemas for a theme.
 * Throws on unknown theme (matches getBlockSchemas behavior).
 */
export function getSectionTypeSchemas(themeName: string): Record<string, SectionTypeSchema> {
  const schemas = schemasByTheme[themeName]
  if (!schemas) {
    throw new Error(`[sectionSchemas] Unknown theme: "${themeName}"`)
  }
  return schemas
}

/**
 * Get a single section type schema.
 * Returns undefined if the type is not found in the theme.
 */
export function getSectionTypeSchema(themeName: string, sectionType: SectionType): SectionTypeSchema | undefined {
  return getSectionTypeSchemas(themeName)[sectionType]
}

const layoutSchemasByTheme: Record<string, Record<string, SectionTypeSchemaV2>> = (() => {
  const out: Record<string, Record<string, SectionTypeSchemaV2>> = {}
  for (const [path, schema] of Object.entries(sectionLayoutFiles)) {
    const theme = themeNameFromPath(path)
    if (!theme || !schema?.type) continue
    ;(out[theme] ??= {})[schema.type] = schema
  }
  return out
})()

/**
 * Every schema-driven layout a theme declares.
 *
 * Returns `{}` for an unknown theme rather than throwing, unlike
 * `getSectionTypeSchemas`. The layout engine is opt-in: an absent schema must
 * leave the hand-written layout path in charge, never blank the section.
 */
export function getSectionTypeSchemasV2(themeName: string): Record<string, SectionTypeSchemaV2> {
  return layoutSchemasByTheme[themeName] ?? {}
}

/** The v2 schema for one section type, or `undefined` when the type has none. */
export function getSectionTypeSchemaV2(
  themeName: string,
  sectionType: string,
): SectionTypeSchemaV2 | undefined {
  return getSectionTypeSchemasV2(themeName)[sectionType]
}
