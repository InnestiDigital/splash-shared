import type { ResponsiveRules, LayoutGroup, CompositionItem, Region } from './types'

export type LayoutMode = 'desktop' | 'tablet' | 'mobile'

const DESKTOP_BREAKPOINT = 1024

export function getLayoutMode(containerWidth: number, rules: ResponsiveRules): LayoutMode {
  if (containerWidth >= DESKTOP_BREAKPOINT) return 'desktop'
  if (containerWidth >= rules.stackBelow) return 'tablet'
  return 'mobile'
}

export function applyTabletOverrides(
  groups: LayoutGroup[],
  rules: ResponsiveRules,
): LayoutGroup[] {
  if (!rules.tablet) return groups

  return groups.map(group => {
    const rule = rules.tablet![group.id]
    if (!rule) return group

    return {
      ...group,
      baseSize: rule.scaleSize
        ? { ...group.baseSize, w: group.baseSize.w * rule.scaleSize }
        : group.baseSize,
      region: (rule.shiftRegion ?? group.region) as Region,
    }
  })
}

export function getStackItems(
  items: CompositionItem[],
  rules: ResponsiveRules,
): CompositionItem[] {
  const hidden = new Set(rules.hideOnStack ?? [])
  const visible = items.filter(i => i.visible && !hidden.has(i.role))

  const orderIndex = new Map<string, number>()
  rules.stackOrder.forEach((role, i) => orderIndex.set(role, i))

  return visible.sort((a, b) => {
    const ai = orderIndex.get(a.role) ?? 999
    const bi = orderIndex.get(b.role) ?? 999
    return ai - bi
  })
}

// ---------------------------------------------------------------------------
// Section-layout collapse decisions (SPL-131)
// ---------------------------------------------------------------------------

/**
 * Shared breakpoint table — JS source of truth.
 *
 * SCSS mirrors this via `shared/features/cms/composition/breakpoints.scss`
 * (and the `additionalData` hook in `nuxt.config.ts`). Update both when
 * adjusting values.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/**
 * Template IDs the composition system may ask collapse decisions for.
 *
 * These are the only callers: `EditorialSplitSectionLayout.vue`,
 * `GallerySectionLayout.vue` and the layered slot flow. A template that is
 * not implemented must not be pinned here — the 2026-09-18 composition
 * unification (docs/design/2026-09-18-composition-unification.md) expresses
 * new arrangements as section-type tiers/presets instead.
 */
export type CompositionTemplateId =
  | 'editorial-split'
  | 'layered-composition'
  | 'gallery'

/** Open knob bag — individual templates read the subset they care about. */
export type CompositionKnobs = Record<string, unknown>

/**
 * Collapse decision returned per template/viewport/knob combination.
 *
 * - `stack`: true when the layout should reflow to a single column.
 * - `chromeOrder`: controls chrome side placement relative to content.
 * - `chromeSticky`: whether chrome retains sticky positioning (desktop only).
 * - `gapScale`: multiplier applied to `--block-gap` (e.g. 1.2 on mobile
 *   with overlap=spacious to prevent item drift).
 */
export interface CollapseDescriptor {
  stack: boolean
  chromeOrder: 'before' | 'after'
  chromeSticky: boolean
  gapScale: number
}

/**
 * Returns true when viewport should collapse to a single column.
 * Uses `<= BREAKPOINTS.md` as the threshold, so 768 (iPad portrait) is
 * inclusive-mobile — it reflows to one column rather than rendering a
 * desktop grid that overflows the narrow viewport.
 */
export function isMobileViewport(viewportWidth: number): boolean {
  return viewportWidth <= BREAKPOINTS.md
}

/**
 * Resolve the collapse descriptor for a template at a given viewport width.
 *
 * Pure function — no DOM, no window, no side effects. Safe to call in SSR
 * or unit tests with mocked `viewportWidth`.
 *
 * R1 decision: on mobile, chrome always stacks *after* content, regardless
 * of `shellSide`. Intentional for consistent readability on narrow screens.
 *
 * @throws {Error} when template is not in the contract at all
 */
export function resolveCollapse(
  templateId: CompositionTemplateId | string,
  knobs: CompositionKnobs,
  viewportWidth: number,
): CollapseDescriptor {
  const mobile = isMobileViewport(viewportWidth)

  switch (templateId) {
    case 'editorial-split': {
      return {
        stack: mobile,
        // R1: chrome always below content on mobile; uses shellSide otherwise.
        chromeOrder: mobile ? 'after' : resolveChromeOrder(knobs.shellSide),
        // Sticky disabled on mobile because grid collapses to 1fr.
        chromeSticky: !mobile && knobs.chromeAlign === 'sticky-top',
        gapScale: resolveGapScale(knobs.overlap, mobile),
      }
    }

    case 'layered-composition': {
      return {
        stack: mobile && resolveMobileBehaviour(knobs.mobileBehaviour) === 'stack',
        chromeOrder: 'after',
        chromeSticky: false,
        gapScale: resolveGapScale(knobs.overlap, mobile),
      }
    }

    case 'gallery': {
      // CSS-13: gallery only needs the mobile-stack signal — it drives the
      // column-cap rules (grid/masonry/strip) via `data-collapse='stack'`.
      // Chrome fields are inert (gallery has no sticky chrome side) but kept
      // to satisfy the shared CollapseDescriptor contract.
      return {
        stack: mobile,
        chromeOrder: 'after',
        chromeSticky: false,
        gapScale: 1,
      }
    }

    default:
      throw new Error(
        `Unknown composition template: "${templateId}". ` +
          `Add it to CompositionTemplateId and resolveCollapse() (SPL-131).`,
      )
  }
}

function resolveChromeOrder(shellSide: unknown): 'before' | 'after' {
  return shellSide === 'left' ? 'before' : 'after'
}

/**
 * `overlap: 'spacious'` on mobile clamps `gapScale` to 1.2 so items don't
 * drift once the layout reflows to a narrow column.
 */
function resolveGapScale(overlap: unknown, mobile: boolean): number {
  if (mobile && overlap === 'spacious') return 1.2
  return 1.0
}

/**
 * `mobileBehaviour` knob for `layered-composition`:
 * - `stack` (default): reflow to single column on mobile.
 * - `scale`: keep absolute positioning, scale viewport.
 * - `preserve`: keep absolute positioning, no scaling.
 *
 * Unknown values fall back to `stack` (safest).
 */
function resolveMobileBehaviour(value: unknown): 'stack' | 'scale' | 'preserve' {
  if (value === 'scale' || value === 'preserve') return value
  return 'stack'
}
