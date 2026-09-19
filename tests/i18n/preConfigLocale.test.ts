import { describe, it, expect } from 'vitest'
import {
  readPreferredLocales,
  resolvePreConfigLocale,
  resolveBrowserLocale,
} from '~/shared/i18n/preConfigLocale'

// Imported DIRECTLY: this module's only app-side consumers are `shared/plugins/` and
// `pages/**`, and vitest excludes pages — without a direct import nothing in the suite
// reaches it and its mutation shard dies with `No tests were executed`.

describe('readPreferredLocales', () => {
  it('keeps navigator.languages in order', () => {
    expect(readPreferredLocales({ languages: ['it-IT', 'it', 'en-US'] }))
      .toEqual(['it-IT', 'it', 'en-US'])
  })

  it('appends navigator.language as the tail fallback, deduped', () => {
    expect(readPreferredLocales({ languages: ['fr-CA'], language: 'fr-CA' })).toEqual(['fr-CA'])
    expect(readPreferredLocales({ languages: ['fr-CA'], language: 'en-US' })).toEqual(['fr-CA', 'en-US'])
  })

  it('falls back to navigator.language when the list is absent', () => {
    expect(readPreferredLocales({ language: 'it' })).toEqual(['it'])
  })

  it('drops non-string and blank entries rather than passing them to the matcher', () => {
    const hostile = { languages: ['', '  ', 42, null, 'it'] as unknown as string[], language: undefined }
    expect(readPreferredLocales(hostile)).toEqual(['it'])
  })

  it('returns nothing for a missing navigator (server / non-browser)', () => {
    expect(readPreferredLocales(null)).toEqual([])
    expect(readPreferredLocales(undefined)).toEqual([])
  })
})

describe('resolvePreConfigLocale', () => {
  const AVAILABLE = ['en-US', 'en-CA', 'fr-CA', 'it']

  it('takes the first preference this build has a bundle for', () => {
    expect(resolvePreConfigLocale(['it', 'en-US'], AVAILABLE, 'en-US')).toBe('it')
  })

  it('skips preferences with no bundle instead of falling straight back', () => {
    // The defect this guards: a `de-DE, it` visitor getting English because the FIRST
    // preference missed.
    expect(resolvePreConfigLocale(['de-DE', 'es-ES', 'it'], AVAILABLE, 'en-US')).toBe('it')
  })

  it('matches a base language declared at a different precision', () => {
    expect(resolvePreConfigLocale(['it-IT'], AVAILABLE, 'en-US')).toBe('it')
    expect(resolvePreConfigLocale(['fr'], AVAILABLE, 'en-US')).toBe('fr-CA')
  })

  it('prefers an exact code over a same-language variant later in the list', () => {
    expect(resolvePreConfigLocale(['en-CA'], AVAILABLE, 'en-US')).toBe('en-CA')
  })

  it('falls back when nothing matches, and when there are no preferences at all', () => {
    expect(resolvePreConfigLocale(['de-DE', 'ja'], AVAILABLE, 'en-US')).toBe('en-US')
    expect(resolvePreConfigLocale([], AVAILABLE, 'en-US')).toBe('en-US')
  })

  it('returns the fallback rather than throwing when the build carries no bundles', () => {
    expect(resolvePreConfigLocale(['it'], [], 'en-US')).toBe('en-US')
  })
})

describe('resolveBrowserLocale', () => {
  const i18n = (available: string[] = ['en-US', 'it'], initial = 'en-US') => ({
    locale: { value: initial },
    availableLocales: available,
    loadLocaleMessages: async () => {},
  })

  it('resolves against the composer\'s own available list', () => {
    expect(resolveBrowserLocale(i18n(), { languages: ['it-IT'] })).toBe('it')
  })

  it('reads availableLocales when it is a ref rather than an array', () => {
    const composer = { ...i18n(), availableLocales: { value: ['en-US', 'fr-CA'] } }
    expect(resolveBrowserLocale(composer, { languages: ['fr'] })).toBe('fr-CA')
  })

  it('falls back to the composer\'s CURRENT locale, not a hardcoded one', () => {
    // A build whose default is not English must not be dragged to English by a visitor
    // whose language it carries no bundle for.
    expect(resolveBrowserLocale(i18n(['it', 'en-US'], 'it'), { languages: ['ja'] })).toBe('it')
  })

  it('returns null for an $i18n it cannot drive, so nothing is asserted', () => {
    // `ExportedGlobalComposer` — a bare string locale, no loader. Guessing a code here
    // would declare a language the page will not render.
    expect(resolveBrowserLocale({ locale: 'en-US' }, { languages: ['it'] })).toBeNull()
    expect(resolveBrowserLocale(null, { languages: ['it'] })).toBeNull()
    expect(resolveBrowserLocale(undefined, { languages: ['it'] })).toBeNull()
  })

  it('still answers with the current locale when there is no navigator', () => {
    expect(resolveBrowserLocale(i18n(), null)).toBe('en-US')
  })
})
