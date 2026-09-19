import type { ResolvedSeo } from '~/shared/types/seo'
import type { FaqEntry } from './faqStructuredData'

export interface StructuredDataInput {
  seo: Pick<ResolvedSeo, 'title' | 'description' | 'canonicalUrl' | 'ogImageUrl' | 'noIndex'>
  siteName?: string | null
  locale?: string | null
  /**
   * Question/answer pairs harvested from the page's `faq-accordion` blocks
   * (see {@link extractFaqEntries}). When present, a `FAQPage` node is added to
   * the graph so the page is eligible for Google's FAQ rich result.
   */
  faq?: FaqEntry[] | null
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Build a schema.org JSON-LD `@graph` (Organization + WebSite + WebPage) for a
 * public page. This is the structured-data layer search engines read to build
 * rich results / knowledge-panel entities — distinct from the Open Graph /
 * Twitter cards (which drive social-share previews).
 *
 * Returns `null` when there isn't enough trustworthy data to emit *valid*
 * structured data — no absolute canonical URL, or the page is `noIndex`
 * (we don't advertise a page we're asking crawlers to skip). Every field is
 * omitted rather than emitted empty, so the payload never asserts a blank name
 * or a placeholder URL.
 *
 * Pure + framework-free so it unit-tests without a DOM; `PageHead` injects the
 * result as a `<script type="application/ld+json">` via `useHead`. Follow-on:
 * Organization `logo`, `BreadcrumbList` (from the page's slug ancestry), and an
 * `Article` node for blog/diario entries once that data is threaded to the head.
 */
export function buildStructuredData(
  input: StructuredDataInput,
): Record<string, unknown> | null {
  const { seo, siteName, locale, faq } = input

  if (seo.noIndex) return null

  const canonical = seo.canonicalUrl?.trim()
  if (!canonical) return null
  const origin = safeOrigin(canonical)
  if (!origin) return null

  const orgId = `${origin}/#organization`
  const siteId = `${origin}/#website`
  const name = siteName?.trim() || null
  const graph: Record<string, unknown>[] = []

  const organization: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': orgId,
    url: origin,
  }
  if (name) organization.name = name
  graph.push(organization)

  const website: Record<string, unknown> = {
    '@type': 'WebSite',
    '@id': siteId,
    url: origin,
    publisher: { '@id': orgId },
  }
  if (name) website.name = name
  if (locale) website.inLanguage = locale
  graph.push(website)

  const webpage: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    isPartOf: { '@id': siteId },
  }
  const title = seo.title?.trim()
  if (title) webpage.name = title
  if (seo.description) webpage.description = seo.description
  if (locale) webpage.inLanguage = locale
  if (seo.ogImageUrl) {
    webpage.primaryImageOfPage = { '@type': 'ImageObject', url: seo.ogImageUrl }
  }
  graph.push(webpage)

  // FAQPage — emitted only when the page carries usable Q&A pairs. Anchored to
  // the page's canonical and tied back to the WebPage node so crawlers connect
  // the FAQ to this page (not the site as a whole). Each question keeps its
  // plain-text form; the answer text is what renders in the rich result.
  const faqEntries = (faq ?? []).filter(
    (e) => e.question.trim() && e.answer.trim(),
  )
  if (faqEntries.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      isPartOf: { '@id': `${canonical}#webpage` },
      mainEntity: faqEntries.map((e) => ({
        '@type': 'Question',
        name: e.question,
        acceptedAnswer: { '@type': 'Answer', text: e.answer },
      })),
    })
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
