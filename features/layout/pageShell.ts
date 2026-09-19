import { computed, provide, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { DEFAULT_LAYOUT_ID } from '~/shared/features/layout/articleLayout'

/**
 * Injection keys the theme shells read to resolve their ThemeLayout. Exported
 * so the surfaces that render a shell (public route, page preview, article
 * preview) can never disagree with the layouts about the spelling.
 */
export const CURRENT_PAGE_LAYOUT_ID = 'currentPageLayoutId'
export const CURRENT_PAGE_META = 'currentPageMeta'

/**
 * Nuxt layout files that exist per theme. A theme-layout id is NOT a Nuxt
 * layout: the chrome (header/footer/frame/background) is resolved inside the
 * shell from theme.json, so 'editorial' or 'scale-canvas' render through the
 * theme's default Nuxt shell rather than requiring a parallel file.
 */
export const KNOWN_NUXT_LAYOUTS = new Set([
  'standalone-default', 'standalone-blank',
])

/**
 * Nuxt layout name for a (theme, theme-layout id) pair. Falls back to the
 * theme's default shell for any id without its own file, and to the app's own
 * 'default' layout when there is no theme yet (config still in flight).
 */
export function resolveNuxtLayoutName(
  theme: string | null | undefined,
  layoutId: string | null | undefined,
): string {
  if (!theme) return DEFAULT_LAYOUT_ID
  const themed = `${theme}-${layoutId || DEFAULT_LAYOUT_ID}`
  if (KNOWN_NUXT_LAYOUTS.has(themed)) return themed
  return `${theme}-default`
}

/**
 * Mount contract between a route and a theme shell: publish the page's theme
 * layout id + meta for `useResolvedLayout`, and answer which Nuxt layout hosts
 * the shell. Every surface that renders theme chrome calls this, so a preview
 * frames a page exactly the way the published route does.
 */
export function usePageShell(source: {
  theme: MaybeRefOrGetter<string | null | undefined>
  layoutId: MaybeRefOrGetter<string | null | undefined>
  meta: MaybeRefOrGetter<Record<string, any> | null | undefined>
}): ComputedRef<string> {
  const layoutId = computed(() => toValue(source.layoutId) || DEFAULT_LAYOUT_ID)
  const meta = computed<Record<string, any>>(() => toValue(source.meta) ?? {})

  provide(CURRENT_PAGE_LAYOUT_ID, layoutId)
  provide(CURRENT_PAGE_META, meta)

  return computed(() => resolveNuxtLayoutName(toValue(source.theme), layoutId.value))
}
