import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applySiteLocale, resolveAvailableLocale, toSiteLocaleI18n } from '~/shared/i18n/applySiteLocale'

// A minimal stand-in for the vue-i18n global composer: a `locale` ref, a lazy message
// loader, and the available-locale list. Built by hand rather than mocking vue-i18n so the
// test pins the CONTRACT this module depends on, not a mock's shape.
function makeI18n(overrides: Record<string, unknown> = {}) {
  const loaded: string[] = []
  const i18n = {
    locale: { value: 'en-US' },
    availableLocales: ['en-CA', 'en-US', 'fr-CA', 'it'],
    loadLocaleMessages: vi.fn(async (code: string) => { loaded.push(code) }),
    ...overrides,
  }
  return { i18n, loaded }
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { warn.mockRestore() })

describe('toSiteLocaleI18n', () => {
  it('accepts a composer with a locale ref, a loader and an available-locale array', () => {
    const { i18n } = makeI18n()
    expect(toSiteLocaleI18n(i18n)).toBe(i18n)
  })

  it('accepts availableLocales as a ref', () => {
    const { i18n } = makeI18n({ availableLocales: { value: ['it', 'en-US'] } })
    expect(toSiteLocaleI18n(i18n)).toBe(i18n)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'en-US'],
    ['a number', 42],
  ])('rejects %s', (_label, candidate) => {
    expect(toSiteLocaleI18n(candidate)).toBeNull()
  })

  // The regression this guard exists for: `app.config.globalProperties.$i18n` is an
  // ExportedGlobalComposer whose `locale` is a BARE STRING. Driving that object is what
  // made earlier attempts believe there were two divergent $i18n instances.
  it('rejects the ExportedGlobalComposer shape (locale is a bare string)', () => {
    const { i18n } = makeI18n({ locale: 'en-US' })
    expect(toSiteLocaleI18n(i18n)).toBeNull()
  })

  it('rejects a composer with no loadLocaleMessages', () => {
    const { i18n } = makeI18n({ loadLocaleMessages: undefined })
    expect(toSiteLocaleI18n(i18n)).toBeNull()
  })

  it('rejects a composer whose availableLocales is neither an array nor a ref of one', () => {
    const { i18n } = makeI18n({ availableLocales: 'it' })
    expect(toSiteLocaleI18n(i18n)).toBeNull()
  })
})

describe('resolveAvailableLocale', () => {
  it('prefers an exact match', () => {
    expect(resolveAvailableLocale('it', ['it-IT', 'it', 'en-US'])).toBe('it')
  })

  it('falls back to the same base language at a different precision', () => {
    expect(resolveAvailableLocale('it', ['en-US', 'it-IT'])).toBe('it-IT')
    expect(resolveAvailableLocale('it-IT', ['en-US', 'it'])).toBe('it')
  })

  it('matches the base language case-insensitively', () => {
    expect(resolveAvailableLocale('IT-it', ['en-US', 'it'])).toBe('it')
  })

  it('returns null when no bundle shares the base language', () => {
    expect(resolveAvailableLocale('de', ['en-US', 'it'])).toBeNull()
  })
})

describe('applySiteLocale', () => {
  it('loads the messages and then assigns the locale', async () => {
    const { i18n, loaded } = makeI18n()
    expect(await applySiteLocale(i18n, 'it')).toBe('it')
    expect(loaded).toEqual(['it'])
    expect(i18n.locale.value).toBe('it')
  })

  // Order matters and is not cosmetic: locale files are lazy-loaded, so assigning first
  // renders one frame of fallback-locale strings.
  it('has the messages loaded BEFORE the locale is assigned', async () => {
    const { i18n } = makeI18n()
    let localeAtLoadTime: string | null = null
    i18n.loadLocaleMessages = vi.fn(async () => { localeAtLoadTime = i18n.locale.value })
    await applySiteLocale(i18n, 'it')
    expect(localeAtLoadTime).toBe('en-US')
    expect(i18n.locale.value).toBe('it')
  })

  it('applies the base-language match when the exact code has no bundle', async () => {
    const { i18n, loaded } = makeI18n({ availableLocales: ['en-US', 'it'] })
    expect(await applySiteLocale(i18n, 'it-IT')).toBe('it')
    expect(loaded).toEqual(['it'])
    expect(i18n.locale.value).toBe('it')
  })

  it('is a no-op when the locale already matches', async () => {
    const { i18n, loaded } = makeI18n({ locale: { value: 'it' } })
    expect(await applySiteLocale(i18n, 'it')).toBeNull()
    expect(loaded).toEqual([])
  })

  it.each([
    ['an empty code', ''],
    ['no code', undefined],
  ])('does nothing for %s', async (_label, code) => {
    const { i18n, loaded } = makeI18n()
    expect(await applySiteLocale(i18n, code as string | undefined)).toBeNull()
    expect(loaded).toEqual([])
    expect(i18n.locale.value).toBe('en-US')
  })

  it('warns and leaves the locale alone when $i18n is not drivable', async () => {
    expect(await applySiteLocale({ locale: 'en-US' }, 'it')).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('warns and leaves the locale alone when the build carries no bundle for the site locale', async () => {
    const { i18n, loaded } = makeI18n()
    expect(await applySiteLocale(i18n, 'de')).toBeNull()
    expect(loaded).toEqual([])
    expect(i18n.locale.value).toBe('en-US')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('propagates a failed message load rather than assigning a locale with no messages', async () => {
    const { i18n } = makeI18n()
    i18n.loadLocaleMessages = vi.fn(async () => { throw new Error('network down') })
    await expect(applySiteLocale(i18n, 'it')).rejects.toThrow('network down')
    expect(i18n.locale.value).toBe('en-US')
  })
})
