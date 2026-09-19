/**
 * Split theme/block settings into plain values and CSS-custom-property values.
 *
 * Used by both the server-side client export and the admin editor store to
 * separate fields marked with `cssVar: true` (or `cssVar: '<var-name>'`) from
 * the remaining settings. CSS-var fields are moved out of `settings` into a
 * sibling `cssVars` object keyed by CSS custom-property names so themes can
 * render them as inline `style="--foo: bar"` without polluting the data model.
 *
 * Contract:
 * - Input: a settings object + the block/theme schema field definitions
 * - Output: `{ plain, cssVars }` — two disjoint maps (unless `keepOriginals`)
 * - Any field with `cssVar` truthy is moved to `cssVars`
 * - `options.keepOriginals` keeps the raw value in `plain` as well, for
 *   components that also read the raw value directly (e.g. inline styles
 *   on MegaMenu). Default: strip from `plain`.
 *
 * This function used to be called `extractCssOverride` and returned
 * `{ settings, cssOverride }` — renamed for clarity (the name hid the fact
 * that `settings.<field>` is undefined when `cssVar` is set on the schema).
 */

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export interface SplitThemeSettingsResult {
  /** Settings with cssVar fields removed (unless keepOriginals). */
  plain: Record<string, any>
  /** CSS custom properties, keyed by the CSS var name (without leading --). */
  cssVars: Record<string, string>
}

export function splitThemeSettingsByCssVar(
  settings: Record<string, any>,
  schemaFields?: any[],
  options?: { keepOriginals?: boolean },
): SplitThemeSettingsResult {
  if (!schemaFields) return { plain: settings, cssVars: {} }

  const plain = { ...settings }
  const cssVars: Record<string, string> = {}

  for (const field of schemaFields) {
    if (!field.cssVar || !(field.id in plain)) continue
    const value = plain[field.id]
    if (value == null) continue

    const varName = typeof field.cssVar === 'string'
      ? field.cssVar
      : camelToKebab(field.id)

    cssVars[varName] = typeof value === 'number' && field.options?.unit
      ? `${value}${field.options.unit}`
      : String(value)

    if (!options?.keepOriginals) {
      delete plain[field.id]
    }
  }

  return { plain, cssVars }
}
