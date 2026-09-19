import { colorRoleCssVar, isColorRole, type ColorRoleBindings } from '~/shared/types/colorRoles'
import { resolvePaletteCssVar, type PaletteSettingField } from './colorPalette'

/**
 * Emit the `--role-*` tier as a CSS rule, modelled on the role-var pass in
 * `buildTypographyStyles`.
 *
 * A role is skipped — never defaulted — when its stored `paletteKey` is not a
 * color entry in the CURRENT theme manifest. The `--section-*` declarations in
 * `SectionRenderer` each carry the palette var that slot historically
 * hardcoded as their fallback, so a skipped role lands on exactly the value
 * the site rendered before the color-role tier existed. Fail-soft is right
 * here: an unresolvable color role is a missing preference, not a missing page.
 *
 * Returns '' when nothing resolves, so callers can skip injecting a style tag
 * entirely and a site with zero bindings emits zero extra bytes.
 */
export function buildColorRoleStyles(
  roles: ColorRoleBindings | undefined,
  settings: readonly PaletteSettingField[] | undefined,
  scope: string = ':root',
): string {
  if (!roles) return ''

  const roleVars: string[] = []
  for (const [role, paletteKey] of Object.entries(roles)) {
    if (!paletteKey || !isColorRole(role)) continue
    const cssVar = resolvePaletteCssVar(settings, paletteKey)
    if (!cssVar) continue
    roleVars.push(`  ${colorRoleCssVar(role)}: var(--${cssVar});`)
  }

  if (roleVars.length === 0) return ''
  return `${scope} {\n${roleVars.join('\n')}\n}`
}
