export const SPACING_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const
export type SpacingTokenValue = typeof SPACING_TOKENS[number]

export interface TokenSpacing {
  mode: 'token'
  value: SpacingTokenValue
}

export interface CustomSpacing {
  mode: 'custom'
  value: number
  unit: 'px' | 'rem'
}

export type SpacingValue = TokenSpacing | CustomSpacing

export const MAX_WIDTH_TOKENS = ['sm', 'md', 'lg', 'xl'] as const
export type MaxWidthTokenValue = typeof MAX_WIDTH_TOKENS[number]

export interface TokenMaxWidth {
  mode: 'token'
  value: MaxWidthTokenValue
}

export interface CustomMaxWidth {
  mode: 'custom'
  value: number
  unit: 'px' | 'rem'
}

export type MaxWidthValue = TokenMaxWidth | CustomMaxWidth

export const SEMANTIC_COLOR_OPTIONS = ['section', 'transparent', 'surface', 'accent'] as const
export type SemanticColor = typeof SEMANTIC_COLOR_OPTIONS[number] | { custom: string }

/**
 * Block color roles (Phase F). Two axes, one per thing a block paints.
 *
 * Every value resolves to a `--section-*` var, never to `--role-*` directly:
 * a block asking for `accent` gets whatever the ENCLOSING section's scheme
 * already resolved accent to, so flipping a section light→dark re-colors every
 * block inside it for free. Resolving straight to the role tier would ignore
 * the scheme and break that.
 *
 * See `docs/architecture/color-roles-phase-f.md` §2. C2 migrates the block
 * schemas onto these; C1 only defines and resolves them.
 */
export const BACKGROUND_ROLES = ['section', 'surface', 'accent', 'inverse', 'transparent'] as const
export type BackgroundRoleToken = typeof BACKGROUND_ROLES[number]

export const TEXT_ROLES = ['section', 'muted', 'faint', 'accent', 'inverse'] as const
export type TextRoleToken = typeof TEXT_ROLES[number]

/**
 * The `{ custom }` escape is migration-only: writable by the C2 data migration
 * so no authored hex is silently destroyed, readable by the renderer, and
 * deliberately NOT offered in the editor picker. The count of instances still
 * holding one is the burn-down metric for retiring it.
 */
export type BackgroundRole = BackgroundRoleToken | { custom: string }
export type TextRole = TextRoleToken | { custom: string }

export const SHADOW_TOKENS = ['none', 'sm', 'md', 'lg'] as const
export type ShadowToken = typeof SHADOW_TOKENS[number]

// String tokens only — { custom } branch handled separately in the union type
export const BORDER_RADIUS_TOKENS = ['none', 'sm', 'md', 'lg', 'pill'] as const
export type BorderRadiusToken = typeof BORDER_RADIUS_TOKENS[number] | { custom: number; unit: 'px' | 'rem' }

export interface WrapperOverrides {
  borderRadius?: BorderRadiusToken
  shadow?: ShadowToken
  borderColor?: SemanticColor
  backgroundColor?: SemanticColor
}

export const ALIGN_SELF_OPTIONS = ['start', 'center', 'end', 'stretch'] as const
export const WIDTH_MODE_OPTIONS = ['auto', 'content', 'full'] as const
export const WRAPPER_STYLE_OPTIONS = ['none', 'card', 'elevated', 'inset'] as const

export type AlignSelfValue = typeof ALIGN_SELF_OPTIONS[number]
export type WidthModeValue = typeof WIDTH_MODE_OPTIONS[number]

/**
 * Responsive-visibility viewports (SPL — per-breakpoint block visibility).
 *
 * A block whose `hiddenViewports` contains the current viewport's layout mode
 * is not rendered at that breakpoint. Thresholds mirror the shared
 * `BREAKPOINTS` table (mobile < md ≤ tablet < lg ≤ desktop) so the editor's
 * device switcher (desktop / tablet 768 / mobile 375) reflects the same
 * decision the public site makes.
 */
export const VIEWPORT_OPTIONS = ['desktop', 'tablet', 'mobile'] as const
export type ViewportName = typeof VIEWPORT_OPTIONS[number]

/**
 * Auth-state visibility (personalization).
 *
 * 'everyone' (or absent) — always rendered
 * 'auth'                 — rendered only when a visitor auth token is present
 * 'guest'                — rendered only when no auth token is present
 *
 * NOT a security control: both variants ship in the page payload. Page-level
 * gating is `pages.requireAuth`.
 */
export const VISIBLE_TO_OPTIONS = ['everyone', 'auth', 'guest'] as const
export type VisibleTo = typeof VISIBLE_TO_OPTIONS[number]

/**
 * Free-positioned geometry for a top-level block on a brand-canvas page.
 *
 * Coordinates and dimensions are percentages of the owning canvas section.
 * `x` / `y` identify the item's centre, matching the geometry contract used
 * by `shared/features/layout-interaction` (and ScatterCollage). Every field is
 * optional so imported/older content can be normalized with safe defaults.
 */
export interface CanvasBlockGeometry {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  zIndex?: number
  locked?: boolean
}

export const CANVAS_POSITION_BOUNDS = { min: -25, max: 125 } as const
export const CANVAS_SIZE_BOUNDS = { min: 5, max: 150 } as const

/** Runtime guard shared by snapshot ingestion and preview postMessage. */
export function isCanvasBlockGeometry(value: unknown): value is CanvasBlockGeometry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const geometry = value as Record<string, unknown>
  const inBounds = (candidate: unknown, min: number, max: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= min && candidate <= max

  if (geometry.x !== undefined && !inBounds(geometry.x, CANVAS_POSITION_BOUNDS.min, CANVAS_POSITION_BOUNDS.max)) return false
  if (geometry.y !== undefined && !inBounds(geometry.y, CANVAS_POSITION_BOUNDS.min, CANVAS_POSITION_BOUNDS.max)) return false
  if (geometry.width !== undefined && !inBounds(geometry.width, CANVAS_SIZE_BOUNDS.min, CANVAS_SIZE_BOUNDS.max)) return false
  if (geometry.height !== undefined && !inBounds(geometry.height, CANVAS_SIZE_BOUNDS.min, CANVAS_SIZE_BOUNDS.max)) return false
  if (geometry.rotation !== undefined && (typeof geometry.rotation !== 'number' || !Number.isFinite(geometry.rotation))) return false
  if (geometry.zIndex !== undefined && !Number.isSafeInteger(geometry.zIndex)) return false
  return geometry.locked === undefined || typeof geometry.locked === 'boolean'
}

export interface BlockPlacementConfig {
  marginTop?: SpacingValue
  marginBottom?: SpacingValue
  alignSelf?: AlignSelfValue
  widthMode?: WidthModeValue
  maxWidth?: MaxWidthValue
  wrapperStyle?: typeof WRAPPER_STYLE_OPTIONS[number]
  wrapperOverrides?: WrapperOverrides
  /** Viewports at which this block is hidden. Empty/absent = visible everywhere. */
  hiddenViewports?: ViewportName[]
  /** Auth-state visibility. Absent or 'everyone' = everyone. Client-resolved. */
  visibleTo?: VisibleTo
  /** Free-positioned layer geometry, interpreted only by brand-canvas pages. */
  canvas?: CanvasBlockGeometry
}
