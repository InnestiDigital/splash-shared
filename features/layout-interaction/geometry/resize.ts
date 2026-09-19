import { clampSize } from './clamp'
import type { PositionedItemPatch } from '../types'

export type ResizeKind = 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se'

export function computeResizePatch(args: {
  id: string
  kind: ResizeKind
  startItem: { positionX: number; positionY: number; width: number; height: number }
  pointerPctNow: { x: number; y: number }
}): PositionedItemPatch {
  const { startItem: s, pointerPctNow: p, kind, id } = args
  const left = s.positionX - s.width / 2
  const right = s.positionX + s.width / 2
  const top = s.positionY - s.height / 2
  const bottom = s.positionY + s.height / 2

  const anchorX = kind === 'resize-nw' || kind === 'resize-sw' ? right : left
  const anchorY = kind === 'resize-nw' || kind === 'resize-ne' ? bottom : top
  const dragDirX = kind === 'resize-nw' || kind === 'resize-sw' ? -1 : 1
  const dragDirY = kind === 'resize-nw' || kind === 'resize-ne' ? -1 : 1

  const newWidth = clampSize(Math.abs(p.x - anchorX))
  const newHeight = clampSize(Math.abs(p.y - anchorY))
  const newCenterX = anchorX + dragDirX * (newWidth / 2)
  const newCenterY = anchorY + dragDirY * (newHeight / 2)

  return { id, width: newWidth, height: newHeight, positionX: newCenterX, positionY: newCenterY }
}
