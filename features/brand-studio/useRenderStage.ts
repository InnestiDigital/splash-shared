import { nextTick, ref } from 'vue'
import { renderStageAttributes } from '~/shared/features/brand-studio/renderStageContract'

/**
 * Brand Content Studio — what `/__preview/brand-canvas` and
 * `/__preview/brand-format` both needed and used to duplicate: the stage's
 * size binding, deduplicated warnings, the fail-loud settle contract, and the
 * "wait for the stage to actually be paintable" sequence.
 *
 * Before this composable each page carried its OWN copy, and each copy had a
 * bug-fix the other lacked:
 *   - only `brandCanvas.vue` guarded against an EMPTY failure reason (a thrown
 *     `new Error()`) satisfying the ready selector and shipping a
 *     blank-but-successful PNG;
 *   - only `brandCanvas.vue` raced an image `decode()` against a timeout, so a
 *     lazy-loaded image below an iframe's fold could not wedge the document
 *     forever;
 *   - only `brandFormat.vue` force-loaded the render's font families with
 *     `fonts.load()` before waiting on `fonts.ready`, so a face the layout had
 *     only just requested could not lose the readiness race and ship the PNG
 *     in the fallback stack.
 * Both pages now share one implementation, so both inherit all three fixes.
 */

const IMAGE_DECODE_TIMEOUT_MS = 3_000

const STAGE_STYLE_ELEMENT_ID = 'brand-stage-base-style'

/**
 * The unscoped CSS both render pages need byte-for-byte: the stage must sit
 * at the document origin at 1:1 scale with no chrome, no margin and no
 * scrollbar (an element screenshot is exactly width × height ×
 * deviceScaleFactor), a fixed-position Nuxt devtools badge must never end up
 * baked into the composited screenshot, and the error paragraph needs a
 * readable style even though nothing else on the page has one.
 */
const STAGE_BASE_STYLE_CSS = `
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

#brand-stage {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
}

#nuxt-devtools-container,
#nuxt-devtools-anchor,
#nuxt-devtools-inline,
.nuxt-devtools-anchor,
[data-v-inspector-container] {
  display: none !important;
}

.brand-stage__error {
  margin: 0;
  padding: 24px;
  font: 16px/1.4 system-ui, sans-serif;
  color: #a3261a;
  background: #fdecea;
}
`

/**
 * Idempotent: both render pages call this from `onMounted`, and an admin
 * iframe repaint (a second `BRAND_CANVAS_OVERRIDES` message) must not append a
 * second `<style>` tag.
 */
export function installStageBaseStyle(): void {
  if (document.getElementById(STAGE_STYLE_ELEMENT_ID)) return
  const style = document.createElement('style')
  style.id = STAGE_STYLE_ELEMENT_ID
  style.textContent = STAGE_BASE_STYLE_CSS
  document.head.appendChild(style)
}

export interface RenderStageFontToken {
  fontWeight: string
  fontFamily: string
}

export interface RenderStageOutcome {
  error: string | null
  warnings: string[]
}

export interface UseRenderStageOptions {
  /** Selects the `data-brand-<prefix>-*` attribute triad — see `renderStageContract.ts`. */
  stagePrefix: 'canvas' | 'format'
  /** Fired exactly once, when `fail()`/`succeed()` settles the document. */
  onSettled?: (outcome: RenderStageOutcome) => void
}

export function useRenderStage(options: UseRenderStageOptions) {
  const attrs = renderStageAttributes(options.stagePrefix)
  const stageStyle = ref<Record<string, string>>({ width: '0px', height: '0px' })
  const failure = ref<string | null>(null)
  const warnings: string[] = []
  let settled = false

  function setStageSize(width: number, height: number): void {
    stageStyle.value = { width: `${width}px`, height: `${height}px` }
  }

  /**
   * Deduplicated: the admin canvas arm repaints on every override message,
   * and a standing degradation (an unregistered block type, a missing image)
   * is true of every one of those frames. Ten copies of one line reads like
   * ten problems.
   */
  function warn(message: string): void {
    if (!warnings.includes(message)) warnings.push(message)
  }

  function flushWarnings(): void {
    if (warnings.length === 0) return
    document.documentElement.setAttribute(attrs.warnings, JSON.stringify(warnings))
  }

  /**
   * The render service reads the error attribute as "an error iff its length
   * > 0", so an empty reason (a thrown `new Error()`) would satisfy the ready
   * selector, report no error, and let a failed stage be screenshotted as a
   * blank-but-successful PNG. A failure must always carry a readable reason —
   * and, once settled, a later call (a stray event, a second catch on the
   * same failure) must not overwrite it.
   */
  function fail(message: string): void {
    if (settled) return
    settled = true
    const reason = message.length > 0 ? message : 'The stage failed to render for an unreported reason.'
    failure.value = reason
    flushWarnings()
    document.documentElement.setAttribute(attrs.error, reason)
    options.onSettled?.({ error: reason, warnings: [...warnings] })
  }

  function succeed(): void {
    if (settled) return
    settled = true
    flushWarnings()
    document.documentElement.setAttribute(attrs.ready, 'true')
    options.onSettled?.({ error: null, warnings: [...warnings] })
  }

  /**
   * A single image must not be able to wedge the document. Chromium has its
   * own page timeout, but the admin iframe has none — a `decode()` that never
   * settles (an image below a scaled iframe's fold that lazy-loading never
   * requests) would leave the panel waiting on a ready message forever.
   */
  async function decodeImage(image: HTMLImageElement): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), IMAGE_DECODE_TIMEOUT_MS)
    })
    try {
      const outcome = await Promise.race([image.decode().then(() => 'decoded' as const), deadline])
      if (outcome === 'timeout') {
        warn(`Image did not finish loading in time: ${image.getAttribute('src') ?? '(no src)'}`)
      }
    } catch {
      warn(`Image failed to load: ${image.getAttribute('src') ?? '(no src)'}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Forces the render's declared font families to load BEFORE waiting on
   * `fonts.ready`. Without this the ready signal can win the race against a
   * face the layout has only just requested, and the PNG ships in the
   * fallback family.
   */
  async function preloadFonts(tokens: readonly RenderStageFontToken[]): Promise<void> {
    await Promise.all(tokens.map(async (token) => {
      try {
        await document.fonts.load(`${token.fontWeight} 100px ${token.fontFamily}`)
      } catch (error: unknown) {
        // A family the browser cannot parse is a brand-config problem, not a
        // render failure — the stage still paints in the fallback stack.
        const reason = error instanceof Error ? error.message : String(error)
        warn(`Could not preload "${token.fontFamily}": ${reason}`)
      }
    }))
  }

  /**
   * A blank frame is the failure mode an author cannot diagnose, so readiness
   * is observed rather than assumed: two animation frames for layout and
   * block `onMounted` work, every image decoded (or timed out), the declared
   * fonts force-loaded, then the font set settled. Nothing here can reject —
   * a missing asset degrades the stage, it does not invalidate it — but
   * everything that degrades is recorded.
   *
   * @param fontsToPreload  Tokens to force-load before `fonts.ready`. BOTH
   *   pages supply them: the compiled-format page from its render tokens, the
   *   canvas page from the families its theme layer declares `@font-face`
   *   rules for (`canvasFontPreloadTokens`). An empty list is legitimate — a
   *   theme that bundles no faces — and then `fonts.ready` alone decides.
   */
  async function settleStage(stage: HTMLElement, fontsToPreload: readonly RenderStageFontToken[] = []): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    await Promise.all(Array.from(stage.querySelectorAll('img')).map(decodeImage))

    if (fontsToPreload.length > 0) await preloadFonts(fontsToPreload)

    try {
      await document.fonts.ready
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error)
      warn(`Could not wait for fonts to settle: ${reason}`)
    }

    await nextTick()
  }

  return { stageStyle, failure, setStageSize, warn, fail, succeed, settleStage }
}
