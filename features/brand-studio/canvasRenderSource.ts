import { isBrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import { isBrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import type { BrandCanvasSize, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import { buildCanvasSnapshotCandidate } from '~/shared/features/brand-studio/canvasSnapshot'
import { isRecord } from '~/shared/types/guards'

/**
 * Brand Content Studio — turning what the admin API answered into a tree the
 * canvas route can paint.
 *
 * Both functions here are INGRESS parsers. The route runs in the browser and
 * reads JSON off the network, so "the endpoint returns a `BrandTemplateRecord`"
 * is a fact about today's server build, not about the bytes in hand. Everything
 * the route renders clears a guard first, and anything that does not is
 * reported rather than repaired — a canvas that quietly substituted a default
 * would preview differently from the PNG the same template exports.
 */

/**
 * The slice of a template row the canvas route actually renders with.
 *
 * Deliberately not the whole `BrandTemplateRecord`: the route never renames,
 * approves or deletes anything, so narrowing to what it paints keeps a field it
 * does not use from being able to fail the parse.
 */
export interface BrandCanvasTemplateSource {
  /** The `brand-canvas` page behind the template — the draft tree lives there. */
  pageId: string
  /** The approved tree; `null` until the first approval. */
  snapshot: BrandCanvasSnapshot | null
  /** Authoritative canvas size, straight off the row. The page's meta only mirrors it. */
  canvas: BrandCanvasSize
  /**
   * The site's LIVE shell, resolved server-side by the SAME function the export
   * uses. Not fetched here and not derived from a build default: either would
   * let the iframe paint a theme the PNG cannot reproduce.
   */
  theme: BrandCanvasThemeLayer
  /**
   * The theme resolver's own non-fatal degradations (e.g. a never-published
   * site falling back to the draft shell). Missing or malformed reads as `[]`
   * rather than failing the whole parse — unlike `theme`, an absent warnings
   * list is not itself a reason to distrust the response, only to say nothing
   * where the server would have said something.
   */
  warnings: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * A non-null snapshot that fails the shared guard is read as `null`, not as a
 * parse failure for the whole row: "this build cannot render that approval" is
 * exactly what a null snapshot already means, and the draft arm can still paint
 * the live tree. The caller says so out loud (see the route's warnings).
 *
 * A missing or malformed `theme` is the OPPOSITE call — it fails the whole
 * parse. There is no second source for the shell and no honest degradation
 * available: painting on without one produces a plausible asset in system-ui
 * and default colours, which is the failure this contract exists to remove.
 * `null` here routes to the route's `fail()` path, which is loud.
 */
export function narrowCanvasTemplate(value: unknown): BrandCanvasTemplateSource | null {
  const record = asRecord(value)
  if (!record) return null
  if (typeof record.pageId !== 'string' || record.pageId.length === 0) return null
  if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
  if (!isBrandCanvasThemeLayer(record.theme)) return null

  return {
    pageId: record.pageId,
    snapshot: isBrandCanvasSnapshot(record.snapshot) ? record.snapshot : null,
    canvas: { width: record.width, height: record.height },
    theme: record.theme,
    warnings: Array.isArray(record.warnings) && record.warnings.every(w => typeof w === 'string')
      ? record.warnings
      : [],
  }
}

/**
 * Shapes the canvas page's LIVE draft tree into the snapshot contract, so
 * `?draft=1` renders through the same code path as an approved template.
 *
 * The field-by-field shaping is the shared `canvasSnapshot.ts` core — the
 * same one the server approval serializer compiles through — so a field
 * added on one side and not the other fails the guard rather than painting a
 * tree the approval path would refuse. This module's only job is unwrapping
 * the admin API's envelope into the `sections` / `blocks` arrays that core
 * expects.
 *
 * `null` = the draft is not serializable (a section type this build has no
 * layout for, a placement whose JSON no longer parses). The route then falls
 * back to the approved snapshot and says why, because "your unapproved edits
 * are not shown" is the one thing an author must not have to infer.
 */
export function canvasSnapshotFromDraftPage(
  canvas: BrandCanvasSize,
  page: unknown,
): BrandCanvasSnapshot | null {
  const source = asRecord(page)
  if (!source) return null

  return buildCanvasSnapshotCandidate(canvas, asArray(source.sections), asArray(source.blocks), source)
}

/**
 * `GET /api/admin/s/:siteId/pages/:pageId` answers `{ page }`. Unwrapped here
 * rather than at the call site so the endpoint's envelope is described once.
 */
export function unwrapAdminPage(response: unknown): unknown {
  const record = asRecord(response)
  return record ? record.page : null
}
