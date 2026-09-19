// shared/features/cms/section-layouts/engine/types.ts
//
// Mutable working copies of the read-only schema shapes in
// `shared/types/sectionTypes.ts`. A schema's `layout` block is authored data and
// stays frozen; `layoutBind` settings patch a *draft* of it before geometry is
// computed, so every optional field is normalised to an explicit value here and
// nothing downstream has to re-derive a default.
//
// See docs/architecture/section-layout-engine-contract.md §3.

import type {
  LayoutEngineKind,
  LayoutGridLines,
  LayoutOffset,
  LayoutTierDefinition,
  LayoutTierId,
  PlaceableRole,
  SlotFlowMode,
  SlotStickyConfig,
  SpacingTier,
  LayoutBoundValue,
  SectionTypeSchemaV2,
} from '~/shared/types/sectionTypes'

/** One section-type setting as the engine sees it: schema fields plus the optional bind surface. */
export type SchemaSetting = SectionTypeSchemaV2['settings'][number]

/** A zone, with every optional grid-item property resolved to an explicit value. */
export interface ZoneDraft {
  flow: SlotFlowMode
  gap: SpacingTier
  placeSelf: string
  sticky: SlotStickyConfig | null
  offset: LayoutOffset | null
  zIndex: number | null
  hiddenIn: LayoutTierId[]
}

/**
 * A slot, with `zone` / `place` collapsed to a nullable pair.
 *
 * The schema keeps them mutually exclusive (contract §3.4); the draft keeps both
 * fields present so `slot.<role>.zone` can move a line-placed slot into a zone
 * without changing the shape underneath it.
 */
export interface SlotDraft {
  role: PlaceableRole
  zone: string | null
  place: LayoutGridLines | null
  flow: SlotFlowMode
  flowOptions: Record<string, LayoutBoundValue>
  placeSelf: string | null
  sticky: SlotStickyConfig | null
  offset: LayoutOffset | null
  zIndex: number | null
  hiddenIn: LayoutTierId[]
}

/**
 * A patchable copy of `SectionLayoutDefinition`.
 *
 * `zoneOrder` exists because `zones` is a record and DOM order still matters for
 * the tiers that declare no `areas` (contract §3.1: zones then fall back to
 * declaration order in a single implicit column).
 */
export interface LayoutDraft {
  engine: LayoutEngineKind
  tiers: LayoutTierDefinition[]
  areas: Record<LayoutTierId, string[]>
  columns: Record<LayoutTierId, string>
  rows: Record<LayoutTierId, string>
  gap: { row: SpacingTier; column: SpacingTier }
  placeItems: string
  minHeight: string | null
  zoneOrder: string[]
  zones: Record<string, ZoneDraft>
  slots: SlotDraft[]
}

/** Everything binding application needs that is not in the layout itself. */
export interface BindingContext {
  /** The tier resolved from the viewport. `null` only for a degraded, tier-less schema. */
  activeTier: LayoutTierId | null
  /** This section's index among its same-type siblings — the `alternate-by-index` resolver's input. */
  sectionIndex: number
  /** Called for every rejected authored value or malformed bind. Default is a console warning. */
  onWarn?: (message: string) => void
}
