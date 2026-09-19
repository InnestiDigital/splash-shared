import type { InjectionKey, Ref } from 'vue'

/**
 * Editor-preview interaction contract (SPL: preview/public renderer unification).
 *
 * The editor preview (`/__preview`) renders pages through the SAME
 * `DynamicPage` component as the public site. What differs is selection
 * chrome: hover/selected outlines and click-to-select reporting back to the
 * editor. The preview page provides this contract; `DynamicPage` (and
 * `AnimatedBlockWrapper`) consume it and decorate their output when present.
 * On the public site nothing provides it, so the injection resolves to null
 * and zero preview logic runs.
 */
export interface PreviewInteraction {
  /** Currently selected section/block preview id (editor-side selection). */
  selectedId: Readonly<Ref<string | null>>
  /**
   * Click-to-select handler. Receives the entity's preview id and the raw
   * event; the provider decides interactivity bypasses, propagation and
   * which message to post to the editor.
   */
  onRegionClick: (previewId: string, event: MouseEvent) => void
}

export const PREVIEW_INTERACTION_KEY: InjectionKey<PreviewInteraction> =
  Symbol('cms-preview-interaction')

/** Base class every selection-chrome region carries. */
export const PREVIEW_REGION_CLASS = 'preview-region'

/**
 * Marker for a region whose own element generates NO box.
 *
 * Block chrome is spread onto `AnimatedBlock`, and `AnimatedBlock` renders its
 * wrapper as `display: contents` on purpose: the block's own root must be the
 * section layout's grid/flex child, otherwise every layout that positions roled
 * blocks would be styling a wrapper instead of the block. A boxless element has
 * no border box, which breaks both halves of the selection chrome:
 *
 * - `outline` has nothing to paint, so the browser falls back to the union of
 *   the descendants' fragments — in a two-column section that is one rectangle
 *   spanning both columns, offset from the block it is supposed to mark.
 * - `getBoundingClientRect()` is 0×0 and `scrollIntoView()` lands at the
 *   document origin.
 *
 * So the region declares itself boxless and both the stylesheet
 * (`shared/pages/__preview/index.vue`) and `resolveRegionBox` below decorate /
 * measure the child that does generate a box.
 */
export const PREVIEW_REGION_BOXLESS_CLASS = 'preview-region--boxless'

/** Depth bound for `resolveRegionBox` — nested boxless wrappers are pathological. */
const MAX_BOXLESS_DEPTH = 8

/**
 * Return the element to measure or scroll for a preview region: the region
 * itself, or — when it is boxless — the nearest descendant that has a box.
 *
 * Never returns null: a boxless region with no element child is degenerate, and
 * handing the caller the region back is strictly better than skipping the
 * scroll entirely.
 */
export function resolveRegionBox(region: Element): Element {
  let current = region
  for (let depth = 0; depth < MAX_BOXLESS_DEPTH; depth += 1) {
    if (!current.classList.contains(PREVIEW_REGION_BOXLESS_CLASS)) return current
    const child = current.firstElementChild
    if (!child) return current
    current = child
  }
  return current
}
