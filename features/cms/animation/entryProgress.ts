/**
 * Compute entry-local progress from scene-level progress.
 * Handles scrollRange remapping and clamping.
 * Single source of truth — used by WAAPI currentTime, VarAnimator,
 * and future sidecar animators (A2, B2).
 */
export function getEntryProgress(
  sceneProgress: number,
  entry: { scrollRange?: { start: number; end: number } },
): number {
  if (!entry.scrollRange) return sceneProgress
  const { start, end } = entry.scrollRange
  if (sceneProgress <= start) return 0
  if (sceneProgress >= end) return 1
  return (sceneProgress - start) / (end - start)
}
