// shared/features/cms/section-layouts/layeredSlots.ts
//
// "Does this section type offer free placement?" — one answer, three callers.
//
// `placement.canvas` used to be legal on brand-canvas pages and nowhere else, so
// the question had a page-shaped answer. Since L5 an ordinary section can own a
// `flow: "layered"` slot, and the four write endpoints, the editor's preview
// commit chain and the renderer all have to agree on which types those are —
// from the same predicate, over the same `.v2.json` data, or a gesture the
// preview accepts becomes a 422 nobody can explain.
//
// Deliberately structural rather than a flag on the schema: the layered slot IS
// the declaration. A separate `allowsCanvasPlacement: true` would be a second
// source of truth that can disagree with the layout it describes.
//
// Contract: docs/architecture/section-layout-engine-contract.md §7.

// The predicate itself lives in the plain-ESM sibling so the editable-surface
// registry builder — plain ESM, and run under plain Node by its drift gate —
// shares this implementation instead of mirroring it. Re-exported here, so no
// caller of this module had to move.
export { declaresLayeredSlot, layeredSectionTypes } from '~/shared/features/cms/section-layouts/layeredSlots.mjs'

/**
 * The narrowest shape this question needs.
 *
 * Stated structurally rather than as `SectionTypeSchemaV2` so the same function
 * serves the renderer (which has the full typed schema) and the server (which
 * has a `JSON.parse` result it has only checked for a `layout` key), with no
 * assertion at either call site. `SectionTypeSchemaV2` satisfies it.
 */
export interface LayeredProbeSchema {
  layout?: { slots?: readonly { role?: unknown; flow?: unknown }[] }
  settings?: readonly {
    layoutBind?: readonly { target?: string }[]
    options?: readonly { layoutValues?: Readonly<Record<string, unknown>> }[]
    layoutValue?: Readonly<Record<string, unknown>>
    layoutValueOff?: Readonly<Record<string, unknown>>
  }[]
}

