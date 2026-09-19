/**
 * FAQ structured-data extraction.
 *
 * Walks a page's top-level blocks and collects the question/answer pairs from
 * every `faq-accordion` block, so the page can advertise a schema.org
 * `FAQPage` (see {@link buildStructuredData}). Emitting FAQPage JSON-LD makes
 * the page eligible for Google's expandable-FAQ rich result — authors get it
 * for free just by placing an FAQ block, with no SEO fields to fill in.
 *
 * Pure + framework-free so it unit-tests without a DOM. The caller injects a
 * `localize` resolver (the page's locale-aware picker) rather than this module
 * reaching for a composable, keeping it a plain data transform.
 */

export interface FaqEntry {
  question: string
  answer: string
}

type Localize = (value: unknown) => string

interface FaqBlockLike {
  type?: string
  settings?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * Collapse rich HTML to the plain text Google expects for FAQ Q&A. Tags become
 * spaces (so `<p>a</p><p>b</p>` doesn't glue into `ab`), then whitespace is
 * normalised and trimmed.
 */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Read a single FAQ item's raw shape. The CMS block transformer nests each
 * `faq-item` as `{ type, settings: { question, answer } }`, but some paths
 * hand the flat `{ question, answer }` directly — mirror FaqAccordion.vue and
 * accept both.
 */
function itemSettings(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const withSettings = raw as { settings?: Record<string, unknown> }
  if (withSettings.settings && typeof withSettings.settings === 'object') {
    return withSettings.settings
  }
  return raw as Record<string, unknown>
}

export function extractFaqEntries(
  blocks: readonly FaqBlockLike[] | null | undefined,
  localize: Localize,
): FaqEntry[] {
  if (!Array.isArray(blocks)) return []

  const entries: FaqEntry[] = []
  for (const block of blocks) {
    if (!block || block.type !== 'faq-accordion') continue

    const items = block.settings?.items
    if (!Array.isArray(items)) continue

    for (const raw of items) {
      const src = itemSettings(raw)
      if (!src) continue

      const question = stripHtml(localize(src.question))
      const answer = stripHtml(localize(src.answer))
      // Only advertise a Q&A the crawler can actually use — both sides present.
      if (question && answer) entries.push({ question, answer })
    }
  }

  return entries
}
