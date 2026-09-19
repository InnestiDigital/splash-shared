import type { LayoutContainerMode, LayoutFrameConfig, LayoutSpacingTier } from '~/shared/types/layout'
import { LAYOUT_CONTAINER_MODES, LAYOUT_SPACING_TIERS } from '~/shared/types/layout'
import { DEFAULT_FRAME, DEFAULT_SECTION_SPACING } from './layoutDefaults'

/**
 * The layout frame, expressed as CSS custom properties.
 *
 * `LayoutShell` sets these on the layout content box (`[data-layout-content]`
 * in breakpoint mode, `.layout-scale-content` in scale mode). They are the
 * page-level DEFAULTS behind the per-section frame settings:
 *
 *   layout frame  →  section (containerMode / containerInsetX / sectionSpaceY)
 *
 * A section that carries its own value wins — consumers reference the var only
 * as the fallback arm, so cascade order is preserved. Templated pages
 * (article / blog-index roots) consume the same three vars, which is what makes
 * a static page and a templated page answer to one frame.
 *
 * | Property             | Meaning                                    |
 * |----------------------|--------------------------------------------|
 * | `--layout-max-width` | width of the content column (`none` = full)|
 * | `--layout-inset-x`   | horizontal inset of the content column     |
 * | `--layout-space-y`   | vertical rhythm between sections           |
 */
export const LAYOUT_FRAME_VARS = {
  maxWidth: '--layout-max-width',
  insetX: '--layout-inset-x',
  spaceY: '--layout-space-y',
} as const

// Re-exported, not redeclared: `shared/types/layout.ts` is the one declaration
// (value AND editor label), and the editable-surface registry resolves its
// `section-container-modes` / `layout-spacing-tiers` vocabularies from there.
export { LAYOUT_CONTAINER_MODES, LAYOUT_SPACING_TIERS }

const CONTAINER_MODE_SET: ReadonlySet<string> = new Set(LAYOUT_CONTAINER_MODES)
const SPACING_TIER_SET: ReadonlySet<string> = new Set(LAYOUT_SPACING_TIERS)

export function isLayoutContainerMode(value: unknown): value is LayoutContainerMode {
  return typeof value === 'string' && CONTAINER_MODE_SET.has(value)
}

export function isLayoutSpacingTier(value: unknown): value is LayoutSpacingTier {
  return typeof value === 'string' && SPACING_TIER_SET.has(value)
}

/** Theme-wide width token the container modes are shaped around. */
const BASE_MAX_WIDTH = 'var(--container-max-width, 1200px)'

/**
 * Same width formulas `SectionRenderer` applies per container mode, so a frame
 * default and a section override cannot drift.
 */
export function containerModeWidth(mode: LayoutContainerMode): string {
  switch (mode) {
    case 'measure':
      return BASE_MAX_WIDTH
    case 'content':
      return `min(720px, ${BASE_MAX_WIDTH})`
    case 'wide':
      return `max(${BASE_MAX_WIDTH}, 1400px)`
    case 'full-bleed':
      return 'none'
    default: {
      const exhaustive: never = mode
      throw new Error(`[frameTokens] Unhandled container mode: ${String(exhaustive)}`)
    }
  }
}

/**
 * Resolve a frame config to the three custom properties above.
 *
 * Illegal authored values are reported by `validateLayoutConfig` and fall back
 * to the frame defaults here rather than throwing mid-render.
 */
export function resolveFrameTokens(frame: LayoutFrameConfig): Record<string, string> {
  const mode = isLayoutContainerMode(frame.containerMode) ? frame.containerMode : DEFAULT_FRAME.containerMode
  const insetX = frame.insetX || DEFAULT_FRAME.insetX
  const spaceY = isLayoutSpacingTier(frame.sectionSpacingDefault)
    ? frame.sectionSpacingDefault
    : DEFAULT_SECTION_SPACING

  return {
    [LAYOUT_FRAME_VARS.maxWidth]: frame.maxWidth || containerModeWidth(mode),
    // A tier resolves to its theme token; anything else is authored CSS length
    // (the `insetX` type deliberately allows one) and passes through as-is.
    [LAYOUT_FRAME_VARS.insetX]: isLayoutSpacingTier(insetX)
      ? `var(--container-inset-x-${insetX})`
      : insetX,
    [LAYOUT_FRAME_VARS.spaceY]: `var(--section-space-y-${spaceY})`,
  }
}
