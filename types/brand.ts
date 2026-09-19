/**
 * Brand Content Studio — slice 1: the brand identity contract.
 *
 * This is the versioned, site-level brand record that later studio slices
 * (format templates, render pipeline, AI composition) read as their single
 * source of truth for "what this brand looks and sounds like".
 *
 * Two deliberate constraints, both load-bearing:
 *
 * 1. **Palette fields store a theme palette ROLE KEY, never a colour value.**
 *    `brandPrimary: 'accentColor'` means "whatever the theme's accent role
 *    resolves to". This keeps the Color Override Freeze intact — the studio can
 *    never drift away from the theme palette, and re-theming a site re-brands
 *    every generated asset for free.
 * 2. **Typography fields store a system typography role name** (`heading1`,
 *    `body`, …), resolved through the existing typography role → preset mapping.
 */

import { isRecord } from '~/shared/types/guards'
import type { BrandRenderTokens } from '~/shared/types/brandFormat'

export const BRAND_TEXT_FIELDS = ['brandName', 'tagline', 'toneWords'] as const
export const BRAND_TEXTAREA_FIELDS = ['doRules', 'dontRules'] as const
export const BRAND_LOGO_FIELDS = ['logoPrimary', 'logoInverse', 'logoMark'] as const
export const BRAND_PALETTE_FIELDS = ['brandPrimary', 'brandSecondary', 'brandSurface', 'brandOnSurface'] as const
export const BRAND_TYPOGRAPHY_FIELDS = ['headlineRole', 'bodyRole'] as const

type BrandTextFieldId = typeof BRAND_TEXT_FIELDS[number]
type BrandTextareaFieldId = typeof BRAND_TEXTAREA_FIELDS[number]
export type BrandLogoFieldId = typeof BRAND_LOGO_FIELDS[number]
type BrandPaletteFieldId = typeof BRAND_PALETTE_FIELDS[number]
type BrandTypographyFieldId = typeof BRAND_TYPOGRAPHY_FIELDS[number]

export type BrandIdentityFieldId =
  | BrandTextFieldId
  | BrandTextareaFieldId
  | BrandLogoFieldId
  | BrandPaletteFieldId
  | BrandTypographyFieldId

/**
 * The brand contract itself.
 *
 * Derived from the field-id unions so a new field id is a compile error until
 * every layer (schema builder, validator, repository, migration) handles it.
 * Logo fields are the only nullable ones — "no asset uploaded yet".
 */
export type BrandIdentity =
  & Record<BrandTextFieldId | BrandTextareaFieldId | BrandPaletteFieldId | BrandTypographyFieldId, string>
  & Record<BrandLogoFieldId, string | null>

type BrandFieldType = 'text' | 'textarea' | 'select' | 'image'

export const BRAND_FIELD_GROUP_IDS = ['identity', 'logos', 'palette', 'typography', 'voice'] as const
export type BrandFieldGroupId = typeof BRAND_FIELD_GROUP_IDS[number]

export interface BrandFieldGroup {
  id: BrandFieldGroupId
  label: string
}

export interface BrandFieldOption {
  value: string
  label: string
}

/**
 * A single brand field, shaped so the existing admin field components
 * (`DynamicField`, `TImagePicker`) can render it unchanged.
 */
export interface BrandFieldSchema {
  id: BrandIdentityFieldId
  type: BrandFieldType
  label: string
  group: BrandFieldGroupId
  note?: string
  placeholder?: string
  /** Present for `select` fields only; enumerates the allowed stored values. */
  options?: BrandFieldOption[]
  validation?: { maxLength: number }
}

// ─── Wire payloads ────────────────────────────────────────────────────────────

/**
 * The stored record plus everything needed to render and validate it. This is
 * what `getBrandIdentity` produces; the GET response adds the resolved tokens.
 */
export interface BrandIdentityContract {
  identity: BrandIdentity
  schema: BrandFieldSchema[]
  groups: BrandFieldGroup[]
}

/**
 * `GET /api/admin/s/:siteId/brand-identity`.
 *
 * Carries the contract's palette/typography ROLE KEYS already resolved into
 * concrete render tokens, by the same server function the headless render path
 * uses (`server/services/brand/brandRenderTokens.ts`). Resolving them here
 * rather than in the consumer is load-bearing twice over:
 *
 *  - the three reads it takes (theme manifest, theme settings, typography
 *    preset/role rows) are behind admin-only routes, so a 'client' session
 *    could never perform them — resolving client-side locks clients out of the
 *    studio entirely;
 *  - a second implementation of the resolution is exactly how the on-screen
 *    preview and the exported PNG drift apart.
 */
export interface BrandIdentityGetResponse extends BrandIdentityContract {
  tokens: BrandRenderTokens
  /** Non-fatal degradations from that resolution — surfaced, never swallowed. */
  tokenWarnings: string[]
  /**
   * `@font-face` rules for the brand's type, from the same builder the PNG
   * render injects — so an in-browser preview shows the same faces the export
   * paints. `''` when the theme declares none.
   */
  fontFaceCss: string
}

/**
 * PUT body. `identity` is a PATCH: absent field ids keep their stored value,
 * same merge semantics as theme settings. Per-field validation happens
 * server-side against the site's live role vocabulary.
 */
export interface BrandIdentityPutRequest {
  identity: Partial<BrandIdentity>
}

export interface BrandIdentityPutResponse {
  identity: BrandIdentity
}

// ─── Preset wire payloads (slice 10) ──────────────────────────────────────────

/**
 * Preset names are author-facing labels, not identifiers — the id is a minted
 * UUID. The cap is enforced by the endpoints (after trimming), and it lives in
 * the shared contract so the admin form can enforce the same number without a
 * second source of truth.
 */
export const BRAND_PRESET_NAME_MAX_LENGTH = 120

/** One named preset as the picker consumes it. `updatedAt` is an ISO string. */
export interface BrandPresetSummary {
  presetId: string
  presetName: string
  updatedAt: string
}

/** `GET /api/admin/s/:siteId/brand-presets` — draft presets, oldest (= default) first. */
export interface BrandPresetListResponse {
  presets: BrandPresetSummary[]
}

/**
 * `POST /api/admin/s/:siteId/brand-presets`. `cloneFrom` seeds the new preset's
 * identity from an existing preset's draft; absent means theme-derived defaults.
 */
export interface BrandPresetCreateRequest {
  presetName: string
  cloneFrom?: string
}

/** `PUT /api/admin/s/:siteId/brand-presets/:presetId` — rename only; the identity has its own PUT. */
export interface BrandPresetRenameRequest {
  presetName: string
}

/**
 * `DELETE /api/admin/s/:siteId/brand-presets/:presetId`. Only the success shape
 * crosses the wire — `not_found` and `last_preset` answer as 404/409 errors.
 */
export interface BrandPresetDeleteResponse {
  status: 'deleted'
}

// ─── Guards (used by the route ingress, the validator and the admin form) ─────

/** Route-ingress shape check; field-level validation is the service's job. */
export function isBrandIdentityPutRequest(body: unknown): body is BrandIdentityPutRequest {
  return isRecord(body) && isRecord(body.identity)
}

/**
 * Route-ingress shape check for preset create. Name trimming and the 1..120
 * length rule are the endpoint's job — a guard cannot answer "which field" in
 * its 400 the way `createError` can.
 */
export function isBrandPresetCreateRequest(body: unknown): body is BrandPresetCreateRequest {
  if (!isRecord(body)) return false
  if (typeof body.presetName !== 'string') return false
  if (body.cloneFrom !== undefined && (typeof body.cloneFrom !== 'string' || body.cloneFrom.length === 0)) return false
  return true
}

/** Route-ingress shape check for preset rename. Same split as create. */
export function isBrandPresetRenameRequest(body: unknown): body is BrandPresetRenameRequest {
  return isRecord(body) && typeof body.presetName === 'string'
}

const LOGO_FIELD_ID_SET: ReadonlySet<string> = new Set(BRAND_LOGO_FIELDS)

export function isBrandLogoFieldId(id: BrandIdentityFieldId): id is BrandLogoFieldId {
  return LOGO_FIELD_ID_SET.has(id)
}
