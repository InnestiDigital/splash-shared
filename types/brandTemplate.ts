import {
  BRAND_CANVAS_OVERRIDE_MAX_BLOCKS,
  isBrandCanvasDimension,
  isBrandCanvasSnapshot,
} from '~/shared/types/brandCanvas'
import { isRecord } from '~/shared/types/guards'
import { isCanvasSnapshotRevision } from '~/shared/features/brand-studio/canvasSnapshotRevision'
import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'

/**
 * Brand Content Studio — the TEMPLATE tier's wire contract.
 *
 * A template is a canvas: a real page of type `brand-canvas` (blocks and
 * sections on the ordinary tables) plus the row in this tier that owns its
 * authoritative size, its approval state, and the approved SNAPSHOT of that
 * page's tree. See `shared/types/brandCanvas.ts` for the snapshot itself.
 *
 * Sizes are re-exported from the canvas contract rather than restated: the row
 * and the page frame must clamp identically or an approval can pin a canvas the
 * renderer refuses.
 */

// ─── Stored templates ────────────────────────────────────────────────────────

/**
 * The STORED tier: a `brand_format_templates` row.
 *
 * `status` is a two-state gate, not a label. Only an `approved` template is a
 * finished thing a generator may reach for, and approval is what produces
 * `snapshot` — the row's own copy of the canvas page's tree at that moment.
 * The page keeps being edited afterwards; the snapshot does not move until the
 * next approval, which is the whole point of storing one.
 *
 * The table evolves IN PLACE, and the migration is DESTRUCTIVE IN BOTH
 * DIRECTIONS — state it in the migration rather than discovering it in a
 * rollback:
 *
 *  `up()`   DELETE every existing row (seed-stage HTML templates, nothing in
 *           production), then DROP `html` + `skill_md` and ADD `page_id`
 *           VARCHAR(36) NOT NULL + `snapshot` JSON NULL. The delete comes
 *           FIRST: `page_id` has no default and no back-fillable value — an
 *           HTML-tier row never had a canvas page — so under MySQL 8's default
 *           STRICT_TRANS_TABLES adding it to a populated table is ERROR 1364.
 *
 *  `down()` DELETE every existing row for the same reason in reverse (a canvas
 *           template has no markup to restore `html` NOT NULL from), then DROP
 *           `snapshot` + `page_id` and re-add `html` MEDIUMTEXT NOT NULL +
 *           `skill_md` TEXT NOT NULL. The canvas PAGES are left behind
 *           deliberately: they are ordinary draft pages and dropping them would
 *           make a rollback destroy content the editor still lists.
 *           `2026_07_28_000002_brand_generations_from_templates.ts` is the
 *           precedent for both the delete and for saying so in a comment.
 */
export const BRAND_TEMPLATE_STATUSES = ['draft', 'approved'] as const
export type BrandTemplateStatus = (typeof BRAND_TEMPLATE_STATUSES)[number]

export const BRAND_TEMPLATE_NAME_MAX_LENGTH = 120

// ─── Curation ────────────────────────────────────────────────────────────────

/**
 * More setting ids than any real block schema declares. Past this the value is
 * a bug or an attack, not an admin ticking checkboxes — the same reasoning
 * `BRAND_CANVAS_OVERRIDE_MAX_BLOCKS` applies to the override map, which is why
 * the block-count cap is REUSED rather than restated: curation and overrides
 * are keyed by the same block ids over the same snapshot, so two different
 * caps would mean one of them is unreachable.
 */
export const BRAND_TEMPLATE_CURATION_MAX_SETTINGS = 128

/**
 * Per-template curation: block uuid → the setting ids a `client` session may
 * override.
 *
 * An absent block id means that whole block is off-limits, and `null` on the
 * record means nothing is customer-editable at all — the CLOSED default, which
 * is what every pre-curation row reads as. A template with no curation is still
 * fully generatable by a client; it simply renders exactly as approved.
 *
 * Curation is stored on the ROW, not inside the approved snapshot, so ticking a
 * checkbox never bumps `version` and never invalidates a saved recipe's pin.
 * The safety property ("never offer a client a field the approved snapshot
 * lacks") comes from intersecting this map against the snapshot at read time —
 * see `shared/features/brand-studio/curation.ts` — not from where it lives.
 */
export type BrandTemplateCuration = Record<string, string[]>

export function isBrandTemplateCuration(value: unknown): value is BrandTemplateCuration {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > BRAND_CANVAS_OVERRIDE_MAX_BLOCKS) return false
  return entries.every(([blockId, settingIds]) =>
    blockId.length > 0
    && Array.isArray(settingIds)
    && settingIds.length <= BRAND_TEMPLATE_CURATION_MAX_SETTINGS
    && settingIds.every(id => typeof id === 'string' && id.length > 0))
}

export interface BrandTemplateRecord {
  id: string
  name: string
  /** The `brand-canvas` page this template edits. One page per template, not shared. */
  pageId: string
  /**
   * The approved tree. `null` until the first approval — a never-approved
   * template has a page but nothing a generator may render, which is exactly
   * what `status: 'draft'` reports.
   */
  snapshot: BrandCanvasSnapshot | null
  /**
   * Which of the approved blocks' settings a `client` session may change.
   * `null` = none, the closed default. A customer-facing read replaces this
   * with the snapshot-intersected projection, so the browser is never handed a
   * key naming a block the response does not contain.
   */
  customerSettings: BrandTemplateCuration | null
  status: BrandTemplateStatus
  /** Bumped on every approval. Not a `versions` foreign key — templates are live rows like `media`. */
  version: number
  /** Authoritative canvas size. `pages.meta.brandCanvas` mirrors it; this row wins. */
  width: number
  height: number
  createdAt: string
  updatedAt: string
}

/**
 * What `GET /api/admin/s/:siteId/brand-templates/:templateId` answers: the row
 * PLUS the site's live theme layer.
 *
 * Separate from `BrandTemplateRecord` on purpose. The theme is per-SITE, not
 * per-template, so it belongs to the single-template read (whose consumer is
 * the canvas preview iframe and needs it to paint) and NOT to the list
 * endpoint, where it would multiply one shell by the row count.
 *
 * Folding it in here keeps the iframe at one fetch, at the cost of per-site
 * data on a per-template response. A later client-facing template read must not
 * simply reuse this shape — `themeSettings` carries site-level values (site
 * name, auth storage key) that such a response would need to project down.
 *
 * `warnings` carries the theme resolver's own non-fatal degradations (e.g. a
 * never-published site falling back to the draft shell with no uploaded
 * fonts) — the SAME list `renderBrandTemplate` merges into its render result.
 * Without it here, the admin iframe arm would show a plausible preview with
 * no notice that the shell is degraded while the Chromium export arm reports
 * it plainly.
 */
export interface BrandTemplateDetail extends BrandTemplateRecord {
  theme: BrandCanvasThemeLayer
  warnings: string[]
}

/**
 * Narrows a wire-shaped value into a `BrandTemplateRecord`, or `null` if it is
 * not recognisable as one at all.
 *
 * Every field below drives an irreversible control (approve, delete, open the
 * canvas page), so this is the single parse admin surfaces should trust rather
 * than re-checking `unknown` themselves.
 *
 * A snapshot that fails `isBrandCanvasSnapshot` is read as `null` rather than
 * rejecting the whole row: an unparseable snapshot is exactly "nothing this
 * build can generate from", and dropping the template would leave an admin
 * unable to rename, re-approve or delete the very row that is broken. No wire
 * key that is not one of these named fields is ever passed through.
 */
export function narrowBrandTemplateRow(value: unknown): BrandTemplateRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id.length === 0) return null
  if (typeof value.name !== 'string') return null
  if (typeof value.pageId !== 'string' || value.pageId.length === 0) return null
  if (!isBrandTemplateStatus(value.status)) return null
  if (typeof value.version !== 'number') return null
  if (typeof value.width !== 'number' || typeof value.height !== 'number') return null
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return null

  const snapshot = isBrandCanvasSnapshot(value.snapshot) ? value.snapshot : null
  // Same policy as `snapshot`, for the same reason plus a sharper one: an
  // unreadable allow-list must read as "nothing is customer-editable", never as
  // "everything is". Fail closed.
  const customerSettings = isBrandTemplateCuration(value.customerSettings) ? value.customerSettings : null

  return {
    id: value.id,
    name: value.name,
    pageId: value.pageId,
    snapshot,
    customerSettings,
    status: value.status,
    version: value.version,
    width: value.width,
    height: value.height,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

/**
 * Creating a template creates its canvas page too, so the request carries only
 * what neither the page nor the defaults can supply. There is no markup field
 * and no `pageId`: a caller must not be able to point a template at a page it
 * did not create, which would let one template's approval snapshot another's
 * canvas.
 */
export interface BrandTemplateCreateRequest {
  name: string
  width: number
  height: number
  /**
   * A theme layout id that declares `canvasPreset` — the ART DIRECTION the
   * canvas is born under. Absent = the theme's default preset, or `'blank'`
   * when the theme declares none.
   *
   * Only the SERVICE can tell whether an id is a real art direction (it needs
   * the site's theme manifest), so this guard checks the shape and the service
   * checks the meaning — an unknown id is a 400, never a silent fall back to
   * blank. The id is used and then forgotten: it lands as the page's `layout`
   * and as one seeded section, and nothing stores the preset itself.
   */
  layoutId?: string
}

/**
 * A rename, an approval, or a curation change — nothing else. Content lives on
 * the canvas page and is edited through the ordinary block/section endpoints,
 * and the canvas size is fixed at creation, so this request cannot change what
 * renders. Curation is the one apparent exception and is not one: it changes
 * who may change what, never a pixel, which is exactly why it does not bump
 * `version`.
 *
 * Every field is optional; the guard still requires at least one, so an empty
 * PUT is a 400 rather than a no-op write. `customerSettings: null` is a
 * meaningful value (clear the allow-list), not an omission.
 */
export interface BrandTemplateUpdateRequest {
  name?: string
  status?: BrandTemplateStatus
  customerSettings?: BrandTemplateCuration | null
  /** Exact draft tree the author previewed; required when approving. */
  expectedDraftRevision?: string
}

export function isBrandTemplateStatus(value: unknown): value is BrandTemplateStatus {
  return typeof value === 'string' && (BRAND_TEMPLATE_STATUSES as readonly string[]).includes(value)
}

function isTemplateName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= BRAND_TEMPLATE_NAME_MAX_LENGTH
}

export function isBrandTemplateCreateRequest(value: unknown): value is BrandTemplateCreateRequest {
  if (!isRecord(value)) return false
  if (!isTemplateName(value.name)) return false
  if (value.layoutId !== undefined && (typeof value.layoutId !== 'string' || value.layoutId.length === 0)) return false
  return isBrandCanvasDimension(value.width) && isBrandCanvasDimension(value.height)
}

export function isBrandTemplateUpdateRequest(value: unknown): value is BrandTemplateUpdateRequest {
  if (!isRecord(value)) return false
  if (value.name !== undefined && !isTemplateName(value.name)) return false
  if (value.status !== undefined && !isBrandTemplateStatus(value.status)) return false
  if (value.status === 'approved') {
    if (!isCanvasSnapshotRevision(value.expectedDraftRevision)) return false
  } else if (value.expectedDraftRevision !== undefined) {
    return false
  }
  // `null` is the "clear it" instruction and must pass; anything else present
  // has to be a well-formed allow-list, because a malformed one that reached
  // storage would read back as `null` and silently un-curate the template.
  if (
    value.customerSettings !== undefined
    && value.customerSettings !== null
    && !isBrandTemplateCuration(value.customerSettings)
  ) return false
  return value.name !== undefined || value.status !== undefined || value.customerSettings !== undefined
}
