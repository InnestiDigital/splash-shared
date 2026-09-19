import type { PositionedItemAuthored, PositionedItemPatch } from '../types'

export type AdapterContext = {
  blockId: string
  configVersion: string | number
  authoredItems: PositionedItemAuthored[]
  // Precomputed by caller. Single source of truth for invalidation.
  layoutFingerprint: string
}

export interface LayoutPersistenceAdapter<
  TAuthored extends PositionedItemAuthored = PositionedItemAuthored
> {
  hydrate(authored: TAuthored[], context: AdapterContext): TAuthored[]
  preview?(patch: PositionedItemPatch, context: AdapterContext): void
  commit(patch: PositionedItemPatch, context: AdapterContext): Promise<void> | void
  revert?(context: AdapterContext): void
  clearOverrides(context: AdapterContext): void
}
