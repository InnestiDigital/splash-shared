// Templated-page rendering for the page-builder preview (`/__preview`).
//
// A page whose `pageType` is `article` or `blog-index` carries NO blocks — its
// surface is a structured template component (see `templateLoader.ts`). The
// page-builder preview renders blocks, so selecting such a page used to paint
// header + footer around an empty void.
//
// This module holds every decision the preview route needs, kept out of the
// .vue so it is unit-testable the same way `canvasRenderMode.ts` is for the
// brand-canvas render route:
//   - is this page templated at all?
//   - what does the `/api/site-config/page` payload mean (template / blocks /
//     malformed)?
//   - how do the editor's UNSAVED template settings layer over the resolved
//     ones the server returned?
//   - what `page` prop does a template component get?
//
// Fail-loud contract (same as DynamicPage's unknown-block placeholder): a
// template the theme cannot resolve renders a visible red placeholder and logs
// an error. It never renders nothing.

import { defineAsyncComponent, h, type Component } from 'vue'
import { loadTemplateComponent } from '~/shared/features/cms/templateLoader'
import type { MediaRecord } from '~/shared/types/articles'
import type { ResolvedSeo } from '~/shared/types/seo'

/** Page types rendered by a structured template instead of by blocks. */
export const TEMPLATED_PAGE_TYPES = ['article', 'blog-index'] as const
export type TemplatedPageType = (typeof TEMPLATED_PAGE_TYPES)[number]

export function isTemplatedPageType(value: unknown): value is TemplatedPageType {
  return typeof value === 'string'
    && (TEMPLATED_PAGE_TYPES as readonly string[]).includes(value)
}

/** Template descriptor as `/api/site-config/page` returns it. */
export interface PreviewTemplateDescriptor {
  id: string
  label: string
  component: string
  version: string
  schemaVersion: string
  settings: Record<string, unknown>
}

export interface TemplateAuthor {
  userId: string | null
  name: string | null
  displayName: string | null
}

/** Wire payload of `/api/site-config/page` (the fields this route consumes). */
export interface TemplatedPageResponse {
  blocks?: unknown[]
  template?: PreviewTemplateDescriptor | null
  contentData?: Record<string, unknown> | null
  media?: Record<string, MediaRecord> | null
  relatedArticles?: unknown[] | null
  seo?: ResolvedSeo | null
  publishedAt?: string | null
  author?: TemplateAuthor | null
}

export interface TemplatedPageRender {
  template: PreviewTemplateDescriptor
  contentData: Record<string, unknown>
  media: Record<string, MediaRecord>
  related: unknown[]
  seo: ResolvedSeo | null
  publishedAt: string | null
  author: TemplateAuthor
}

/**
 * Explicit states, not a scatter of booleans.
 *
 *  - `blocks`   render through DynamicPage (non-templated page, or a legacy
 *               block-authored blog-index)
 *  - `loading`  the page endpoint is in flight
 *  - `template` mount the template component
 *  - `error`    show a visible failure — never a blank frame
 */
export type TemplatedPagePreviewState =
  | { status: 'blocks' }
  | { status: 'loading' }
  | { status: 'template', render: TemplatedPageRender }
  | { status: 'error', message: string }

const EMPTY_AUTHOR: TemplateAuthor = { userId: null, name: null, displayName: null }

/**
 * Interpret a page-endpoint payload for a TEMPLATED page.
 *
 * An article is structured-only: a payload without `template` + `contentData`
 * means the row is malformed (or the server build is older than the renderer),
 * and the honest answer is a visible error rather than an empty page. A
 * blog-index may legitimately still be block-authored, so it falls back.
 */
export function toPreviewState(
  pageType: TemplatedPageType,
  res: TemplatedPageResponse,
): TemplatedPagePreviewState {
  const template = res.template ?? null
  const contentData = res.contentData ?? null

  if (!template || !contentData) {
    if (pageType === 'article') {
      return {
        status: 'error',
        message:
          'This article resolved without a template. Articles render only through a '
          + 'structured template — check the article\'s template assignment.',
      }
    }
    return { status: 'blocks' }
  }

  return {
    status: 'template',
    render: {
      template,
      contentData,
      media: res.media ?? {},
      related: Array.isArray(res.relatedArticles) ? res.relatedArticles : [],
      seo: res.seo ?? null,
      publishedAt: res.publishedAt ?? null,
      author: res.author ?? EMPTY_AUTHOR,
    },
  }
}

/**
 * Layer the editor's in-flight template settings over the server-resolved ones.
 *
 * The server already merged schema defaults + the persisted row, so this is a
 * shallow override keyed by field: it makes a Template Settings edit visible in
 * the preview without a refetch. `undefined` never overrides — an absent field
 * means "no opinion", not "clear it".
 */
export function mergeTemplateSettings(
  resolved: Record<string, unknown>,
  draft: unknown,
): Record<string, unknown> {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { ...resolved }
  const out: Record<string, unknown> = { ...resolved }
  for (const [key, value] of Object.entries(draft as Record<string, unknown>)) {
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

export interface TemplatePageProp {
  id: string
  slug: string
  title: string
  publishedAt: string | null
  author: TemplateAuthor
  seo: ResolvedSeo | null
  parentId: string | null
  pageType: string
  locale: string
}

/**
 * Build the `page` prop every template component declares. Mirrors the object
 * DynamicPage passes on the public surface so the preview render is the same
 * component fed the same shape.
 */
export function buildTemplatePageProp(input: {
  pageSlug: string
  pageCfg: Record<string, unknown> | null
  render: TemplatedPageRender
  locale: string
  title: string
}): TemplatePageProp {
  const cfg = input.pageCfg ?? {}
  return {
    id: typeof cfg.id === 'string' ? cfg.id : input.pageSlug,
    slug: typeof cfg.slug === 'string' ? cfg.slug : input.pageSlug,
    title: input.title,
    publishedAt: input.render.publishedAt,
    author: input.render.author,
    seo: input.render.seo,
    parentId: typeof cfg.parentId === 'string' ? cfg.parentId : null,
    pageType: typeof cfg.pageType === 'string' ? cfg.pageType : 'static',
    locale: input.locale,
  }
}

/**
 * Page titles are either a plain string or a locale map. Prefer the page's
 * content locale, then en-US, then whatever exists — same order the renderer
 * uses everywhere else.
 */
export function pickPageTitle(value: unknown, locale: string): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>
    const candidate = map[locale] ?? map['en-US'] ?? Object.values(map)[0]
    if (typeof candidate === 'string') return candidate
  }
  return ''
}

/** Visible red placeholder — the same fail-loud shape DynamicPage uses. */
export function makeTemplateErrorPlaceholder(message: string): Component {
  return {
    name: 'TemplatedPreviewError',
    render() {
      return h(
        'div',
        {
          class: 'templated-preview-error',
          style: 'padding:1rem;margin:0.5rem;border:2px solid #d93025;background:#fff4f4;'
            + 'color:#9c1411;font-family:monospace;font-size:14px;border-radius:4px;',
        },
        message,
      )
    },
  }
}

export type TemplateComponentLoader = (theme: string, component: string) => Promise<unknown>

/**
 * Async wrapper around the shared template loader. A component path the theme
 * cannot resolve (renamed template, theme switched, poisoned row) logs an error
 * and swaps in the red placeholder — it never leaves the frame blank.
 */
export function resolveTemplateComponent(
  theme: string,
  component: string,
  loader: TemplateComponentLoader = loadTemplateComponent,
): Component {
  const label = `[preview] Template "${component}" could not be loaded for theme "${theme}".`
  return defineAsyncComponent({
    loader: () => loader(theme, component) as Promise<Component>,
    errorComponent: makeTemplateErrorPlaceholder(
      `${label} Check the page's template assignment and the theme's templates/ directory.`,
    ),
    onError(error, _retry, fail) {
      console.error(label, error)
      fail()
    },
  })
}

/** Query params for the page endpoint, as the preview iframe needs them. */
export function buildPageEndpointParams(input: {
  path: string
  siteId?: string | null
  locale?: string | null
}): Record<string, string> {
  const params: Record<string, string> = { path: input.path }
  if (input.siteId) params.site = input.siteId
  if (input.locale) params.locale = input.locale
  return params
}

/** Human-readable message for a failed page-endpoint fetch. */
export function describeFetchError(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { statusMessage?: unknown } }).data
    if (data && typeof data.statusMessage === 'string') return data.statusMessage
    const statusMessage = (error as { statusMessage?: unknown }).statusMessage
    if (typeof statusMessage === 'string') return statusMessage
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Failed to load this page for preview.'
}
