/**
 * Site-scoping for public API calls made from inside the admin preview iframe.
 *
 * Public `/api/site-config/**` endpoints resolve the tenant from the REQUEST
 * HOSTNAME. That works on a tenant hostname, and fails on the platform domain —
 * which is where a superadmin manages every tenant from. The preview iframe
 * loads on the admin's own origin, so theme components rendering inside it were
 * calling tenant-scoped endpoints from a host that names no tenant, and got
 * `404 Site not found for hostname`.
 *
 * `resolveSiteId` already accommodates this: a `?site=<uuid>` query parameter is
 * honoured for exactly this case (in production it additionally requires a
 * session authorized for that site, so it grants nothing a hostname would not).
 * The gap was purely client-side — components never sent it.
 *
 * The preview route carries the id in its own URL (`/__preview?site=<uuid>`),
 * so it is read from the document URL rather than threaded through every
 * component's props. Deliberately NOT `useRoute()`: theme components render in
 * contexts with no router (unit tests, and any future embed), and a composable
 * that throws there would make the router a hard dependency of every block that
 * fetches. On the public site there is no such query param, the object is empty,
 * and the request is byte-identical to what it has always been — hostname
 * resolution keeps working and nothing is scoped by an attacker-supplied id.
 */
// Generic UUID shape, NOT v4-strict: seeded fixture sites use deterministic
// ids like 00000000-…-000000000012 whose version nibble is 0. A v4-only regex
// silently dropped the param for them and every ?site= call 404'd in
// production. Matches the UUID_RE used across server/ repositories.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Extract a usable site id from a route query value.
 *
 * Rejects anything that is not a well-formed UUID — `useRoute().query` values
 * are strings OR arrays of strings (a repeated param), and forwarding an array
 * would serialize as `site=a&site=b`. Returning null for a malformed value lets
 * the request fall back to hostname resolution rather than sending nonsense.
 */
export function readSiteParam(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  return UUID_RE.test(raw) ? raw : null
}

/**
 * Query fragment to spread into a public site-config request:
 * `{ site }` inside the admin preview, `{}` everywhere else.
 */
export function usePreviewSiteParam(): () => Record<string, string> {
  return () => {
    // Read at call time, not at setup: the preview iframe can be re-pointed at
    // another site without remounting the component tree.
    if (typeof window === 'undefined') return {}
    const siteId = readSiteParam(new URLSearchParams(window.location.search).get('site'))
    return siteId ? { site: siteId } : {}
  }
}
