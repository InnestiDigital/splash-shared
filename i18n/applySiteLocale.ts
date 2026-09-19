/**
 * Drive the vue-i18n UI locale from the resolved SITE locale.
 *
 * Two locale channels exist in this app and were never wired together:
 *   - the CONTENT locale — `resolveContentLocale()` in `useClientConfig`, derived from the
 *     theme's declared `defaultLocale`. It drives `<html lang>`, `og:locale`, content
 *     picking in `useLocalized`, and the server's structured-content resolution;
 *   - the vue-i18n UI locale — `nuxt.config`'s `defaultLocale: 'en-US'`, which drives every
 *     `t()` string in theme components (Footer, ArticleList, ContactForm, HeroBlock…).
 * When they disagree the page declares `lang="it"` and renders English chrome, which is a
 * WCAG 3.1.1 failure: a screen reader pronounces English words with Italian phonemes.
 *
 * The content locale is the single source of truth — the public sites have no locale
 * switcher — so this module only ever pushes content locale → vue-i18n, never the reverse.
 *
 * ⚠️ NEVER call the module's PUBLIC `setLocale()` here. `@nuxtjs/i18n@10.2.3`'s public
 * composer `setLocale` (`dist/runtime/plugins/i18n.js:56`) calls `navigate()` after loading
 * messages, which under the default `prefix_except_default` strategy rewrites the URL to
 * `/<code>/…` against a route table this app builds itself in `pages:extend` — that is what
 * cost `<html lang>` and `og:locale` on an earlier attempt, and the `strategy: 'no_prefix'`
 * edit that "fixed" it was only ever compensating for the navigation. The module's own
 * INTERNAL `ctx.setLocale` (`runtime/context.js:72`) does exactly what this does instead:
 * load the messages, then assign the locale ref. No navigation, no `nuxt.config` change.
 *
 * Messages must be loaded BEFORE the assignment: locale files are lazy-loaded, so assigning
 * `locale.value` alone renders `fallbackLocale` strings for a locale vue-i18n has no bundle for.
 */

/** The narrow slice of the vue-i18n global composer this module needs. */
export interface SiteLocaleI18n {
  locale: { value: string }
  availableLocales: string[] | { value: string[] }
  loadLocaleMessages: (code: string) => Promise<unknown>
}

function isStringRef(value: unknown): value is { value: string } {
  return typeof value === 'object'
    && value !== null
    && 'value' in value
    && typeof (value as { value: unknown }).value === 'string'
}

/**
 * Narrow an unknown `$i18n` to the shape we drive.
 *
 * This guard is the reason the module reads `nuxtApp.$i18n` and not
 * `app.config.globalProperties.$i18n`: the latter is an `ExportedGlobalComposer`, whose
 * `locale` is a BARE STRING and which exposes no `messages` at all. Reading that wrapper is
 * what made three earlier attempts conclude there were "two $i18n objects with different
 * state" — there is one composer; the wrapper just hides most of it.
 */
export function toSiteLocaleI18n(candidate: unknown): SiteLocaleI18n | null {
  if (typeof candidate !== 'object' || candidate === null) return null
  const c = candidate as Record<string, unknown>
  if (!isStringRef(c.locale)) return null
  if (typeof c.loadLocaleMessages !== 'function') return null
  const available = c.availableLocales
  const isList = Array.isArray(available)
    || (typeof available === 'object' && available !== null && Array.isArray((available as { value?: unknown }).value))
  if (!isList) return null
  return candidate as SiteLocaleI18n
}

/**
 * The codes this build actually carries bundles for. `availableLocales` is a plain array on
 * some composer shapes and a ref on others, so every reader goes through here.
 */
export function readAvailableLocales(i18n: SiteLocaleI18n): string[] {
  return Array.isArray(i18n.availableLocales) ? i18n.availableLocales : i18n.availableLocales.value
}

/**
 * Resolve the site's locale code against the codes vue-i18n actually has bundles for.
 * Exact match wins; otherwise fall back to the same base language declared at a different
 * precision (`it` ↔ `it-IT`), which is the same language and a better answer than English.
 */
export function resolveAvailableLocale(code: string, available: string[]): string | null {
  if (available.includes(code)) return code
  const base = code.toLowerCase().split('-')[0]
  return available.find(a => a.toLowerCase().split('-')[0] === base) ?? null
}

/**
 * Point vue-i18n at the site's locale. Idempotent, and a no-op when the locale already
 * matches, so it is safe to call on every navigation.
 *
 * Returns the code actually applied, or `null` when nothing was applied (already correct,
 * unusable `$i18n`, or a locale this build carries no bundle for). Callers get the outcome
 * rather than an exception because a missing bundle is a content-configuration fact, not a
 * program error — it must not take the page down.
 */
export async function applySiteLocale(candidate: unknown, code: string | undefined): Promise<string | null> {
  if (!code) return null

  const i18n = toSiteLocaleI18n(candidate)
  if (!i18n) {
    console.warn('[siteLocale] $i18n does not expose a locale ref + loadLocaleMessages; UI locale left as-is')
    return null
  }

  const resolved = resolveAvailableLocale(code, readAvailableLocales(i18n))
  if (!resolved) {
    console.warn(`[siteLocale] site locale "${code}" has no bundle in this build; UI locale left as-is`)
    return null
  }

  if (i18n.locale.value === resolved) return null

  await i18n.loadLocaleMessages(resolved)
  i18n.locale.value = resolved
  return resolved
}
