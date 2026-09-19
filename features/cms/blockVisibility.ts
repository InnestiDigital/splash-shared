import type { BlockPlacementConfig, ViewportName } from '~/shared/types/placement'

/**
 * Single source of truth for whether a block renders.
 *
 * Two independent axes, both AND-ed:
 *   - viewport   — `hiddenViewports` (responsive visibility)
 *   - auth state — `visibleTo` (personalization)
 *
 * PERSONALIZATION, NOT SECURITY. Both variants are present in the page
 * payload; this only decides what the renderer mounts. A signed-out visitor
 * can read a `visibleTo: 'auth'` block's content in devtools. Page-level
 * gating is `pages.requireAuth`, which is enforced server-side.
 *
 * Unrecognized `visibleTo` values fail OPEN (visible) on purpose: an unknown
 * enum value from a newer schema must not silently blank a page.
 */
export function resolveBlockVisibility(
  placement: BlockPlacementConfig | undefined,
  currentViewport: ViewportName,
  isAuthenticated: boolean,
): boolean {
  if (!placement) return true

  const hidden = placement.hiddenViewports
  if (Array.isArray(hidden) && hidden.includes(currentViewport)) return false

  switch (placement.visibleTo) {
    case 'auth': return isAuthenticated
    case 'guest': return !isAuthenticated
    default: return true
  }
}
