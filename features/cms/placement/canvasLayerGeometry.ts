import { BOUNDS_POSITION, BOUNDS_SIZE } from '~/shared/features/layout-interaction/constants'
import { clamp } from '~/shared/features/layout-interaction/geometry/clamp'
import type { PositionedItemAuthored } from '~/shared/features/layout-interaction'
import type { BlockPlacementConfig, CanvasBlockGeometry } from '~/shared/types/placement'

export type CanvasLayerItem = PositionedItemAuthored

export type CompleteCanvasBlockGeometry = Required<CanvasBlockGeometry>

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const DEFAULT_LAYER_OFFSETS = [
  [0, 0],
  [4, 4],
  [-4, 4],
  [4, -4],
  [-4, -4],
  [8, 8],
  [-8, 8],
  [8, -8],
  [-8, -8],
] as const

/**
 * Gives older/unpositioned blocks a stable, centered cascade.
 *
 * The total block count deliberately has no effect: adding or deleting one
 * layer must not move every untouched layer. New insertions persist this full
 * geometry immediately; the fallback remains for older/imported snapshots.
 */
export function defaultCanvasBlockGeometry(index: number, _count = 1): CompleteCanvasBlockGeometry {
  const safeIndex = Math.max(0, Math.trunc(index))
  const offset = DEFAULT_LAYER_OFFSETS[safeIndex % DEFAULT_LAYER_OFFSETS.length]!

  return {
    x: 50 + offset[0],
    y: 50 + offset[1],
    width: 60,
    height: 36,
    rotation: 0,
    zIndex: safeIndex + 1,
    locked: false,
  }
}

export function canvasLayerItem(
  block: { id?: string; _previewId?: string; placement?: BlockPlacementConfig },
  index: number,
  count: number,
): CanvasLayerItem {
  const defaults = defaultCanvasBlockGeometry(index, count)
  const canvas = block.placement?.canvas
  return {
    id: block.id || block._previewId || `canvas-layer-${index}`,
    positionX: clamp(finiteOr(canvas?.x, defaults.x), BOUNDS_POSITION.min, BOUNDS_POSITION.max),
    positionY: clamp(finiteOr(canvas?.y, defaults.y), BOUNDS_POSITION.min, BOUNDS_POSITION.max),
    width: clamp(finiteOr(canvas?.width, defaults.width), BOUNDS_SIZE.min, BOUNDS_SIZE.max),
    height: clamp(finiteOr(canvas?.height, defaults.height), BOUNDS_SIZE.min, BOUNDS_SIZE.max),
    rotation: finiteOr(canvas?.rotation, defaults.rotation),
    // Layer order is structural: later blocks paint above earlier blocks.
    // Ignore legacy gesture-authored zIndex values so the navigation list and
    // the rendered canvas can never disagree about what is in front.
    zIndex: defaults.zIndex,
    locked: canvas?.locked === true,
  }
}

export function canvasGeometryFromItem(item: CanvasLayerItem): CompleteCanvasBlockGeometry {
  return {
    x: item.positionX,
    y: item.positionY,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    zIndex: item.zIndex,
    locked: item.locked === true,
  }
}
