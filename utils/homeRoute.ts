import type { ClientConfig } from '~/shared/types/previewMessages'

/**
 * Normalize an authored page key / slug into a route-safe slug, or null.
 *
 * The config arrives over the wire, so keys are untrusted: a key authored with
 * its own leading slash would produce the protocol-relative `//about` instead
 * of a root-relative route, and a key carrying a backslash is rejected
 * outright — browsers fold `\` into `/` when resolving a URL, so `\evil.example`
 * would navigate off-site as `//evil.example`, and no legitimate page slug
 * contains one.
 */
function normalizeSlugKey(key: string): string | null {
  if (key.includes('\\')) return null
  const slug = key.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return slug || null
}

/**
 * The site's home route.
 *
 * Preference order:
 * 1. `homeSlug` (emitted by the client export since the page-tree order fix),
 *    when it names an existing top-level page. It exists because the tree is a
 *    slug-keyed object and JS hoists integer-like slugs ("2018") to the front
 *    of `Object.keys` — so "the first key" is NOT the authored first page.
 * 2. The lowest-`position` top-level page, when nodes carry `position`.
 * 3. Legacy fallback: the first key. Snapshots published before `homeSlug` /
 *    `position` existed have nothing better; for them key order is the only
 *    signal, hoisting warts and all.
 *
 * `/` redirects to that page (see `resolveRootDestination`). Never hardcode
 * `/home`: a page slug is authored content, and an editor who renames or
 * deletes that page turns every hardcoded link to it into a not-found page
 * (which is exactly how the not-found page's own recovery link used to
 * dead-end).
 *
 * Returns null when the config carries no pages at all (an empty or not-yet-
 * loaded site), so each caller decides what to do with the dead end rather than
 * being handed a route that resolves to nothing.
 *
 * The shape is untrusted wire data: an array passes a `typeof === 'object'`
 * check but its keys are indices, which would hand callers the route `/0` — it
 * is rejected here rather than at each call site. Key normalization and the
 * backslash rejection are documented on `normalizeSlugKey`, and apply to
 * `homeSlug` too — it crosses the same wire.
 */
export function resolveHomeRoute(
  pages: ClientConfig['pages'] | undefined | null,
  homeSlug?: string | null
): string | null {
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) return null
  const keys = Object.keys(pages)
  if (keys.length === 0) return null

  if (typeof homeSlug === 'string') {
    const wanted = normalizeSlugKey(homeSlug)
    // Only honour a homeSlug that names an existing top-level page — a stale
    // or hostile value must fall back rather than mint a dead (or off-site)
    // home route.
    if (wanted !== null && keys.some((key) => normalizeSlugKey(key) === wanted)) {
      return `/${wanted}`
    }
  }

  // Fallback scan: prefer the lowest-position node so a numeric slug hoisted
  // to the front of the keys cannot hijack home on a config that carries
  // positions; position-less (pre-fix) configs keep the first-key behaviour.
  let firstKey = keys[0]
  let bestPos = Infinity
  for (const key of keys) {
    const pos = (pages as Record<string, { position?: unknown }>)[key]?.position
    if (typeof pos === 'number' && Number.isFinite(pos) && pos < bestPos) {
      bestPos = pos
      firstKey = key
    }
  }

  // keys.length > 0 is guaranteed above, but index access is typed optional.
  if (firstKey === undefined) return null
  const slug = normalizeSlugKey(firstKey)
  return slug ? `/${slug}` : null
}

/** What `/` should do, given the state of the site config. */
export type RootDestination =
  | { kind: 'redirect', to: string }
  | { kind: 'landing' }

/**
 * Decide what `/` is, for this host.
 *
 * `/` serves two audiences that share one route. On a tenant hostname it is a
 * pointer at the site's home page and nothing else; on the platform's own
 * hostname there is no tenant behind it and it is the product's landing page.
 * The decision is a pure function of config state so it can be made in routing
 * (`middleware/site-home.ts`) rather than during render — the page component
 * holds the landing copy and never the branch.
 *
 * A 404 is the ONLY failure that means "no site on this host": `resolveSiteId`
 * throws it for an unresolved hostname, so the landing page is what a visitor
 * to the platform domain gets. Every other failure (500, network, offline) is a
 * real fault on a real tenant and goes to /error, which can retry — showing the
 * platform landing there would tell the tenant's visitors their site no longer
 * exists.
 *
 * ponytail: a published-site-not-found 404 and a resolved-but-never-published
 * site's 404 are indistinguishable here, so an unpublished tenant domain shows
 * the landing page rather than an error. Split the status codes server-side if
 * that ever needs to differ.
 */
export function resolveRootDestination(state: {
  hasLoadedConfig: boolean
  configErrorStatus: number | null
  pages: ClientConfig['pages'] | undefined | null
  homeSlug?: string | null
}): RootDestination {
  if (state.hasLoadedConfig) {
    // A resolved site with zero pages has a home that does not exist — that is a
    // broken site, not the platform domain, so it keeps going to /error.
    return { kind: 'redirect', to: resolveHomeRoute(state.pages, state.homeSlug) ?? '/error' }
  }
  if (state.configErrorStatus === 404) return { kind: 'landing' }
  return { kind: 'redirect', to: '/error' }
}
