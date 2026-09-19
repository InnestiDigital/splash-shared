import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

/**
 * Responsive hero media focal point (per-breakpoint art-direction).
 *
 * A hero section's background/replaced-element image is centered by default.
 * On a narrow mobile crop of a wide image the subject drifts out of frame, so
 * authors can override the focal point per breakpoint. Resolution mirrors the
 * theme's per-breakpoint grid-override cascade: mobile falls back to tablet,
 * tablet falls back to the desktop (base) value.
 *
 * Decision lives in TS (not @media) per the responsive.ts contract: the layout
 * reads useViewport() width, classifies it, and emits the resolved CSS position
 * into --hero-media-position. Keeping it pure makes the cascade unit-testable.
 */
export const HERO_MEDIA_POSITIONS = [
  'center', 'top', 'bottom', 'left', 'right',
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
] as const
export type HeroMediaPosition = typeof HERO_MEDIA_POSITIONS[number]

export type HeroViewport = 'desktop' | 'tablet' | 'mobile'

// Token -> CSS background-position / object-position value. Single-keyword
// tokens ('center'/'top'/'bottom') map to the exact strings the previous code
// emitted, so existing sections render byte-identically.
const CSS: Record<HeroMediaPosition, string> = {
  'center': 'center',
  'top': 'center top',
  'bottom': 'center bottom',
  'left': 'left center',
  'right': 'right center',
  'top-left': 'left top',
  'top-right': 'right top',
  'bottom-left': 'left bottom',
  'bottom-right': 'right bottom',
}

export function heroViewportFor(width: number): HeroViewport {
  if (width <= BREAKPOINTS.md) return 'mobile'
  if (width < BREAKPOINTS.lg) return 'tablet'
  return 'desktop'
}

function normalize(v: unknown): HeroMediaPosition | null {
  return typeof v === 'string' && (HERO_MEDIA_POSITIONS as readonly string[]).includes(v)
    ? (v as HeroMediaPosition)
    : null
}

/**
 * Resolve the active focal-point token for a viewport.
 * Cascade: mobile -> mobile ?? tablet ?? base; tablet -> tablet ?? base;
 * desktop -> base. Absent or 'inherit' overrides fall through. Base default = 'center'.
 */
export function resolveHeroMediaPosition(
  cfg: { mediaPosition?: unknown; mediaPositionTablet?: unknown; mediaPositionMobile?: unknown } | null | undefined,
  viewport: HeroViewport,
): HeroMediaPosition {
  const base = normalize(cfg?.mediaPosition) ?? 'center'
  const tablet = normalize(cfg?.mediaPositionTablet) ?? base
  if (viewport === 'mobile') return normalize(cfg?.mediaPositionMobile) ?? tablet
  if (viewport === 'tablet') return tablet
  return base
}

export function heroMediaPositionCss(pos: HeroMediaPosition): string {
  return CSS[pos]
}
