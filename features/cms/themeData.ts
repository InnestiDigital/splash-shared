import type { ThemeManifest } from '~/shared/types/theme'
import { applyFragments, groupFragmentsByTheme } from '~/shared/features/cms/settingsFragments.mjs'

// Theme manifests only. Block schemas deliberately live elsewhere:
//   - public renderer → `blockSchemasRuntime.ts` (generated, slim)
//   - admin authoring → `blockSchemasAuthoring.ts` (full, eager, ~365 KB)
// This module is imported by the public renderer (`useClientConfig`), so
// anything eagerly globbed here lands in every visitor's entry chunk.

// Theme manifests — keyed by absolute path, e.g. "/themes/standalone/theme.json".
const themeManifests = import.meta.glob<ThemeManifest>(
  '/themes/*/theme.json',
  { eager: true, import: 'default' },
)

// Settings fragments — the canonical setting ids a schema opts into with
// `"$fragments": [...]`. A handful of small JSON files per theme; they are
// eager because both the manifest templates below and the admin schema loader
// resolve fragments at module load.
const fragmentFiles = import.meta.glob<Record<string, unknown>>(
  '/themes/*/settings-fragments/*.json',
  { eager: true, import: 'default' },
)

const fragmentsByTheme = groupFragmentsByTheme(fragmentFiles)

/** Settings fragments of a theme, keyed by fragment id. Empty for a theme that ships none. */
export function getSettingsFragments(theme: string): Record<string, any> {
  return fragmentsByTheme[theme] ?? {}
}

const THEME_PATH_RE = /^\/themes\/([^/]+)\//

function themeNameFromPath(path: string): string | null {
  const m = path.match(THEME_PATH_RE)
  return m?.[1] ?? null
}

/**
 * Expand `$fragments` on a manifest's template `settingsSchema`s. Templates
 * carry their fields under `settingsSchema`, not `settings`, so the shared
 * merge is fed that key and the result mapped back.
 */
function resolveTemplateFragments(manifest: ThemeManifest, theme: string): ThemeManifest {
  const templates = (manifest as { templates?: any[] }).templates
  if (!Array.isArray(templates)) return manifest

  const fragments = getSettingsFragments(theme)
  return {
    ...manifest,
    templates: templates.map((template) => {
      if (template?.$fragments === undefined) return template
      // $fragmentOverrides / $fragmentOmit must travel WITH $fragments into the
      // merge — destructuring them into `rest` silently discards every
      // template-level default/label/migratedFrom override.
      const { $fragments, $fragmentOverrides, $fragmentOmit, settingsSchema, ...rest } = template
      const merged = applyFragments(
        { $fragments, $fragmentOverrides, $fragmentOmit, settings: settingsSchema ?? [] },
        fragments,
        `${theme}/templates/${template.id ?? '(unknown)'}`,
      )
      return { ...rest, settingsSchema: merged.settings }
    }),
  } as ThemeManifest
}

const themeConfigs: Record<string, ThemeManifest> = (() => {
  const out: Record<string, ThemeManifest> = {}
  for (const [path, manifest] of Object.entries(themeManifests)) {
    const name = themeNameFromPath(path)
    if (name) out[name] = resolveTemplateFragments(manifest, name)
  }
  return out
})()

export const AVAILABLE_THEMES: string[] = Object.keys(themeConfigs).sort()

export function getThemeConfig(theme: string): ThemeManifest {
  const cfg = themeConfigs[theme]
  if (!cfg) {
    throw new Error(
      `[getThemeConfig] Unknown theme "${theme}". Available themes: ${AVAILABLE_THEMES.join(', ')}`,
    )
  }
  return cfg
}

/** Whether a theme manifest exists. Used by the schema modules to validate. */
export function isKnownTheme(theme: string): boolean {
  return Boolean(themeConfigs[theme])
}
