import type { InjectionKey, ComputedRef } from 'vue'
import type { AnimationEngine, MotionHints } from '~/shared/types/animation'

interface BlockEngineContext {
  /** Returns true if the engine has ≥1 active scene targeting `part` for this block. */
  hasActiveScenesFor(part: string): boolean
}

export const BLOCK_ENGINE_CONTEXT_KEY: InjectionKey<BlockEngineContext> =
  Symbol('block-engine-context')

/**
 * Provide/inject key for the AnimationEngine instance.
 * Used by AnimationEngineProvider (provide) and AnimatedBlock (inject).
 */
export const ENGINE_KEY: InjectionKey<AnimationEngine> = Symbol('animation-engine')

/**
 * Provide/inject key for nested motion hints from a parent container block.
 * Used by HorizontalScroll (provide) and AnimatedBlock (inject).
 *
 * When a block is nested inside a container with a non-standard scroll context
 * (e.g. horizontal overflow), the container provides hints that override or
 * supplement the child block's own motionHints:
 * - `intersectionRoot`: passed to IO constructor as { root } so off-screen items are correctly observed
 * - `disabledTriggerTypes`: engine skips adapters whose trigger type appears in this list
 *
 * Inject returns `null` outside a providing container — AnimatedBlock falls back
 * to its own props.motionHints with no change in behaviour.
 */
export const NESTED_MOTION_HINTS_KEY: InjectionKey<ComputedRef<Partial<MotionHints>>> =
  Symbol('nested-motion-hints')

/**
 * Custom DOM event name dispatched by blocks with dynamic children
 * (carousels, accordions, etc.) when their internal DOM targets change.
 *
 * Dispatch from any block:
 * ```ts
 * el.dispatchEvent(new CustomEvent(ANIMATION_TARGETS_CHANGED, {
 *   bubbles: true,
 *   detail: { blockId },
 * }))
 * ```
 *
 * AnimatedBlock listens for this event and re-queries targets + refreshes the engine.
 */
export const ANIMATION_TARGETS_CHANGED = 'animation-targets-changed'

// ---------------------------------------------------------------------------
// Performance guardrails
// ---------------------------------------------------------------------------

/** Maximum items in a stagger group before truncation. */
export const MAX_STAGGER_ITEMS = 50

/** Maximum IntersectionObservers (or equivalent) per page. */
export const MAX_OBSERVERS_PER_PAGE = 50

/** Number of scenes to set up per RAF frame during progressive loading. */
export const SCENE_BATCH_SIZE = 10
