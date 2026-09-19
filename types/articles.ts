// shared/types/articles.ts
import type { ResolvedSeo } from './seo'
import type { AnimationScene } from './animation'

export interface ArticleAuthorRef {
  userId: string | null
  name: string | null
  displayName: string | null
}

/**
 * Media record shape carried in Tier 3 article responses for templates that
 * reference media ids in their `contentData`. Source of truth lives here;
 * `server/services/contentDataForRender.ts` re-exports for legacy imports.
 */
export interface MediaRecord {
  id: string
  url: string
  alt?: Record<string, string> | null
  caption?: Record<string, string> | null
}

export interface ArticleSummary {
  id: string
  slug: string
  url: string                       // absolute path resolved server-side; ArticleList consumes directly
  title: Record<string, string>
  excerpt: Record<string, string> | null
  featuredImageId: string | null
  featuredImageUrl: string | null
  publishedAt: string | null
  authorUserId: string | null
  authorName: string | null
  authorDisplayName: string | null
  noIndex: boolean                  // surfaced for rel=nofollow on card link; NOT a visibility filter
}

/**
 * Slim article reference shape used for "related articles" enrichment on
 * Tier 3 article body responses. Distinct from `ArticleSummary` (the Tier 2
 * list-item) — drops noIndex/author surfaces that don't belong on a
 * carousel card, adds `subtitle` (rendered on editorial related-content
 * cards) + `parentSlug` so templates can build hrefs without a side fetch.
 */
export interface ArticleRelatedSummary {
  id: string
  slug: string
  parentSlug?: string | null         // for URL building in templates: `/<parentSlug>/<slug>`
  title: Record<string, string>
  subtitle?: Record<string, string> | null
  featuredImageId?: string | null
  featuredImageUrl?: string | null
  publishedAt?: string | null
}

export interface ArticleSummariesResponse {
  blogId: string
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  articles: ArticleSummary[]
}

/**
 * Article body response. After the Blog-2 structured-only rip every article
 * carries a structured `template + contentData + media`. `blocks` survives as
 * an empty array for backwards-compat with snapshots that still expect the
 * field shape.
 */
export interface ArticleBodyResponse {
  id: string
  slug: string
  parentId: string
  title: Record<string, string>
  layout: string
  templateId: string | null
  blocks: any[]
  sections?: any[]
  scenes: AnimationScene[]
  meta: Record<string, unknown>
  seo: ResolvedSeo
  publishedAt: string | null
  author: ArticleAuthorRef
  template: {
    id: string
    label: string
    component: string                     // 'templates/<id>.vue' relative to theme root
    version: string                       // template.version
    schemaVersion: string                 // pages.template_version stamped on this article
    settings: Record<string, any>         // resolved templateSettings (defaults applied)
  }
  /** Render-ready content (richtext → sanitized HTML strings; media id strings preserved). */
  contentData: Record<string, any>
  /** Media records keyed by id. Templates look up URLs via media[id].url. */
  media: Record<string, MediaRecord>
  /**
   * Sibling articles under the same parent blog (other than this one), ordered
   * by publishedAt DESC, capped to 12. Public Tier 2 callers see only published
   * siblings; admin/preview surfaces include drafts. Templates that opt in
   * (e.g. the gallery-sticky related-content section) read this for carousels.
   */
  relatedArticles?: ArticleRelatedSummary[]
}
