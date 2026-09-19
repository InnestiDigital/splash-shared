/**
 * Brand Content Studio — resolved brand render tokens (host → template props).
 *
 * The compiled-format tier (authorable `*.format.json` templates, the field
 * schema, the format registry) has been retired — canvases (ordinary CMS block
 * trees, see `shared/types/brandCanvas.ts`) are the only render surface now.
 * What survives here is the RENDER TOKEN shape: the brand contract's palette
 * and typography roles, resolved once by `brandRenderTokens.ts` and consumed
 * by `brand-identity.get.ts`'s studio preview and `surface.ts` /
 * `brandTokens.ts`.
 */

// ─── Resolved brand render tokens (host → template props) ─────────────────────

/**
 * One typography role, already resolved through the site's role → preset
 * mapping. `fontSize` is intentionally absent: canvases pick their own optical
 * sizes, the brand owns family/weight/spacing/case.
 */
export interface BrandFontToken {
  fontFamily: string
  fontWeight: string
  letterSpacing: string
  textTransform: string
  lineHeight: string
}

/**
 * Everything a format template needs that is *not* authorable — resolved once
 * by the studio host so every template stays a pure function of its props.
 */
export interface BrandRenderTokens {
  primary: string
  secondary: string
  surface: string
  onSurface: string
  headline: BrandFontToken
  body: BrandFontToken
}

const BRAND_FONT_TOKEN_FALLBACK: BrandFontToken = {
  fontFamily: 'system-ui, sans-serif',
  fontWeight: '400',
  letterSpacing: '0em',
  textTransform: 'none',
  lineHeight: '1.2',
}

export const BRAND_RENDER_TOKENS_FALLBACK: BrandRenderTokens = {
  primary: '#111111',
  secondary: '#555555',
  surface: '#ffffff',
  onSurface: '#111111',
  headline: BRAND_FONT_TOKEN_FALLBACK,
  body: BRAND_FONT_TOKEN_FALLBACK,
}
