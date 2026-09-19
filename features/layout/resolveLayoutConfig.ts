import type {
  ThemeLayout,
  PageLayoutOverrides,
  ResolvedLayoutConfig,
  LayoutChromeElement,
} from '~/shared/types/layout'
import { applyLayoutDefaults } from './layoutDefaults'
import {
  mergeHeader,
  mergeFooter,
  mergeBackground,
  mergeScroll,
  mergeChromeElement,
} from './sectionMerge'

/**
 * Deep-merge a theme layout with optional page-level overrides.
 * Returns a fully-populated ResolvedLayoutConfig.
 *
 * Override rules:
 * - header/footer/background/scroll: section-specific deep merge (preserves nested objects)
 * - chrome: id-keyed map of partial overrides applied to existing elements
 * - chrome additions: rejected unless overridePolicy.allowPageChromeAdditions
 * - unknown chrome ids: silently ignored
 * - per-section override is gated by overridePolicy.allowPage*Override
 */
export function resolveLayoutConfig(
  themeLayout: ThemeLayout,
  pageOverrides: PageLayoutOverrides | undefined,
): ResolvedLayoutConfig {
  const base = applyLayoutDefaults(themeLayout)
  if (!pageOverrides) return base

  const result: ResolvedLayoutConfig = { ...base }

  if (pageOverrides.header && base.overridePolicy.allowPageHeaderOverride) {
    result.header = mergeHeader(base.header, pageOverrides.header)
  }

  if (pageOverrides.footer && base.overridePolicy.allowPageFooterOverride) {
    result.footer = mergeFooter(base.footer, pageOverrides.footer)
  }

  if (pageOverrides.background && base.overridePolicy.allowPageBackgroundOverride) {
    result.background = mergeBackground(base.background, pageOverrides.background)
  }

  if (pageOverrides.scroll && base.overridePolicy.allowPageScrollOverride) {
    result.scroll = mergeScroll(base.scroll, pageOverrides.scroll)
  }

  if (pageOverrides.chrome && base.overridePolicy.allowPageChromeOverride) {
    const existingIds = new Set(base.chrome.elements.map(e => e.id))
    const merged: LayoutChromeElement[] = []
    for (const elem of base.chrome.elements) {
      const patch = pageOverrides.chrome[elem.id]
      merged.push(patch ? mergeChromeElement(elem, patch as Partial<LayoutChromeElement>) : elem)
    }
    if (base.overridePolicy.allowPageChromeAdditions) {
      for (const [id, patch] of Object.entries(pageOverrides.chrome)) {
        if (!existingIds.has(id)) {
          // Override map key is authoritative — overwrite patch.id to keep them aligned.
          merged.push({ ...patch, id } as LayoutChromeElement)
        }
      }
    }
    result.chrome = { elements: merged }
  }

  return result
}
