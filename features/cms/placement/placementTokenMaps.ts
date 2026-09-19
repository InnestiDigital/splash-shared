// shared/features/cms/placement/placementTokenMaps.ts
import type {
  SpacingValue, MaxWidthValue, ShadowToken,
  BorderRadiusToken, SemanticColor,
  BackgroundRole, TextRole,
} from '~/shared/types/placement'

export const SPACING_TOKEN_MAP: Record<string, string> = {
  none: '0',
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '2rem',
  xl: '4rem',
}

export const MAX_WIDTH_TOKEN_MAP: Record<string, string> = {
  sm: '480px',
  md: '640px',
  lg: '960px',
  xl: '1200px',
}

export const SHADOW_TOKEN_MAP: Record<string, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
  lg: '0 8px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.12)',
}

export const BORDER_RADIUS_TOKEN_MAP: Record<string, string> = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '16px',
  pill: '9999px',
}

export function resolveSpacing(value: SpacingValue): string {
  if (value.mode === 'token') return SPACING_TOKEN_MAP[value.value] ?? '0'
  return `${value.value}${value.unit}`
}

export function resolveMaxWidth(value: MaxWidthValue): string {
  if (value.mode === 'token') return MAX_WIDTH_TOKEN_MAP[value.value] ?? 'none'
  return `${value.value}${value.unit}`
}

export function resolveShadow(token: ShadowToken): string {
  return SHADOW_TOKEN_MAP[token] ?? 'none'
}

export function resolveBorderRadius(value: BorderRadiusToken): string {
  if (typeof value === 'string') return BORDER_RADIUS_TOKEN_MAP[value] ?? '0'
  return `${value.custom}${value.unit}`
}

export function resolveSemanticColor(color: SemanticColor): string {
  if (typeof color === 'object') return color.custom
  return BACKGROUND_ROLE_MAP[color] ?? 'transparent'
}

/**
 * Background/text role → the `--section-*` var it paints with.
 *
 * Two maps rather than one because the axes disagree on shared names:
 * `section` means the scheme's background on one axis and its text color on
 * the other, and `inverse` splits into two vars. A single lookup keyed only by
 * the token would have to guess.
 *
 * `resolveSemanticColor` shares the background map — `SemanticColor`'s four
 * members are a subset of `BACKGROUND_ROLES` and resolve identically, so
 * `WrapperOverrides` and block backgrounds cannot drift apart.
 */
const BACKGROUND_ROLE_MAP: Record<string, string> = {
  section: 'var(--section-bg)',
  surface: 'var(--section-surface)',
  accent: 'var(--section-accent)',
  inverse: 'var(--section-inverse-bg)',
  transparent: 'transparent',
}

const TEXT_ROLE_MAP: Record<string, string> = {
  section: 'var(--section-text)',
  muted: 'var(--section-text-muted)',
  faint: 'var(--section-text-faint)',
  accent: 'var(--section-accent)',
  inverse: 'var(--section-inverse-text)',
}

export function resolveBackgroundRole(role: BackgroundRole): string {
  if (typeof role === 'object') return role.custom
  return BACKGROUND_ROLE_MAP[role] ?? 'transparent'
}

export function resolveTextRole(role: TextRole): string {
  if (typeof role === 'object') return role.custom
  return TEXT_ROLE_MAP[role] ?? 'var(--section-text)'
}
