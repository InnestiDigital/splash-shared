import type { LayoutFrameConfig } from '~/shared/types/layout'

const DEFAULT_DESIGN_WIDTH = 1440
const DEFAULT_MIN_SCALE = 0.25
const DEFAULT_MAX_SCALE = 1

/**
 * Pure function: compute the scale factor for a given viewport and frame.
 *
 * Returns 1 (no-op) when:
 * - frame.responsiveMode is not 'scale' (caller should skip the wrapper entirely)
 * - frame.designWidth is non-positive (safe fallback — bad config never breaks layout)
 *
 * Otherwise returns clamp(minScale, viewport / designWidth, maxScale).
 *
 * Inverted bounds (min > max) collapse to max — the warning is surfaced by
 * validateLayoutConfig at theme load time.
 */
export function computeScale(viewportWidth: number, frame: LayoutFrameConfig): number {
  if (frame.responsiveMode !== 'scale') return 1

  const designWidth = frame.designWidth ?? DEFAULT_DESIGN_WIDTH
  if (!Number.isFinite(designWidth) || designWidth <= 0) return 1

  const minScale = frame.minScale ?? DEFAULT_MIN_SCALE
  const maxScale = frame.maxScale ?? DEFAULT_MAX_SCALE

  const raw = viewportWidth / designWidth
  if (minScale > maxScale) return maxScale
  return Math.min(Math.max(raw, minScale), maxScale)
}
