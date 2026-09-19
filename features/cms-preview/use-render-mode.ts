import { computed, type ComputedRef } from 'vue'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'

export type RenderMode = 'editor-preview' | 'public-render'

/**
 * Resolves the current render mode based on the editor↔preview handshake.
 *
 * - `editor-preview`: running inside the CMS preview iframe with the editor connected
 * - `public-render`: running on the public (published) site
 *
 * This resolver lives outside the `layout-interaction` substrate on purpose:
 * the substrate must remain agnostic of preview/editor context. Adopters
 * (blocks) call this to pick the appropriate persistence adapter.
 */
export function useRenderMode(): ComputedRef<RenderMode> {
  const preview = useCmsPreview()
  return computed(() => (preview.isPreviewReady.value ? 'editor-preview' : 'public-render'))
}
