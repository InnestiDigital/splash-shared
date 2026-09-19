/**
 * Resolve a UI locale for the surfaces that render BEFORE the site config exists.
 *
 * `pages/index.vue`'s loading + config-error branches and `pages/error.vue` all render
 * either while `/api/site-config` is in flight or after it failed. The site's own locale
 * comes from that config (`resolveContentLocale` reads the theme's `defaultLocale`), so on
 * those surfaces there is nothing to read it from — which is why every string on them was
 * hardcoded English and `<html lang>` asserted the `'en-US'` fallback.
 *
 * The only signal available at that point is the visitor's own browser preference, so that
 * is what these surfaces use: the first `navigator.languages` entry this build carries a
 * bundle for, falling back to the current (default) locale when none matches. It governs
 * BOTH the rendered copy and `<html lang>` — moving one without the other trades one WCAG
 * 3.1.1 failure for another. As soon as the config lands, the site locale takes over
 * (see `shared/plugins/clientConfig.ts`); this is a pre-config answer, never an override.
 */
import {
  readAvailableLocales,
  resolveAvailableLocale,
  toSiteLocaleI18n,
} from './applySiteLocale'

/** The slice of `navigator` this module reads. Kept structural so it is testable in Node. */
export interface LocalePreferenceSource {
  languages?: readonly string[] | null
  language?: string | null
}

/**
 * The visitor's ordered language preferences.
 *
 * `navigator.languages` is the ordered list and is what should drive the choice;
 * `navigator.language` is the single top preference and exists on every browser, so it is
 * kept as the tail fallback rather than assumed absent. Non-string and empty entries are
 * dropped — a hostile or exotic `navigator` must not reach the matcher.
 */
export function readPreferredLocales(source: LocalePreferenceSource | null | undefined): string[] {
  if (!source) return []
  const listed = Array.isArray(source.languages) ? source.languages : []
  const codes = [...listed, source.language]
  const seen = new Set<string>()
  const preferred: string[] = []
  for (const code of codes) {
    if (typeof code !== 'string') continue
    const trimmed = code.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    preferred.push(trimmed)
  }
  return preferred
}

/**
 * First preferred code this build has a bundle for, else `fallback`.
 *
 * Matching is `resolveAvailableLocale`'s — exact code first, then the same base language at
 * a different precision (`it` ↔ `it-IT`) — applied in preference order, so a visitor who
 * asks for `fr-FR, it, en` on a build carrying `it` + `en-US` gets `it`, not English.
 * Always returns a usable code: these surfaces must render something.
 */
export function resolvePreConfigLocale(
  preferred: readonly string[],
  available: readonly string[],
  fallback: string,
): string {
  for (const code of preferred) {
    const match = resolveAvailableLocale(code, [...available])
    if (match) return match
  }
  return fallback
}

/**
 * The pre-config locale for a live `$i18n`, or `null` when that object cannot be driven.
 *
 * Returns `null` rather than a guessed code so the caller leaves both the UI locale and
 * `<html lang>` exactly as they were: with no readable composer there is no way to know
 * which bundles exist, and asserting a language the page does not render is the failure
 * this whole surface is trying to fix.
 */
export function resolveBrowserLocale(
  candidate: unknown,
  source: LocalePreferenceSource | null | undefined,
): string | null {
  const i18n = toSiteLocaleI18n(candidate)
  if (!i18n) return null
  return resolvePreConfigLocale(
    readPreferredLocales(source),
    readAvailableLocales(i18n),
    i18n.locale.value,
  )
}
