import type { PositionedItemPatch } from '../types'

export function computeRotatePatch(args: {
  id: string
  startItem: { rotation: number }
  centerPx: { x: number; y: number }
  startPointerPx: { x: number; y: number }
  pointerPxNow: { x: number; y: number }
}): PositionedItemPatch {
  const angleOf = (p: { x: number; y: number }) =>
    (Math.atan2(p.y - args.centerPx.y, p.x - args.centerPx.x) * 180) / Math.PI
  const delta = angleOf(args.pointerPxNow) - angleOf(args.startPointerPx)
  return { id: args.id, rotation: args.startItem.rotation + delta }
}
