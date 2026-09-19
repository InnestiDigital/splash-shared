import type {
  PageLayoutOverrides,
  LayoutHeaderOverride,
  LayoutFooterOverride,
  LayoutBackgroundOverride,
  LayoutChromeElement,
} from '~/shared/types/layout'

/** Layout id every surface falls back to when nothing else is declared. */
export const DEFAULT_LAYOUT_ID = 'default'

/**
 * Layout inputs that belong to the article row itself. Articles are stripped
 * from the shell page tree, so these travel with the article body payload
 * instead of the site config.
 */
export interface ArticleLayoutSource {
  /** `pages.layout` of the article row. */
  ownLayoutId: string | null
  /** `layoutId` declared by the article's template. */
  templateLayoutId: string | null
  /** `meta.layoutOverrides` of the article row. */
  overrides: PageLayoutOverrides | null
}

/**
 * Layout id for an article: own row → template `layoutId` → parent blog-index
 * → `default`.
 *
 * A stored `'default'` on the article row is treated as *unset*: article
 * creation hardcoded that literal for every article regardless of the chosen
 * template, so it carries no authoring intent and would otherwise pin every
 * existing article to the default layout forever. This is the read-time
 * counterpart of the create-time fix — no backfill migration needed, and an
 * article genuinely wanting the default layout still lands on it through the
 * template / parent / fallback tail.
 */
export function resolveArticleLayoutId(
  article: ArticleLayoutSource | null,
  parentLayoutId: string | null | undefined,
): string {
  const own = article?.ownLayoutId
  const authoredOwn = own && own !== DEFAULT_LAYOUT_ID ? own : null
  return (
    authoredOwn
    || article?.templateLayoutId
    || parentLayoutId
    || DEFAULT_LAYOUT_ID
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const OVERRIDE_KEYS = ['header', 'footer', 'background', 'scroll', 'chrome'] as const

/**
 * Read `meta.layoutOverrides` off a page/article `meta` JSON column.
 *
 * Keeps only the object-shaped, known override sections, so a hand-edited or
 * legacy `meta` can't smuggle an unexpected shape into the merge. The single
 * assertion is the documented JSON → typed boundary: every retained key has
 * been checked to be a plain object, and the layout merge treats unknown inner
 * keys as pass-through anyway.
 */
export function readLayoutOverrides(meta: unknown): PageLayoutOverrides | null {
  if (!isPlainObject(meta)) return null
  const raw = meta.layoutOverrides
  if (!isPlainObject(raw)) return null
  const picked: Record<string, unknown> = {}
  for (const key of OVERRIDE_KEYS) {
    const section = raw[key]
    if (isPlainObject(section)) picked[key] = section
  }
  if (!Object.keys(picked).length) return null
  return picked as PageLayoutOverrides
}

function mergeHeaderOverride(
  base: LayoutHeaderOverride | undefined,
  patch: LayoutHeaderOverride | undefined,
): LayoutHeaderOverride | undefined {
  if (!base) return patch
  if (!patch) return base
  const palette = { ...(base.palette ?? {}), ...(patch.palette ?? {}) }
  const merged: LayoutHeaderOverride = { ...base, ...patch }
  if (Object.keys(palette).length) merged.palette = palette
  return merged
}

function mergeFooterOverride(
  base: LayoutFooterOverride | undefined,
  patch: LayoutFooterOverride | undefined,
): LayoutFooterOverride | undefined {
  if (!base) return patch
  if (!patch) return base
  const palette = { ...(base.palette ?? {}), ...(patch.palette ?? {}) }
  const merged: LayoutFooterOverride = { ...base, ...patch }
  if (Object.keys(palette).length) merged.palette = palette
  return merged
}

function mergeBackgroundOverride(
  base: LayoutBackgroundOverride | undefined,
  patch: LayoutBackgroundOverride | undefined,
): LayoutBackgroundOverride | undefined {
  if (!base) return patch
  if (!patch) return base
  const merged: LayoutBackgroundOverride = { ...base, ...patch }
  if (base.image || patch.image) merged.image = { ...(base.image ?? {}), ...(patch.image ?? {}) }
  if (base.overlay || patch.overlay) merged.overlay = { ...(base.overlay ?? {}), ...(patch.overlay ?? {}) }
  if (base.texture || patch.texture) merged.texture = { ...(base.texture ?? {}), ...(patch.texture ?? {}) }
  return merged
}

function mergeChromeOverride(
  base: PageLayoutOverrides['chrome'],
  patch: PageLayoutOverrides['chrome'],
): PageLayoutOverrides['chrome'] {
  if (!base) return patch
  if (!patch) return base
  const merged: Record<string, Partial<LayoutChromeElement> & { enabled?: boolean }> = { ...base }
  for (const [id, element] of Object.entries(patch)) {
    merged[id] = { ...(base[id] ?? {}), ...element }
  }
  return merged
}

/**
 * Deep-merge two page-level override sets, `patch` winning key by key. Used to
 * layer an article's own `meta.layoutOverrides` on top of the parent
 * blog-index's, so an article deviates from its section without restating it.
 *
 * Mirrors the nesting `sectionMerge` applies when overrides meet a resolved
 * layout — merging partials with `{ ...a, ...b }` alone would drop a parent's
 * palette the moment an article overrode a single header key.
 */
export function mergeLayoutOverrides(
  base: PageLayoutOverrides | null | undefined,
  patch: PageLayoutOverrides | null | undefined,
): PageLayoutOverrides | undefined {
  if (!base) return patch ?? undefined
  if (!patch) return base
  const merged: PageLayoutOverrides = {}
  const header = mergeHeaderOverride(base.header, patch.header)
  if (header) merged.header = header
  const footer = mergeFooterOverride(base.footer, patch.footer)
  if (footer) merged.footer = footer
  const background = mergeBackgroundOverride(base.background, patch.background)
  if (background) merged.background = background
  if (base.scroll || patch.scroll) merged.scroll = { ...(base.scroll ?? {}), ...(patch.scroll ?? {}) }
  const chrome = mergeChromeOverride(base.chrome, patch.chrome)
  if (chrome) merged.chrome = chrome
  return merged
}

/** What a shell needs to frame an article: which theme layout, and what it overrides. */
export interface ArticleShellLayout {
  id: string
  overrides: PageLayoutOverrides | null
}

/**
 * The whole article shell decision in one call: layout id (own row → template →
 * parent blog-index → default) plus the parent's overrides with the article's
 * own layered on top.
 *
 * Both the public route and the article-preview endpoint resolve the same
 * frame from the same inputs, so neither owns half of it — a preview that
 * resolved its own way is exactly the drift WP-15 removes.
 */
export function resolveArticleShellLayout(args: {
  article: ArticleLayoutSource | null
  parentLayoutId: string | null | undefined
  parentMeta: unknown
}): ArticleShellLayout {
  return {
    id: resolveArticleLayoutId(args.article, args.parentLayoutId),
    overrides: mergeLayoutOverrides(
      readLayoutOverrides(args.parentMeta),
      args.article?.overrides,
    ) ?? null,
  }
}
