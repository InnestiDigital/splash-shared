import type { InjectionKey, Ref } from 'vue'

/**
 * Injection keys for threading identity + version context from the page
 * renderer (DynamicPage / AnimatedBlockWrapper) into individual block
 * components that adopt the layout-interaction substrate (e.g. ScatterCollage).
 *
 * - `LAYOUT_INTERACTION_BLOCK_ID`: per-block stable id used as the session key
 *   namespace. Provided inside `AnimatedBlockWrapper` for each block.
 * - `LAYOUT_INTERACTION_CONFIG_VERSION`: published configVersion used for
 *   override invalidation. Provided once at the page level.
 *
 * Consumers should tolerate `undefined` (e.g. standalone tests) and fall back
 * to their own prop values or defaults.
 */
export const LAYOUT_INTERACTION_BLOCK_ID: InjectionKey<Ref<string> | string> =
  Symbol('layoutInteractionBlockId')

export const LAYOUT_INTERACTION_CONFIG_VERSION: InjectionKey<
  Ref<string | number | undefined> | string | number | undefined
> = Symbol('layoutInteractionConfigVersion')
