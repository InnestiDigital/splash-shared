import { provide, inject, reactive } from 'vue'

export interface LayoutMeta {
  hasHeader: boolean
  hasFooter: boolean
}

const LAYOUT_META_KEY = Symbol('layoutMeta')

const defaultMeta: LayoutMeta = {
  hasHeader: true,
  hasFooter: true,
}

/**
 * Called by layouts to declare their metadata (what they contain).
 * This is the single source of truth for header/footer visibility.
 */
export function provideLayoutMeta(meta: Partial<LayoutMeta> = {}) {
  const fullMeta = reactive({ ...defaultMeta, ...meta })
  provide(LAYOUT_META_KEY, fullMeta)
  return fullMeta
}

/**
 * Called by preview to read the current layout's metadata.
 * Returns default values if no layout has provided metadata.
 */
export function useLayoutMeta(): LayoutMeta {
  return inject(LAYOUT_META_KEY, defaultMeta)
}
