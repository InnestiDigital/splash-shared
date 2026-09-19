// Authored: geometry-only contract. Source of truth.
// Adopters attach their own fields via generic parameter. Substrate never
// reads block-specific fields like media/caption/focal/scale.
export type PositionedItemAuthored = {
  id: string
  positionX: number
  positionY: number
  width: number
  height: number
  rotation: number
  zIndex: number
  /** Prevent direct manipulation while keeping the item selectable/rendered. */
  locked?: boolean
}

// Patch: unit of mutation. Produced by gesture + keyboard; consumed by adapters.
export type PositionedItemPatch = {
  id: string
  positionX?: number
  positionY?: number
  width?: number
  height?: number
  rotation?: number
  zIndex?: number
}

export type MotionSuppressionReason = 'none' | 'active-gesture' | 'session-override'

// Runtime shape (composed by adopter). Substrate does not own this type in
// adapter contracts — only in the runtime-state helper output.
export type PositionedItemRuntime<T extends PositionedItemAuthored = PositionedItemAuthored> =
  T & { motionSuppressionReason: MotionSuppressionReason }

export type SessionLayoutOverride = {
  schemaVersion: 1
  configVersion: string | number
  layoutFingerprint: string
  items: Array<{
    id: string
    positionX: number
    positionY: number
  }>
}
