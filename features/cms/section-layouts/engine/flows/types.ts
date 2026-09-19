// shared/features/cms/section-layouts/engine/flows/types.ts
//
// The prop contract every slot-flow renderer implements.
//
// A flow renderer owns the slot's root element: it applies the geometry the
// engine computed (`rootStyle`) and decides what DOM sits between that root and
// the blocks. `stack` and `grid` need nothing between the two; `masonry`,
// `strip` and `carousel` need per-item wrappers, and the carousel needs arrows
// and dots as well. That is the whole reason they are components rather than a
// style object.
//
// Contract: docs/architecture/section-layout-engine-contract.md §3.5.

import type { ResolvedBlock, ResolvedLayoutSlot } from '~/shared/types/sectionTypes'

export interface SlotFlowProps {
  /** The resolved slot — role, flow and narrowed `flowOptions`. */
  flowSlot: ResolvedLayoutSlot
  /** Blocks for this slot, already capped by the authoring contract. */
  blocks: ResolvedBlock[]
  /**
   * Geometry for the slot root: `slotFlowStyle()` output, merged with
   * `gridItemStyle()` when the slot is line-placed rather than zone-placed.
   */
  rootStyle: Record<string, string>
  /**
   * The active tier's collapse state. Structural collapse decisions live in TS
   * and reach CSS through this value — never through `@media`
   * (docs/design/composition-responsive.md).
   */
  collapse: 'stack' | 'flow'
  /**
   * The section's authored `layoutConfig`.
   *
   * Only the carousel reads it, and only for `interval`: a `number` setting
   * cannot carry `layoutBind` (contract §3.6 — there is no option list to
   * validate a stored value against), so timing reaches the flow this way
   * rather than through `flowOptions`.
   */
  layoutConfig: Record<string, unknown>
}

/** Stable per-block key: the preview identity when there is one, the row id otherwise. */
export function slotBlockKey(entry: ResolvedBlock): string {
  return entry.block?._previewId || entry.block?.id || ''
}
