/**
 * Brand Content Studio — the contract between the render pages and the render
 * services that drive them.
 *
 * Both `/__preview/brand-canvas` and `/__preview/brand-format` paint into a
 * `#brand-stage` element and flag readiness on `<html>` with a
 * `data-brand-<prefix>-ready` / `-error` / `-warnings` triad (`<prefix>` is
 * `canvas` or `format`); `brandTemplateRenderService.ts` and
 * `brandFormatRenderService.ts` (via `brandChromiumCapture.ts`) wait on that
 * same triad from headless Chromium. Before this module the two writers (the
 * pages) and the two readers (the services) each spelled the attribute names
 * out by hand — a rename on one side would silently stop the other side from
 * ever seeing `-ready`, which surfaces as a page that hangs until its timeout
 * rather than one that fails fast with a clear reason.
 */

export const STAGE_ID = 'brand-stage'
export const STAGE_SELECTOR = `#${STAGE_ID}`

export interface RenderStageAttributes {
  ready: string
  error: string
  warnings: string
  /**
   * What the render service waits on: exactly one of `ready="true"` or
   * `error` (any value) lands on `<html>` before the page is considered
   * settled, success or failure.
   */
  readySelector: string
}

export function renderStageAttributes(prefix: 'canvas' | 'format'): RenderStageAttributes {
  const ready = `data-brand-${prefix}-ready`
  const error = `data-brand-${prefix}-error`
  const warnings = `data-brand-${prefix}-warnings`
  return {
    ready,
    error,
    warnings,
    readySelector: `html[${ready}="true"], html[${error}]`,
  }
}
