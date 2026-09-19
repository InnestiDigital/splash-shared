import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type {
  HandleKind,
  PositionedItemAuthored,
} from '~/shared/features/layout-interaction'

export interface CanvasLayerContext {
  /**
   * The positioned layers, or an empty list when free placement is off at this
   * tier — a `collapse: "stack"` layered slot on mobile. `PlacementWrapper`
   * finds no item for its block and falls back to normal flow, which is what
   * turns the layered slot into an ordinary column with no second code path.
   */
  items: ComputedRef<PositionedItemAuthored[]>
  selectedItemId: Ref<string | null>
  activeGestureItemId: Ref<string | null>
  interactive: boolean
  onPointerDownItem: (event: PointerEvent, itemId: string) => void
  onPointerDownHandle: (event: PointerEvent, itemId: string, kind: HandleKind) => void
}

export const CANVAS_LAYER_CONTEXT: InjectionKey<CanvasLayerContext> =
  Symbol('canvasLayerContext')
