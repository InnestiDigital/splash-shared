import type { InjectionKey, Ref } from 'vue'
import type { ResolvedLayoutConfig } from '~/shared/types/layout'

/**
 * Injection key for the resolved layout config provided by `LayoutShell`.
 *
 * Components nested inside a `LayoutShell` (Header, Footer, future chrome
 * consumers) read this to apply layout-driven defaults (palette, drawer
 * variant, sticky footer, etc.) without prop-drilling.
 */
export const RESOLVED_LAYOUT_KEY: InjectionKey<Ref<ResolvedLayoutConfig>> = Symbol('resolvedLayout')
