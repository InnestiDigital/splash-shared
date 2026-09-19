import type { MaxWidthValue, WidthModeValue } from '~/shared/types/placement'

/**
 * Cross-scope width hints — what a block's own width setting actually does
 * once the section around it has had its say.
 *
 * Generalized from the canvas-only `isCanvasInsetMismatch`: the section and the
 * block each own half of the final width, and neither panel can explain the
 * result alone. Both panels ask THIS function so the two halves of the hint
 * can never disagree about which combination is surprising.
 *
 * Hints only — nothing here corrects, blocks or overrides an author's choice.
 */
export const WIDTH_HINT_KINDS = ['none', 'constrained-in-full-bleed', 'full-in-narrow'] as const
export type WidthHintKind = typeof WIDTH_HINT_KINDS[number]

/**
 * The section container mode that gives a block the whole viewport. Every other
 * mode caps content at the container, so "Full Width" on a block inside them
 * means "fill the section", not "touch the screen edges".
 */
const UNCONSTRAINED_CONTAINER_MODE = 'full-bleed'

/**
 * Container modes narrow enough that a Full Width block reads as broken.
 * `measure` (1200px) and `wide` (1400px) are the ordinary reading widths where
 * filling the container is exactly what an author expects; `content` (720px) is
 * the one that surprises them.
 */
const NARROW_CONTAINER_MODES: readonly string[] = ['content']

/**
 * Which cross-scope hint, if any, the current section/block width pair earns.
 *
 * - `constrained-in-full-bleed` — the section stretches edge to edge but the
 *   block keeps its own cap, so the block decides the visible width.
 * - `full-in-narrow` — the block asks for Full Width inside a narrowed section,
 *   so it fills 720px and stops.
 */
export function crossScopeWidthHint(
  sectionContainerMode: string | null | undefined,
  blockWidthMode: WidthModeValue | null | undefined,
  blockMaxWidth: MaxWidthValue | null | undefined,
): WidthHintKind {
  if (sectionContainerMode === UNCONSTRAINED_CONTAINER_MODE) {
    const constrained = blockWidthMode === 'content' || !!blockMaxWidth
    return constrained ? 'constrained-in-full-bleed' : 'none'
  }
  if (blockWidthMode === 'full' && NARROW_CONTAINER_MODES.includes(sectionContainerMode ?? '')) {
    return 'full-in-narrow'
  }
  return 'none'
}
