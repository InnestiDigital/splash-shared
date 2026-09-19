import { useHead } from '#imports'
import { computed } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { getThemeConfig } from '~/shared/features/cms/themeData'
import { buildColorRoleStyles } from '~/shared/color/buildColorRoleStyles'

/**
 * Inject the site's `--role-*` tier.
 *
 * Scoped to `[data-site-root]` for the same reason `useTypographyPresets` is:
 * every standalone layout puts that attribute on its outermost div, so the
 * scope covers every section and block including nested child-site content,
 * and two nested sites can bind the same role to different palette entries
 * without colliding.
 *
 * The palette key → CSS var mapping needs the theme manifest, which the client
 * config does not carry (it ships `themeVars`, already keyed by var name).
 * `getThemeConfig` reads `theme.json` directly, the same source the server
 * validated the binding against.
 */
export function useColorRoles(): void {
  const { config } = useClientConfig()

  const css = computed(() => {
    const cfg = config.value
    if (!cfg?.theme) return ''

    const roles = cfg.colorRoles
    if (!roles || Object.keys(roles).length === 0) return ''

    let settings
    try {
      settings = getThemeConfig(cfg.theme).settings
    }
    catch {
      // Unknown theme (config mid-load, or a tenant row pointing at a theme
      // this build does not ship). No manifest means no palette to resolve
      // against; the section fallbacks already render the historical values.
      return ''
    }

    return buildColorRoleStyles(roles, settings, '[data-site-root]')
  })

  useHead(computed(() => ({
    style: css.value ? [{ key: 'color-roles', innerHTML: css.value }] : [],
  })))
}
