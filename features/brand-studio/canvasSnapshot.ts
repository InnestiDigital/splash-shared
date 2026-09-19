import { BRAND_CANVAS_REVEAL_PRESET, isBrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasSize, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import { isRecord } from '~/shared/types/guards'

/**
 * Brand Content Studio — the ONE field-mapping core that turns a draft tree
 * (sections + blocks, from EITHER origin below) into the snapshot contract.
 *
 * Two callers compile through this:
 *  - the server approval serializer (`canvasSnapshotService.ts`), reading a
 *    validated `Section[]` / `Block[]` off the repository;
 *  - the client `?draft=1` preview (`canvasRenderSource.ts`), reading the
 *    same shape off admin-API JSON it has not yet trusted.
 *
 * Both inputs are accepted as `unknown` here rather than as their respective
 * typed shapes: a `Section` row is already a plain object, so passing one in
 * costs nothing, and it is what lets a single field list serve a caller that
 * has NOT narrowed its input yet. This module does no storage I/O, so it is
 * safe for both a Nitro server file and a browser bundle to import.
 *
 * Two things are DECIDED rather than copied, on both paths:
 *
 *  1. **The canvas size comes from the caller** (the template ROW), never
 *     from a page's own `meta.brandCanvas` mirror — the mirror exists so the
 *     editor can draw a frame before any template row is fetched.
 *  2. **Motion is pinned off.** A canvas is captured in one frame that never
 *     scrolls, so a section that copied its live `revealPreset` would export
 *     at `opacity: 0` — a blank asset that looks like a render bug.
 *
 * Everything else is verbatim: a snapshot must never invent a value the
 * source tree did not contain.
 */

function toSnapshotSection(value: unknown): unknown {
  if (!isRecord(value)) return null

  return {
    id: value.id,
    name: value.name,
    position: value.position,
    sectionType: value.sectionType,
    anchor: value.anchor ?? null,
    isHidden: value.isHidden,
    colorScheme: value.colorScheme,
    sectionRole: value.sectionRole ?? null,
    containerMode: value.containerMode,
    sectionSpaceY: value.sectionSpaceY,
    containerInsetX: value.containerInsetX,
    // Pinned, not copied — see the module comment.
    revealPreset: BRAND_CANVAS_REVEAL_PRESET,
    revealOverrides: null,
    defaultBlockEntrance: null,
    layoutConfig: value.layoutConfig ?? null,
  }
}

function toSnapshotBlock(value: unknown): unknown {
  if (!isRecord(value)) return null

  return {
    id: value.id,
    type: value.type,
    position: value.position,
    sectionId: value.sectionId ?? null,
    layoutRole: value.layoutRole ?? null,
    settings: value.settings,
    options: value.options ?? null,
    // `undefined` (the source declares no placement) becomes the snapshot's
    // explicit null so a missing key can never read as "not sent".
    placement: value.placement ?? null,
  }
}

/**
 * Assembles the full candidate and clears it through the wire guard.
 *
 * `null` = the tree does not satisfy the snapshot contract (a section type
 * no renderer has a layout for, a placement whose JSON no longer parses, a
 * canvas size outside the render bounds). Reported by the caller, never
 * repaired here: a snapshot with substituted values would export an asset
 * nobody approved.
 */
export function buildCanvasSnapshotCandidate(
  canvas: BrandCanvasSize,
  sections: readonly unknown[],
  blocks: readonly unknown[],
  page?: { layout?: unknown; meta?: unknown },
): BrandCanvasSnapshot | null {
  // Per-page layout settings live at `meta.layoutOverrides` on a page row —
  // the same key `useResolvedLayout` reads on the site. Anything that is not
  // a plain record reads as null (no overrides), never as a repaired value.
  const meta = isRecord(page?.meta) ? page.meta : null
  const layoutOverrides = meta && isRecord(meta.layoutOverrides) ? meta.layoutOverrides : null

  const candidate: unknown = {
    canvas: { width: canvas.width, height: canvas.height },
    // The canvas PAGE's layout choice, like a site page's — captured at
    // approval. Anything that is not a non-empty string reads as null, which
    // the renderer treats as the chrome-free blank layout.
    layout: typeof page?.layout === 'string' && page.layout.length > 0 ? page.layout : null,
    layoutOverrides,
    sections: sections.map(toSnapshotSection),
    blocks: blocks.map(toSnapshotBlock),
  }

  return isBrandCanvasSnapshot(candidate) ? candidate : null
}
