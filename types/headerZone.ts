// shared/types/headerZone.ts

import { BREAKPOINTS } from '../features/cms/composition/responsive'

export type HeaderState =
  | 'expanded'
  | 'transitioning-to-compact'
  | 'compact'
  | 'transitioning-to-expanded'

export interface CompactTrigger {
  unit: 'px' | 'vh'
  value: number
}

export interface HeaderLayoutState {
  gap: number
  padding: number
  justify: 'space-between' | 'center' | 'start'
  contentWidthMode: 'full' | 'fit'
}

export interface ZoneStateConfig {
  scale: number
  offsetX: number
  offsetY: number
  opacity: number
}

export interface ZoneConfig {
  visibleInExpanded: boolean
  visibleInCompact: boolean
  expanded: ZoneStateConfig
  compact: ZoneStateConfig
  transformOrigin: string
  transition: {
    duration: number | null
    easing: string | null
  }
}

export interface ResolvedZoneStyle {
  transform: string
  opacity: number
  pointerEvents: 'auto' | 'none'
  visibility: 'visible' | 'hidden'
}

export interface CompactBackgroundConfig {
  mode: 'pill' | 'shrink-bar' | 'fade'
  borderRadius: number
  targetOpacity: number
  insetPadding: number
}

export type SequenceMode = 'simultaneous' | 'sequenced'

export type LogoPosition = 'left' | 'center' | 'right'

export type HeaderNavigationMode = 'inline' | 'drawer'

/**
 * One navigation entry. `children` is recursive but the header chrome only
 * renders three levels (top bar → dropdown → flyout); anything deeper is
 * ignored rather than clipped, which keeps the schema and the renderers from
 * disagreeing about depth. A parent whose `url` is empty is a heading — it
 * opens its children but navigates nowhere.
 */
export interface NavMenuItem {
  id: string
  label: string
  url: string
  openInNewTab: boolean
  /**
   * Optional: navigation stored before submenus existed has no `children` key,
   * and the header chrome is the boundary that legacy data arrives through.
   * Renderers must use `children?.length`, not `children.length`.
   */
  children?: NavMenuItem[]
}

/** Levels the header chrome actually paints. See NavMenuItem. */
export const NAV_MAX_DEPTH = 3

/**
 * Widest viewport (inclusive) at which the inline header collapses to the
 * burger menu. `BREAKPOINTS.lg` rather than `md`: a section site's ~10-item
 * top bar overflowed every viewport between 769px and tablet-landscape widths
 * when the collapse stopped at `md`. JS source of truth for the collapse
 * decision (repo responsive contract) — HeaderShell's SCSS mirrors it via
 * `$bp-lg`; update both together.
 */
export const INLINE_NAV_COLLAPSE_MAX_WIDTH: number = BREAKPOINTS.lg

export interface DrawerConfig {
  position: 'left' | 'right'
  itemSize: number
  height: string
  width: string
  showBackdrop: boolean
  lockBodyScroll: boolean
}

export interface HeaderShellConfig {
  logoPosition: LogoPosition
  compactTrigger: CompactTrigger
  compactBackground: CompactBackgroundConfig
  expandedLayout: HeaderLayoutState
  compactLayout: HeaderLayoutState
  transitionDuration: number
  transitionEasing: string
  sequenceMode: SequenceMode
  sequenceStagger: number
  sticky: boolean
}

export const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  visibleInExpanded: true,
  visibleInCompact: true,
  expanded: { scale: 1, offsetX: 0, offsetY: 0, opacity: 1 },
  compact: { scale: 1, offsetX: 0, offsetY: 0, opacity: 1 },
  transformOrigin: 'center center',
  transition: { duration: null, easing: null },
}

export const DEFAULT_SHELL_CONFIG: HeaderShellConfig = {
  logoPosition: 'center',
  compactTrigger: { unit: 'px', value: 200 },
  compactBackground: {
    mode: 'pill',
    borderRadius: 24,
    targetOpacity: 0.6,
    insetPadding: 12,
  },
  expandedLayout: { gap: 24, padding: 32, justify: 'space-between', contentWidthMode: 'full' },
  compactLayout: { gap: 12, padding: 16, justify: 'center', contentWidthMode: 'fit' },
  transitionDuration: 300,
  transitionEasing: 'ease-out',
  sequenceMode: 'simultaneous',
  sequenceStagger: 60,
  sticky: true,
}

export const DEFAULT_DRAWER_CONFIG: DrawerConfig = {
  position: 'right',
  itemSize: 32,
  height: '100dvh',
  width: '100vw',
  showBackdrop: true,
  lockBodyScroll: true,
}

export const ZONE_TRANSFORM_ORIGINS: Record<string, string> = {
  logo: 'center center',
  nav: 'left center',
  actions: 'right center',
}

/** Animation order for the canonical header zones. */
export const SEQUENCE_ORDER = ['background', 'logo', 'nav', 'actions'] as const
