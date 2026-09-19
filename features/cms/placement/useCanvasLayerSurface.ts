// shared/features/cms/placement/useCanvasLayerSurface.ts
//
// The free-placement surface, as one composable.
//
// Two adopters, one implementation: `CanvasSectionLayout` (a whole brand-canvas
// page section) and `SlotFlowLayered` (one `flow: "layered"` slot inside an
// ordinary section). Both need the same five things — authored geometry from
// `placement.canvas`, a layout fingerprint, a persistence adapter chosen by
// render mode, the interaction substrate, and `CANVAS_LAYER_CONTEXT` provided so
// the `PlacementWrapper`s beneath can position themselves — and neither should
// own a private copy of them.
//
// Contract: docs/architecture/section-layout-engine-contract.md §7.

import { computed, inject, provide, unref, watch, type ComputedRef, type Ref } from 'vue'
import type { ResolvedBlock } from '~/shared/types/sectionTypes'
import type { LayoutPersistenceAdapter } from '~/shared/features/layout-interaction/persistence/adapter'
import {
  computeLayoutFingerprint,
  LAYOUT_INTERACTION_CONFIG_VERSION,
  useInteractivePositioning,
  type PositionedItemAuthored,
  type UseInteractivePositioningReturn,
} from '~/shared/features/layout-interaction'
import { useKeyboardPositioning } from '~/shared/features/layout-interaction/controllers/use-keyboard-positioning'
import { createEditorPreviewAdapter } from '~/shared/features/layout-interaction/persistence/editor-preview-adapter'
import { useRenderMode } from '~/shared/features/cms-preview/use-render-mode'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import { PREVIEW_INTERACTION_KEY } from '~/shared/features/cms/previewInteraction'
import { CANVAS_LAYER_CONTEXT } from './canvasLayerContext'
import { canvasGeometryFromItem, canvasLayerItem } from './canvasLayerGeometry'

export interface CanvasLayerSurfaceOptions {
  /** Identity for the persistence adapter's context — the owning section id. */
  surfaceId: string
  /** The blocks this surface positions, already in authored order. */
  blocks: ComputedRef<ResolvedBlock[]>
  /** The element gestures are measured against. */
  canvasEl: Ref<HTMLElement | null>
  /**
   * Whether free placement is live at the current tier.
   *
   * A `collapse: "stack"` layered slot at the floor tier answers `false`: the
   * provided context then reports no items, every `PlacementWrapper` beneath
   * falls back to normal flow, and the blocks stack in position order. The
   * substrate stays wired either way — this flips with the viewport, and tearing
   * an engine down on a resize would drop the editor's selection with it.
   */
  positioned?: ComputedRef<boolean>
  /** Arrow-key nudging. Off for surfaces where the keys mean something else. */
  keyboard?: boolean
}

export interface CanvasLayerSurface {
  /** True in editor preview: drag / resize / rotate and the commit chain are live. */
  interactive: boolean
  substrate: UseInteractivePositioningReturn<PositionedItemAuthored>
  onPointerDownCanvas: (event: PointerEvent) => void
}

export function blockIdOf(resolved: ResolvedBlock): string {
  return resolved.block?.id || resolved.block?._previewId || ''
}

export function useCanvasLayerSurface(options: CanvasLayerSurfaceOptions): CanvasLayerSurface {
  const { surfaceId, blocks, canvasEl } = options

  const authored = computed<PositionedItemAuthored[]>(() =>
    blocks.value.map((resolved, index) => canvasLayerItem(resolved.block, index, blocks.value.length)),
  )
  const fingerprint = computed(() => computeLayoutFingerprint(authored.value))

  const mode = useRenderMode()
  const interactive = mode.value === 'editor-preview'
  const cms = useCmsPreview()
  const previewInteraction = inject(PREVIEW_INTERACTION_KEY, null)
  const injectedConfigVersion = inject(LAYOUT_INTERACTION_CONFIG_VERSION, undefined)

  let substrate: UseInteractivePositioningReturn<PositionedItemAuthored>
  let adapter: LayoutPersistenceAdapter<PositionedItemAuthored>

  if (interactive) {
    adapter = createEditorPreviewAdapter((patch) => {
      const item = substrate.positionedItems.value.find(candidate => candidate.id === patch.id)
      if (item) cms.notifyCanvasBlockPlacementPatch(item.id, canvasGeometryFromItem(item))
    })
  } else {
    adapter = {
      hydrate: items => [...items],
      commit: () => {},
      clearOverrides: () => {},
    }
  }

  substrate = useInteractivePositioning({
    items: authored,
    adapter,
    capabilities: {
      drag: interactive,
      resize: interactive,
      rotate: interactive,
      selection: interactive,
    },
    context: {
      blockId: surfaceId,
      configVersion: (unref(injectedConfigVersion) as string | number | undefined) ?? 'cv-unknown',
      authoredItems: authored.value,
      layoutFingerprint: fingerprint.value,
    },
    canvasEl,
  })

  if (interactive && previewInteraction) {
    // Keep direct-manipulation handles aligned with the editor's canonical
    // selection (NavigationTree/settings panel), not only pointer selection
    // made inside this private substrate.
    watch(previewInteraction.selectedId, (selectedId) => {
      const isLayer = selectedId !== null && blocks.value.some(
        resolved => blockIdOf(resolved) === selectedId,
      )
      substrate.selectItem(isLayer ? selectedId : null)
    }, { immediate: true })
  }

  if (interactive && options.keyboard !== false) {
    useKeyboardPositioning({
      selectedItemId: substrate.selectedItemId,
      items: substrate.positionedItems,
      applyPatch: substrate.applyPatch,
      blockRootEl: canvasEl,
    })
  }

  const positioned = options.positioned
  const items = computed(() =>
    positioned && !positioned.value ? [] : substrate.positionedItems.value,
  )

  provide(CANVAS_LAYER_CONTEXT, {
    items,
    selectedItemId: substrate.selectedItemId,
    activeGestureItemId: substrate.activeGestureItemId,
    interactive,
    onPointerDownItem: substrate.onPointerDownItem,
    onPointerDownHandle: substrate.onPointerDownHandle,
  })

  return {
    interactive,
    substrate,
    onPointerDownCanvas: (event: PointerEvent) => {
      if (positioned && !positioned.value) return
      substrate.onPointerDownCanvas(event)
    },
  }
}
