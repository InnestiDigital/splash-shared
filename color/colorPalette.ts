/**
 * Palette lookup shared by the server (write-time validation of a role's
 * `paletteKey`) and the client (emitting `--role-*` from that key).
 *
 * A "palette entry" is a theme-manifest setting of type `color` that carries a
 * `cssVar`: a color with no CSS custom property has nothing for a role to
 * point at. The var-name derivation matches `splitThemeSettingsByCssVar`
 * exactly — `cssVar: '<name>'` uses that name, `cssVar: true` kebab-cases the
 * setting id — because that is the function that put the value on the page.
 */

/** The manifest shape this module needs. Kept structural so both the server's
 *  loaded manifest and the client's `getThemeConfig` result satisfy it. */
export interface PaletteSettingField {
  id: string
  type?: string
  cssVar?: boolean | string
  label?: string | Record<string, string>
  default?: unknown
}

export interface PaletteEntry {
  id: string
  cssVar: string
  label?: string | Record<string, string>
  default?: string
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function cssVarName(field: PaletteSettingField): string | null {
  if (!field.cssVar) return null
  return typeof field.cssVar === 'string' ? field.cssVar : camelToKebab(field.id)
}

/** Every palette entry a color role may legally bind to, in manifest order. */
export function listPaletteEntries(settings: readonly PaletteSettingField[] | undefined): PaletteEntry[] {
  if (!settings) return []
  const entries: PaletteEntry[] = []
  for (const field of settings) {
    if (field.type !== 'color') continue
    const cssVar = cssVarName(field)
    if (!cssVar) continue
    entries.push({
      id: field.id,
      cssVar,
      label: field.label,
      default: typeof field.default === 'string' ? field.default : undefined,
    })
  }
  return entries
}

/**
 * The CSS var name a palette key resolves to, or null when the current theme
 * declares no such color entry.
 *
 * Null is a normal outcome, not an error: a site can be re-themed onto a theme
 * with a smaller palette, and the role then falls back to whatever the section
 * scheme hardcodes. Callers skip, they do not substitute.
 */
export function resolvePaletteCssVar(
  settings: readonly PaletteSettingField[] | undefined,
  paletteKey: string,
): string | null {
  if (!settings) return null
  for (const field of settings) {
    if (field.id !== paletteKey) continue
    if (field.type !== 'color') return null
    return cssVarName(field)
  }
  return null
}
