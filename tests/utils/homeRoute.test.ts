import { describe, it, expect } from 'vitest'
import { resolveHomeRoute, resolveRootDestination } from '~/shared/utils/homeRoute'

// The page shape only matters through Object.keys here, so the fixtures stay minimal.
const page = (id: string) => ({ id, title: id, layout: 'default', meta: {} }) as any
const tree = (...ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, page(id)])) as any

describe('resolveHomeRoute', () => {
  it('resolves the first page in the shell tree', () => {
    expect(resolveHomeRoute(tree('home', 'about', 'contact'))).toBe('/home')
  })

  it('follows the tree, not the literal "home" slug', () => {
    // The defect this exists to prevent: an author renames or deletes the home
    // page and every hardcoded /home link lands on the not-found page.
    expect(resolveHomeRoute(tree('about', 'services', 'contact'))).toBe('/about')
    expect(resolveHomeRoute(tree('benvenuto'))).toBe('/benvenuto')
  })

  it('returns a root-relative route with exactly one leading slash', () => {
    const route = resolveHomeRoute(tree('about'))
    expect(route).toBe('/about')
    expect(route?.startsWith('//')).toBe(false)
  })

  it('returns null when the site declares no pages', () => {
    expect(resolveHomeRoute({} as any)).toBeNull()
  })

  it('returns null when the config has not loaded yet', () => {
    expect(resolveHomeRoute(undefined)).toBeNull()
    expect(resolveHomeRoute(null)).toBeNull()
  })

  it('returns null for a non-object pages value', () => {
    // Wire data is untrusted: a scalar must not become the string route "/0".
    expect(resolveHomeRoute('home' as any)).toBeNull()
    expect(resolveHomeRoute(0 as any)).toBeNull()
  })

  it('returns null for an array, whose keys are indices, not slugs', () => {
    // An array passes `typeof === 'object'`, so without an explicit guard
    // ['about'] would resolve to the route "/0".
    expect(resolveHomeRoute(['about'] as any)).toBeNull()
    expect(resolveHomeRoute([] as any)).toBeNull()
  })

  it('normalizes a key that already carries its own slashes', () => {
    // "//about" is protocol-relative, not root-relative: a browser reads it as
    // the host "about", which leaves the site entirely.
    expect(resolveHomeRoute({ '/about': page('about') } as any)).toBe('/about')
    expect(resolveHomeRoute({ '//about': page('about') } as any)).toBe('/about')
    expect(resolveHomeRoute({ 'about/': page('about') } as any)).toBe('/about')
  })

  it('returns null for a key carrying a backslash', () => {
    // A browser folds "\" into "/" when resolving a URL, so "/\evil.example"
    // navigates to the host "evil.example" — an off-site redirect from a page key.
    expect(resolveHomeRoute({ '\\evil.example': page('evil') } as any)).toBeNull()
    expect(resolveHomeRoute({ '/\\evil.example': page('evil') } as any)).toBeNull()
    expect(resolveHomeRoute({ 'about\\..\\admin': page('about') } as any)).toBeNull()
  })

  it('returns null for a key that normalizes to nothing', () => {
    expect(resolveHomeRoute({ '/': page('root') } as any)).toBeNull()
    expect(resolveHomeRoute({ '   ': page('blank') } as any)).toBeNull()
    expect(resolveHomeRoute({ '': page('empty') } as any)).toBeNull()
  })

  it('prefers an explicit homeSlug over key order', () => {
    expect(resolveHomeRoute(tree('storia', 'homepage', 'contact'), 'homepage')).toBe('/homepage')
  })

  it('a numeric sibling slug cannot hijack home when homeSlug is set', () => {
    // JS hoists integer-like keys to the front of Object.keys regardless of
    // insertion order — the exact defect homeSlug exists to bypass.
    const pages = tree('homepage', '2018')
    expect(Object.keys(pages)[0]).toBe('2018') // hoisting is real
    expect(resolveHomeRoute(pages, 'homepage')).toBe('/homepage')
  })

  it('falls back to the scan when homeSlug is missing or empty', () => {
    expect(resolveHomeRoute(tree('about', 'contact'))).toBe('/about')
    expect(resolveHomeRoute(tree('about', 'contact'), null)).toBe('/about')
    expect(resolveHomeRoute(tree('about', 'contact'), '')).toBe('/about')
  })

  it('falls back when homeSlug names no existing top-level page', () => {
    // A stale homeSlug (page renamed or unpublished) must not mint a dead route.
    expect(resolveHomeRoute(tree('about', 'contact'), 'gone')).toBe('/about')
  })

  it('normalizes a homeSlug carrying its own slashes before matching', () => {
    expect(resolveHomeRoute(tree('about', 'contact'), '/contact')).toBe('/contact')
    expect(resolveHomeRoute(tree('about', 'contact'), 'contact/')).toBe('/contact')
  })

  it('rejects a hostile homeSlug and falls back instead of going off-site', () => {
    expect(resolveHomeRoute(tree('about'), '\\evil.example')).toBe('/about')
    expect(resolveHomeRoute(tree('about'), '/\\evil.example')).toBe('/about')
  })

  it('prefers the lowest-position node over key order when nodes carry position', () => {
    // A hoisted numeric slug cannot hijack home even WITHOUT homeSlug, as long
    // as the config carries the explicit per-node position the export now emits.
    const pages = {
      '2018': { ...page('2018'), position: 5 },
      homepage: { ...page('homepage'), position: 0 },
    } as any
    expect(Object.keys(pages)[0]).toBe('2018')
    expect(resolveHomeRoute(pages)).toBe('/homepage')
  })

  it('keeps first-key order for position-less legacy configs', () => {
    expect(resolveHomeRoute(tree('storia', 'homepage'))).toBe('/storia')
  })
})

describe('resolveRootDestination', () => {
  it('redirects to the first shell page when the config loaded', () => {
    expect(
      resolveRootDestination({
        hasLoadedConfig: true,
        configErrorStatus: null,
        pages: tree('about', 'contact'),
      })
    ).toEqual({ kind: 'redirect', to: '/about' })
  })

  it('redirects to the homeSlug page when the config declares one', () => {
    expect(
      resolveRootDestination({
        hasLoadedConfig: true,
        configErrorStatus: null,
        pages: tree('storia', 'homepage'),
        homeSlug: 'homepage',
      })
    ).toEqual({ kind: 'redirect', to: '/homepage' })
  })

  it('redirects to /error when a resolved site has no pages', () => {
    expect(
      resolveRootDestination({ hasLoadedConfig: true, configErrorStatus: null, pages: {} as any })
    ).toEqual({ kind: 'redirect', to: '/error' })
  })

  it('renders the landing page when no site exists for the hostname', () => {
    // 404 is what resolveSiteId throws for an unresolved hostname — i.e. the
    // platform's own domain, which is what the landing page is for.
    expect(
      resolveRootDestination({ hasLoadedConfig: false, configErrorStatus: 404, pages: undefined })
    ).toEqual({ kind: 'landing' })
  })

  it('sends every other config failure to /error, not to the landing page', () => {
    // A tenant whose config fetch 500s or times out still has a site. Showing
    // the platform landing there would tell its visitors the site is gone, and
    // would drop the retry that /error offers.
    for (const status of [500, 502, 403, null]) {
      expect(
        resolveRootDestination({ hasLoadedConfig: false, configErrorStatus: status, pages: undefined })
      ).toEqual({ kind: 'redirect', to: '/error' })
    }
  })
})
