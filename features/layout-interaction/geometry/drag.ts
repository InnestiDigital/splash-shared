import { clampPosition } from './clamp'
import type { PositionedItemPatch } from '../types'

export function computeDragPatch(args: {
  id: string
  startItem: { positionX: number; positionY: number }
  deltaPx: { x: number; y: number }
  canvasRect: { width: number; height: number }
}): PositionedItemPatch {
  return {
    id: args.id,
    positionX: clampPosition(args.startItem.positionX + (args.deltaPx.x / args.canvasRect.width) * 100),
    positionY: clampPosition(args.startItem.positionY + (args.deltaPx.y / args.canvasRect.height) * 100),
  }
}
