import type { ResolvedSeo } from '~/shared/types/seo'

interface ResolveArgs {
  page: {
    title: Record<string, string>
    metaTitle: Record<string, string> | null
    metaDescription: Record<string, string> | null
    excerpt: Record<string, string> | null
    ogImageId: string | null
    featuredImageId: string | null
    noIndex: boolean
    canonicalUrl: string | null
    slug: string
    parentSlugs: string[]
    meta?: { seo?: { extra?: Record<string, unknown> } } | null
  }
  ogImageUrlResolver: (id: string) => string | null
  origin: string
  locale: string
  defaultLocale: string
  /**
   * Site/brand name used to build the automatic title suffix (Yoast-style
   * "%title% — %sitename%" template). Sourced from `themeSettings.siteName`.
   * Optional — when absent, the title is left un-branded (back-compat).
   */
  siteName?: string | null
  /**
   * Site-wide default meta description. Last-resort fallback after the page's
   * own metaDescription and excerpt, so a page that never set either still
   * ships a controlled SERP snippet instead of `null`. Sourced from
   * `themeSettings.siteDescription`. Optional (back-compat).
   */
  siteDescription?: string | null
  /**
   * Site-wide default social share image (absolute URL). Last-resort fallback
   * after the page's ogImageId / featuredImageId, so every public page ships an
   * og:image / twitter:image card even when the author set neither. Resolved
   * from `themeSettings.socialImage` (a media id) upstream in
   * `resolveSeoForPage`. Optional (back-compat).
   */
  siteOgImageUrl?: string | null
}

const TITLE_SEPARATOR = ' — '

/**
 * Case-insensitive check for whether a title already carries the brand, so we
 * never double it up (e.g. a home page literally titled "Acme" must not
 * become "Acme — Acme").
 */
function titleContainsBrand(title: string, siteName: string): boolean {
  return title.toLowerCase().includes(siteName.toLowerCase())
}

function pickLocalized(
  map: Record<string, string> | null | undefined,
  locale: string,
  defaultLocale: string,
): string | null {
  if (!map) return null
  return map[locale] ?? map[defaultLocale] ?? null
}

/**
 * Pure SEO resolution. Spec § 7.2.1 precedence chain:
 *   title:        metaTitle[locale] → page.title[locale] → page.title[defaultLocale] → ''
 *                 …with an automatic " — {siteName}" brand suffix applied ONLY
 *                 to the fallback (page.title) path — an explicit metaTitle is
 *                 honored verbatim so authors keep full title control.
 *   description:  metaDescription[locale] → excerpt[locale] → siteDescription → null
 *   ogImageUrl:   resolved(ogImageId) → resolved(featuredImageId) → siteOgImageUrl → null
 *   canonicalUrl: page.canonicalUrl → `${origin}/${parentSlugs.join('/')}/${slug}`
 *   noIndex:      passthrough
 *   extra:        page.meta?.seo?.extra ?? {}
 *
 * Lives in `shared/` so both the server (Tier 3 article endpoint) and the
 * client (PageHead inside DynamicPage) can call it. The DB-bound wrapper
 * `resolveSeoForPage` stays in `server/services/seoService.ts`.
 */
export function resolveSeo(args: ResolveArgs): ResolvedSeo {
  const { page, locale, defaultLocale } = args

  // Author's explicit metaTitle override wins verbatim; otherwise fall back to
  // the page's own title (locale → defaultLocale → '').
  const explicitTitle = pickLocalized(page.metaTitle, locale, defaultLocale)
  const baseTitle = explicitTitle ?? pickLocalized(page.title, locale, defaultLocale) ?? ''

  // Brand-suffix template: append " — {siteName}" ONLY on the fallback path
  // (no explicit metaTitle). Skip when there is no brand, no base title, or the
  // title already contains the brand — so every page carries the brand in its
  // <title>/og:title without the author repeating it, and without doubling.
  const siteName = args.siteName?.trim() || ''
  const title =
    explicitTitle === null && siteName && baseTitle && !titleContainsBrand(baseTitle, siteName)
      ? `${baseTitle}${TITLE_SEPARATOR}${siteName}`
      : baseTitle

  const description =
    pickLocalized(page.metaDescription, locale, defaultLocale) ??
    pickLocalized(page.excerpt, locale, defaultLocale) ??
    (args.siteDescription?.trim() || null)

  const ogImageUrl =
    (page.ogImageId ? args.ogImageUrlResolver(page.ogImageId) : null) ??
    (page.featuredImageId ? args.ogImageUrlResolver(page.featuredImageId) : null) ??
    (args.siteOgImageUrl?.trim() || null)

  const segments = [...page.parentSlugs, page.slug].filter(Boolean)
  const canonicalUrl = page.canonicalUrl ?? `${args.origin}/${segments.join('/')}`

  return {
    title,
    description,
    ogImageUrl,
    noIndex: page.noIndex,
    canonicalUrl,
    extra: page.meta?.seo?.extra ?? {},
  }
}
