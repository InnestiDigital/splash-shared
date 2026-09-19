import type { BackgroundRole } from '~/shared/types/placement'

// ── Roles ──

export type CompositionRole =
  | 'primary-media'
  | 'secondary-media'
  | 'headline'
  | 'body'
  | 'caption'
  | 'eyebrow'
  | 'ornament'
  | 'meta'

// ── Media Reference ──

export interface CompositionMediaRef {
  src: string
  alt?: Record<string, string>
  focalPoint?: { x: number; y: number }
  aspectHint?: number
}

// ── Item ──

export type Emphasis = 'sm' | 'md' | 'lg'

export interface CompositionItem {
  id: string
  role: CompositionRole
  visible: boolean
  emphasis: Emphasis
  textContent?: Record<string, string>
  media?: CompositionMediaRef
}

// ── Knobs ──

export type Dominance = 'media' | 'balanced' | 'text'
export type OverlapLevel = 'tight' | 'normal' | 'spacious'
export type Alignment = 'left' | 'balanced' | 'right'
export type Density = 'airy' | 'normal' | 'dense'

export interface CompositionKnobs {
  dominance: Dominance
  overlap: OverlapLevel
  alignment: Alignment
  density: Density
}

// ── Layout Groups ──
// Groups are containers that hold roles in flow (flex-column).
// The solver positions groups on the canvas. CSS handles stacking within groups.

export interface LayoutGroup {
  id: string                              // e.g. 'text-stack', 'media-cluster'
  anchor: 'canvas' | string              // canvas or another group id
  region: Region
  baseSize: { w: number }                // width as fraction of canvas
  roles: CompositionRole[]               // ordered, rendered top-to-bottom in flex-column
  layer: number
  overflowPolicy: OverflowPolicy
  emphasisScale: { sm: number; md: number; lg: number }
}

// ── Floating Items ──
// Items not in any group — individually placed by solver (captions, ornaments)

export interface FloatingPlacement {
  anchor: string                          // group id (not canvas — floaters always anchor to a group)
  region: Region
  sizeMode: 'fixed' | 'aspect-ratio' | 'intrinsic-text'
  baseSize: { w: number; h?: number; aspect?: number }
  overlap: { x: number; y: number }      // percentage of own width
  layer: number
  emphasisScale: { sm: number; md: number; lg: number }
  overflowPolicy: OverflowPolicy
}

// ── Shared ──

export type Region =
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'center' | 'left' | 'right' | 'top' | 'bottom'

export type OverflowPolicy = 'clamp' | 'allow'
export type SizeMode = 'fixed' | 'aspect-ratio' | 'intrinsic-text'

// ── Responsive ──

export interface TabletRule {
  scaleSize?: number
  collapseOverlap?: boolean
  shiftRegion?: Region
}

export interface ResponsiveRules {
  stackBelow: number
  tablet?: Partial<Record<string, TabletRule>>  // keyed by group id or floating role name
  stackOrder: CompositionRole[]
  hideOnStack?: CompositionRole[]
}

// ── Role Definition ──

export interface RoleDefinition {
  required: boolean
  min?: number
  max?: number
  contentType: 'media' | 'text' | 'either'
  defaultEmphasis: Emphasis
}

// ── Template ──

export interface CompositionTemplate {
  id: string
  label: Record<string, string>
  description: Record<string, string>
  defaultHeight: 'auto' | 'viewport' | 'large' | 'medium'
  roles: Record<string, RoleDefinition>
  groups: LayoutGroup[]                   // ordered groups (solver respects dependency order)
  floaters: Record<string, FloatingPlacement>  // keyed by role name
  responsive: ResponsiveRules
  // Art direction defaults
  defaultKnobs: CompositionKnobs
  defaultTypographySlots?: Record<string, string>  // role → typography preset key
  defaultMediaAspect?: Record<string, number>       // role → recommended aspect ratio
}

// ── Solver Output ──

export interface ResolvedRect {
  left: string
  top: string
  width: string
  height: string
  zIndex: number
}

export type ResolvedLayout = Record<string, ResolvedRect>  // keyed by group id or item id

// ── Block Settings ──

export interface EditorialCompositionSettings {
  templateId: string
  items: CompositionItem[]
  knobs: CompositionKnobs
  height: 'auto' | 'viewport' | 'large' | 'medium'
  background?: BackgroundRole
}

// ── Defaults ──

export const DEFAULT_KNOBS: CompositionKnobs = {
  dominance: 'balanced',
  overlap: 'normal',
  alignment: 'balanced',
  density: 'normal',
}

export const DEFAULT_EMPHASIS_SCALE = { sm: 0.7, md: 1.0, lg: 1.3 }
