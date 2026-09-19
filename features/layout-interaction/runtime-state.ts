import type { PositionedItemAuthored, PositionedItemRuntime } from './types'

export function deriveRuntimeItems<T extends PositionedItemAuthored>(args: {
  items: T[]
  activeGestureItemId: string | null
  overrideItemIds: Set<string>
}): PositionedItemRuntime<T>[] {
  return args.items.map(item => ({
    ...item,
    motionSuppressionReason:
      args.activeGestureItemId === item.id ? 'active-gesture' as const :
      args.overrideItemIds.has(item.id)    ? 'session-override' as const :
                                             'none' as const,
  }))
}
