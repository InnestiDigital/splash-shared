import type { BrandCanvasOverrides, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandTemplateCuration } from '~/shared/types/brandTemplate'

/**
 * Brand Content Studio — per-template CURATION, as pure logic.
 *
 * An admin marks which of an approved canvas's block settings a `client`
 * session may change. That map lives on the template ROW (see
 * `shared/types/brandTemplate.ts` for why it is not pinned into the snapshot),
 * and every consumer — the client's form, the server's generate gate — reads it
 * through this module so the UI and the enforcement cannot disagree about what
 * "curated" means.
 *
 * The load-bearing rule is the INTERSECTION: curation is only ever reported
 * narrowed to what the snapshot in the same response actually contains. A
 * re-approval that deletes a block leaves a curation key naming a block nobody
 * can see; dropping it here is what guarantees a client is never offered a
 * field the approved tree lacks, and it is why a stale row is harmless rather
 * than a leak.
 *
 * `Object.hasOwn` throughout: both maps arrive from JSON columns and from HTTP
 * bodies, so an inherited key must never be mistaken for an authored one — the
 * same discipline `applyCanvasOverrides` keeps.
 */

/**
 * Curation narrowed to what THIS snapshot actually contains. Never widens.
 *
 * @returns `{}` when either side is missing — "nothing is customer-editable",
 *   the closed default, expressed as an empty map so callers can iterate
 *   without a null branch.
 */
export function effectiveCuration(
  snapshot: BrandCanvasSnapshot | null,
  curation: BrandTemplateCuration | null,
): BrandTemplateCuration {
  if (snapshot === null || curation === null) return {}

  const effective: BrandTemplateCuration = {}
  for (const block of snapshot.blocks) {
    if (!Object.hasOwn(curation, block.id)) continue
    const settingIds = curation[block.id]
    // A curated block with an empty list is the same statement as an absent
    // one — no field is editable — so it is not carried, and the UI's
    // "does this block appear" test stays a single `hasOwn`.
    if (settingIds === undefined || settingIds.length === 0) continue
    effective[block.id] = [...settingIds]
  }
  return effective
}

/** UI filter: does a curated session see this field? */
export function isSettingCurated(
  curation: BrandTemplateCuration,
  blockId: string,
  settingId: string,
): boolean {
  if (!Object.hasOwn(curation, blockId)) return false
  const settingIds = curation[blockId]
  return settingIds !== undefined && settingIds.includes(settingId)
}

/**
 * The override keys a curated session is NOT allowed to send, as
 * `blockId.settingId` strings.
 *
 * An override naming a block the SNAPSHOT does not contain is blocked, not
 * ignored. That is a deliberate fork from `applyCanvasOverrides` /
 * `effectiveOverrides`, which drop unknown ids so an old recipe keeps
 * rendering: for a customer, "not in the snapshot" and "not curated" are the
 * same refusal, and answering differently would turn the render endpoint into a
 * probe for which block ids exist.
 *
 * @returns `[]` when the request is clean — including when there is nothing to
 *   check at all.
 */
export function nonCuratedOverrideKeys(
  snapshot: BrandCanvasSnapshot | null,
  curation: BrandTemplateCuration | null,
  overrides: BrandCanvasOverrides | null | undefined,
): string[] {
  if (!overrides) return []

  const effective = effectiveCuration(snapshot, curation)
  const blocked: string[] = []
  for (const [blockId, settings] of Object.entries(overrides)) {
    for (const settingId of Object.keys(settings)) {
      if (!isSettingCurated(effective, blockId, settingId)) blocked.push(`${blockId}.${settingId}`)
    }
  }
  return blocked
}

/**
 * The subset of a block's settings an admin may OFFER to customers.
 *
 * Freeform color settings are the frozen tech debt (CLAUDE.md, "Color
 * Override Freeze"): a client re-hexing them per generation would expand
 * exactly the surface the freeze exists to cap, so a `color` field is never
 * curatable regardless of what the schema declares. Applied at the editor
 * (the checkbox never renders) — an already-stored color id simply reads as
 * "no longer declared" and is dropped on the next save.
 */
export function curatableSettings<T extends { id: string; type: string }>(
  settings: readonly T[],
): T[] {
  return settings.filter(field => field.type !== 'color')
}
