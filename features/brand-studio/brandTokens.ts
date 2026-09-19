import { normalizeHex } from '~/shared/features/brand-studio/surface'
import {
  BRAND_RENDER_TOKENS_FALLBACK,
  type BrandFontToken,
  type BrandRenderTokens,
} from '~/shared/types/brandFormat'
import type { BrandIdentity } from '~/shared/types/brand'

/**
 * Brand contract → render tokens, resolved ONCE and shared.
 *
 * The only caller is `server/services/brand/brandRenderTokens.ts`, which does
 * the I/O around it and is itself the single entry point for both the headless
 * render pipeline and `GET /brand-identity` (the studio's tokens). The admin
 * studio used to call this directly over its own reads; it no longer resolves
 * anything, so the exported PNG cannot drift from the on-screen preview — the
 * single thing slice 3 exists to prevent.
 *
 * Kept in `shared/` (rather than moved under `server/`) because the render
 * payload types it produces are shared contract, and because it is pure +
 * synchronous + free of `import.meta.glob`, which is what lets `server/` import
 * it at all (a `server/` file that transitively pulls a glob module crashes
 * Nitro's dev cold boot with `_importMeta_.glob is not a function`).
 */

/** Shape the typography preset DB row satisfies. */
export interface BrandTypographyPresetRow {
  key: string
  isActive?: boolean
  fontFamily?: string | null
  fontWeight?: string | number | null
  letterSpacing?: string | null
  textTransform?: string | null
  lineHeight?: string | number | null
}

/** Shape the typography role → preset mapping row satisfies. */
export interface BrandTypographyRoleRow {
  role: string
  presetKey: string
}

export interface BrandTokenBuild {
  tokens: BrandRenderTokens
  /** Non-fatal degradations. Surfaced to the author, never swallowed. */
  warnings: string[]
}

/** Coerces a stored setting to a CSS string, falling back on empty/non-scalar. */
export function asCssString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function fontTokenFor(
  role: string,
  presetsByKey: ReadonlyMap<string, BrandTypographyPresetRow>,
  roleToPreset: ReadonlyMap<string, string>,
  warnings: string[],
): BrandFontToken {
  const presetKey = roleToPreset.get(role)
  const preset = presetKey === undefined ? undefined : presetsByKey.get(presetKey)
  if (!preset) {
    warnings.push(
      `Typography role "${role}" is not mapped to an active preset — formats fall back to system type.`,
    )
    return BRAND_RENDER_TOKENS_FALLBACK.headline
  }
  return {
    fontFamily: asCssString(preset.fontFamily, BRAND_RENDER_TOKENS_FALLBACK.headline.fontFamily),
    fontWeight: asCssString(preset.fontWeight, '400'),
    letterSpacing: asCssString(preset.letterSpacing, '0em'),
    textTransform: asCssString(preset.textTransform, 'none'),
    lineHeight: asCssString(preset.lineHeight, '1.2'),
  }
}

/**
 * Resolve the brand contract's ROLE KEYS into concrete render tokens.
 *
 * @param identity              the site's brand contract (palette fields hold
 *                              theme-setting ids, typography fields hold system
 *                              role names — never literal values).
 * @param resolvedThemeSettings output of `resolveThemeSettings(schema, stored)`.
 * @param presets               typography presets (inactive ones are ignored).
 * @param roles                 role → preset-key mapping.
 *
 * Colour parsing happens here, at the boundary, exactly once: every downstream
 * legibility decision (dark/light polarity, accent contrast) needs a luminance,
 * so a value that is not parseable hex is refused with a visible warning rather
 * than smuggled through to be silently mis-classified as "light".
 */
export function buildBrandRenderTokens(
  identity: BrandIdentity,
  resolvedThemeSettings: Record<string, unknown>,
  presets: readonly BrandTypographyPresetRow[],
  roles: readonly BrandTypographyRoleRow[],
): BrandTokenBuild {
  const warnings: string[] = []

  const colour = (roleKey: string, fallback: string): string => {
    const raw = asCssString(resolvedThemeSettings[roleKey], fallback)
    const hex = normalizeHex(raw)
    if (hex !== null) return hex
    warnings.push(
      `Palette role "${roleKey}" resolved to "${raw}", which is not a hex colour — formats fall back to ${fallback}.`,
    )
    return fallback
  }

  const presetsByKey = new Map<string, BrandTypographyPresetRow>(
    presets.filter(preset => preset.isActive !== false).map(preset => [preset.key, preset]),
  )
  const roleToPreset = new Map<string, string>(roles.map(role => [role.role, role.presetKey]))

  return {
    tokens: {
      primary: colour(identity.brandPrimary, BRAND_RENDER_TOKENS_FALLBACK.primary),
      secondary: colour(identity.brandSecondary, BRAND_RENDER_TOKENS_FALLBACK.secondary),
      surface: colour(identity.brandSurface, BRAND_RENDER_TOKENS_FALLBACK.surface),
      onSurface: colour(identity.brandOnSurface, BRAND_RENDER_TOKENS_FALLBACK.onSurface),
      headline: fontTokenFor(identity.headlineRole, presetsByKey, roleToPreset, warnings),
      body: fontTokenFor(identity.bodyRole, presetsByKey, roleToPreset, warnings),
    },
    warnings,
  }
}
