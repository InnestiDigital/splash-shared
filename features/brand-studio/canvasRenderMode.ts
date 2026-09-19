import { isBrandCanvasRenderPayload } from '~/shared/types/brandRender'
import type { BrandCanvasRenderPayload } from '~/shared/types/brandRender'

/**
 * Brand Content Studio — how the canvas route decides WHAT it is rendering.
 *
 * One SPA route serves two callers, and they hand it work by different means:
 *
 *  1. **The export pipeline.** Headless Chromium writes a
 *     `BrandCanvasRenderPayload` onto `window.__BRAND_RENDER__` before any page
 *     script runs (`brandTemplateRenderService.ts`), so the tree is already in
 *     the document when the route boots — no fetch, no cookies, no auth.
 *  2. **The admin preview iframe.** It has no way to write a window global into
 *     a document it does not control, so it names the template in the query and
 *     the route fetches it back over the admin session it already shares.
 *
 * The two are resolved HERE, as data, so the route's `onMounted` reads as one
 * decision rather than a chain of ifs, and so the decision is testable without
 * a browser.
 */

/** The route the export pipeline navigates to. Mirrors `RENDER_ROUTE` in the render service. */
export const BRAND_CANVAS_ROUTE = '/__preview/brand-canvas'

/** Query keys the admin preview iframe drives the route with. */
export const BRAND_CANVAS_QUERY_KEYS = {
  siteId: 'siteId',
  templateId: 'templateId',
  draft: 'draft',
  presetId: 'presetId',
} as const

export interface BrandCanvasAdminSource {
  siteId: string
  templateId: string
  /** Effective visual Brand Identity preset. Omitted = site/session default. */
  presetId?: string
  /**
   * `?draft=1` — render the canvas page's LIVE tree instead of the approved
   * snapshot, so an author sees what the next approval would capture. Never
   * reachable from the export pipeline: an export renders approvals only.
   */
  draft: boolean
}

export type BrandCanvasRenderMode =
  | { kind: 'payload', payload: BrandCanvasRenderPayload }
  | { kind: 'admin', source: BrandCanvasAdminSource }
  | { kind: 'unresolvable', reason: string }

/** Query values arrive as `string | string[] | null`; only a lone string names anything. */
function firstQueryValue(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate : ''
}

/**
 * `?draft=1` and `?draft=true` opt in; everything else — including `?draft=0`
 * and a bare `?draft` — does not. An unrecognized value must mean "approved
 * snapshot" rather than "draft": rendering the live tree when the caller asked
 * for the approval shows content nobody signed off on.
 */
function isDraftFlag(value: unknown): boolean {
  const raw = firstQueryValue(value)
  return raw === '1' || raw === 'true'
}

/**
 * @param injected  Whatever sits on `window.__BRAND_RENDER__` — `unknown`, by
 *                  contract: the page validates it and never trusts it.
 * @param query     The route's query map (vue-router's `LocationQuery` fits).
 *
 * A payload that is PRESENT but malformed is `unresolvable`, never a fall
 * through to the admin path. Chromium's document has no admin session, so the
 * fetch would either 401 or — worse, if the render browser ever did carry
 * cookies — screenshot a template the request never asked for. "The injector
 * spoke and made no sense" is a bug to report, not a mode to guess past.
 */
export function resolveBrandCanvasMode(
  injected: unknown,
  query: Readonly<Record<string, unknown>>,
): BrandCanvasRenderMode {
  if (injected !== undefined) {
    if (!isBrandCanvasRenderPayload(injected)) {
      return {
        kind: 'unresolvable',
        reason: 'The injected render payload does not match the brand canvas contract.',
      }
    }
    return { kind: 'payload', payload: injected }
  }

  const siteId = firstQueryValue(query[BRAND_CANVAS_QUERY_KEYS.siteId])
  const templateId = firstQueryValue(query[BRAND_CANVAS_QUERY_KEYS.templateId])
  const presetId = firstQueryValue(query[BRAND_CANVAS_QUERY_KEYS.presetId])
  if (siteId.length === 0 || templateId.length === 0) {
    return {
      kind: 'unresolvable',
      reason: 'This route needs an injected render payload, or a ?siteId= and ?templateId= naming a template.',
    }
  }

  return {
    kind: 'admin',
    source: {
      siteId,
      templateId,
      draft: isDraftFlag(query[BRAND_CANVAS_QUERY_KEYS.draft]),
      ...(presetId ? { presetId } : {}),
    },
  }
}
