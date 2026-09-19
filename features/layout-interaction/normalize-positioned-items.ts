import type { PositionedItemAuthored } from './types'
import { ITEM_DEFAULTS } from './constants'

export function normalizePositionedItems<T extends Partial<PositionedItemAuthored>>(
  items: readonly T[]
): Array<T & PositionedItemAuthored> {
  return items.map(item => {
    let id = item.id
    if (id === undefined || id === null || id === '') {
      id = globalThis.crypto?.randomUUID?.() ?? `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      // Defensive fallback — persisted ids are guaranteed by migration.
      console.warn('[layout-interaction] normalized item missing id; injected fallback uuid (content audit recommended)')
    }
    return {
      ...item,
      id,
      positionX: item.positionX ?? ITEM_DEFAULTS.positionX,
      positionY: item.positionY ?? ITEM_DEFAULTS.positionY,
      width: item.width ?? ITEM_DEFAULTS.width,
      height: item.height ?? ITEM_DEFAULTS.height,
      rotation: item.rotation ?? ITEM_DEFAULTS.rotation,
      zIndex: item.zIndex ?? ITEM_DEFAULTS.zIndex,
    } as T & PositionedItemAuthored
  })
}
