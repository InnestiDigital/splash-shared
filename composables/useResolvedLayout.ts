import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import type { ResolvedLayoutConfig, ThemeLayout, PageLayoutOverrides } from '~/shared/types/layout'
import { resolveLayoutConfig } from '~/shared/features/layout/resolveLayoutConfig'
import { applyLayoutDefaults } from '~/shared/features/layout/layoutDefaults'

type PageLike = { layout?: string, meta?: Record<string, any> } | null | undefined

/**
 * Merge a theme's layout definition with optional page-level overrides into a
 * fully-populated ResolvedLayoutConfig.
 *
 * Lookup rules:
 *   - Pick the layout matching `page.layout` from `themeManifest.layout.layouts`.
 *   - If no match (or no layout id supplied), fall back to the first layout.
 *   - If the manifest has no layouts at all, return a fully-defaulted "default" layout.
 *
 * Both args accept refs/getters/plain values via Vue's MaybeRefOrGetter contract,
 * so layouts can pass live `currentPageMeta` refs without manual unwrapping.
 */
export function useResolvedLayout(
  themeManifest: MaybeRefOrGetter<any>,
  page: MaybeRefOrGetter<PageLike>,
): ComputedRef<ResolvedLayoutConfig> {
  return computed(() => {
    const manifest = toValue(themeManifest)
    const p = toValue(page)
    const layouts: ThemeLayout[] = manifest?.layout?.layouts ?? []
    const layoutId = p?.layout
    const layout = layouts.find(l => l.id === layoutId) ?? layouts[0]
    if (!layout) {
      return applyLayoutDefaults({ id: 'default', label: { 'en-US': 'Default' }, allowedBlocks: [] })
    }
    const overrides = p?.meta?.layoutOverrides as PageLayoutOverrides | undefined
    return resolveLayoutConfig(layout, overrides)
  })
}
