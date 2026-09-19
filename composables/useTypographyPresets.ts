import { useHead } from '#imports'
import { computed } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { buildTypographyStyles } from '~/shared/typography/buildTypographyStyles'
import type { ThemeVariant } from '~/shared/typography/axisResolution'

export function useTypographyPresets(): void {
  const { config } = useClientConfig()

  const css = computed(() => {
    const cfg = config.value
    if (!cfg) return ''

    const presets = cfg.typographyPresets ?? []
    const roles = cfg.typographyRoles ?? {}

    if (presets.length === 0) return ''

    // Theme variants drive variable-font emission (font-variation-settings +
    // derived legacy properties). The published config exposes them under
    // `typography.variants` — same registry `useFontFaces` reads for
    // @font-face declarations.
    const typography = cfg.typography as { variants?: ThemeVariant[] } | undefined
    const themeVariants = typography?.variants ?? []

    // Scope the typography CSS vars and utility classes to the theme's
    // site-root wrapper. Every standalone layout (default, blank) puts a
    // `data-site-root` attribute on its outermost div, so this scope is
    // guaranteed to cover every block, every TipTap element, and any
    // nested child-site content rendered inside the parent.
    return buildTypographyStyles(presets, roles, '[data-site-root]', themeVariants)
  })

  // useHead must be called in setup() context — passing computed keeps it reactive
  // without re-calling useHead on every config update.
  useHead(computed(() => ({
    style: css.value ? [{ key: 'typography-presets', innerHTML: css.value }] : [],
  })))
}
