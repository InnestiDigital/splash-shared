import { CANVAS_POSITION_BOUNDS, CANVAS_SIZE_BOUNDS } from '~/shared/types/placement'

export const SCHEMA_VERSION = 1 as const
export const BOUNDS_POSITION = CANVAS_POSITION_BOUNDS
export const BOUNDS_SIZE = CANVAS_SIZE_BOUNDS
export const THRESHOLD_PX = 4 as const

// Defensive defaults for normalize-positioned-items. Used only when content
// is missing a numeric field entirely (corrupted content, out-of-band imports).
// Schema-level defaults are the normal path; these are a safety net.
export const ITEM_DEFAULTS = {
  positionX: 50, positionY: 50,
  width: 30, height: 30,
  rotation: 0, zIndex: 1,
} as const
