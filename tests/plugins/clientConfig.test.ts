import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref, type ComputedRef } from 'vue'

// --- Mocks ---

const mockLoadClientConfig = vi.fn()
const mockLoadEnvConfig = vi.fn()

// The site's CONTENT locale, as `useClientConfig` exposes it: a computed that reads ''
// until the config lands. Both behaviours this file pins — `<html lang>` and the vue-i18n
// sync — are driven by it, so it must be a real reactive source, not a literal.
const siteLocale = ref('')

// Whether the config has landed. It is what discriminates "the site says en-US" from "there
// is no site config yet" — the plugin's `locale` falls back to 'en-US' either way — so the
// pre-config surfaces' language hangs off this flag, not off an empty locale.
const hasLoadedConfig = ref(false)

const mockPrefetchPageBlocks = vi.fn()
const mockConfig = ref<any>({ configVersion: 'v1' })

vi.mock('~/shared/composables/useClientConfig', () => ({
    useClientConfig: () => ({
        loadClientConfig: mockLoadClientConfig,
        locale: computed(() => siteLocale.value),
        hasLoadedConfig: computed(() => hasLoadedConfig.value),
        config: mockConfig,
        prefetchPageBlocks: mockPrefetchPageBlocks,
    })
}))

vi.mock('~/shared/composables/useEnvConfig', () => ({
    useEnvConfig: () => ({
        loadEnvConfig: mockLoadEnvConfig,
    })
}))

// Capture what the plugin hands to `useHead`. It must stay a COMPUTED — the locale is
// empty at registration time, so a one-shot object would pin `<html>` to no language
// forever. `#imports` resolves to tests/helpers/nuxt-stubs.ts (vitest.config alias);
// keep its other exports so nothing else in the graph loses them.
const mockUseHead = vi.fn()
vi.mock('#imports', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useHead: (input: unknown) => mockUseHead(input),
}))

let mockRoutePath = '/'
vi.stubGlobal('useRoute', () => ({
    path: mockRoutePath,
    query: {},
}))

// Capture the afterEach callback registered by the plugin
let capturedAfterEach: ((to: { path: string }) => Promise<void>) | null = null
const mockRouter = {
    afterEach: vi.fn((cb: (to: { path: string }) => Promise<void>) => {
        capturedAfterEach = cb
    }),
}
vi.stubGlobal('useRouter', () => mockRouter)

// Mock defineNuxtPlugin to capture the plugin function for testing
let capturedPluginFn: ((nuxtApp: unknown) => Promise<void>) | null = null
vi.stubGlobal('defineNuxtPlugin', (fn: (nuxtApp: unknown) => Promise<void>) => {
    capturedPluginFn = fn
    return fn
})

/**
 * The narrow slice of the vue-i18n global composer `applySiteLocale` drives, built as a
 * plain object rather than a mock of that module: the defect class this test exists to
 * catch is the plugin handing over the WRONG object (three earlier attempts at the locale
 * fix reached `globalProperties.$i18n`, whose `locale` is a bare string), and a stubbed
 * `applySiteLocale` would accept anything at all.
 */
function createI18n(available: string[] = ['en-US', 'it-IT'], initial = 'en-US') {
    return {
        locale: { value: initial },
        availableLocales: available,
        loadLocaleMessages: vi.fn(async () => {}),
    }
}

/** The last head input the plugin registered, typed as what it must be. */
function lastHead(): ComputedRef<{ htmlAttrs: { lang?: string } }> {
    const input = mockUseHead.mock.calls.at(-1)?.[0]
    expect(input).toBeDefined()
    return input as ComputedRef<{ htmlAttrs: { lang?: string } }>
}

/**
 * The visitor's browser preference, which is the ONLY locale signal the pre-config surfaces
 * have. Stubbed on every run: the real `globalThis.navigator` exists under Node 22 and
 * reports whatever language the machine running the suite is set to, so leaving it alone
 * makes these assertions depend on the developer's OS.
 */
function stubNavigator(source: { languages?: string[], language?: string } | undefined) {
    vi.stubGlobal('navigator', source)
}

// Import the plugin — the side effect calls defineNuxtPlugin, captured above
beforeEach(async () => {
    mockLoadClientConfig.mockReset()
    mockLoadEnvConfig.mockReset()
    mockRouter.afterEach.mockClear()
    mockUseHead.mockClear()
    mockPrefetchPageBlocks.mockClear()
    capturedAfterEach = null
    mockRoutePath = '/'
    siteLocale.value = ''
    hasLoadedConfig.value = false
    // Default: a visitor whose language IS the build default, so the pre-config sync is a
    // no-op and the cases below measure only what they name.
    stubNavigator({ languages: ['en-US'], language: 'en-US' })
})

// Trigger the import (runs once; capturedPluginFn set from the side effect)
await import('~/shared/plugins/clientConfig')

// --- Tests ---

describe('clientConfig plugin — initial load', () => {
    it('loads both configs in parallel on public routes', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockResolvedValue({})

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockLoadClientConfig).toHaveBeenCalledTimes(1)
        expect(mockLoadEnvConfig).toHaveBeenCalledTimes(1)
    })

    // The page fetch used to start only when DynamicPage mounted — measured as
    // an 84ms gap after /api/site-config finished. It is fired here instead,
    // before syncUiLocale's lazy bundle await and before the route component
    // mounts, and is deliberately NOT awaited.
    it('starts the page fetch as soon as the config lands', async () => {
        mockRoutePath = '/lavori/launch'
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockResolvedValue({})

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockPrefetchPageBlocks).toHaveBeenCalledWith('lavori/launch', 'v1')
    })

    it('does not prefetch a page on admin or preview routes', async () => {
        mockRoutePath = '/admin/editor'
        await capturedPluginFn!({ $i18n: createI18n() })
        expect(mockPrefetchPageBlocks).not.toHaveBeenCalled()

        mockRoutePath = '/__preview'
        await capturedPluginFn!({ $i18n: createI18n() })
        expect(mockPrefetchPageBlocks).not.toHaveBeenCalled()
    })

    it('skips config loading on admin routes', async () => {
        mockRoutePath = '/admin/editor'

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockLoadClientConfig).not.toHaveBeenCalled()
        expect(mockLoadEnvConfig).not.toHaveBeenCalled()
    })

    it('skips config loading on preview routes', async () => {
        mockRoutePath = '/__preview'

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockLoadClientConfig).not.toHaveBeenCalled()
        expect(mockLoadEnvConfig).not.toHaveBeenCalled()
    })

    it('catches error from loadClientConfig without re-throwing', async () => {
        const mockError = new Error('Network failure')
        mockLoadClientConfig.mockRejectedValue(mockError)
        mockLoadEnvConfig.mockResolvedValue({})

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        // Plugin should not throw
        await expect(capturedPluginFn!({ $i18n: createI18n() })).resolves.not.toThrow()

        expect(consoleSpy).toHaveBeenCalledWith(
            '[ClientConfig] Failed to load config:',
            mockError
        )

        consoleSpy.mockRestore()
    })

    it('catches error from loadEnvConfig without re-throwing', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockRejectedValue(new Error('Env load failed'))

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(capturedPluginFn!({ $i18n: createI18n() })).resolves.not.toThrow()

        expect(consoleSpy).toHaveBeenCalledWith(
            '[ClientConfig] Failed to load config:',
            expect.any(Error)
        )

        consoleSpy.mockRestore()
    })

    it('registers a router.afterEach hook', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockResolvedValue({})

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockRouter.afterEach).toHaveBeenCalledTimes(1)
    })
})

describe('clientConfig plugin — <html lang> (WCAG 3.1.1)', () => {
    beforeEach(() => {
        mockLoadEnvConfig.mockResolvedValue({})
    })

    it('registers the head entry BEFORE the config awaits', async () => {
        // After an await the Nuxt instance context is gone and `useHead` cannot resolve the
        // head instance — so registration must happen on the synchronous path. Hold the
        // config open and assert the call already landed.
        let releaseConfig: (value: unknown) => void = () => {}
        mockLoadClientConfig.mockReturnValue(new Promise((resolve) => { releaseConfig = resolve }))

        const running = capturedPluginFn!({ $i18n: createI18n() })

        expect(mockUseHead).toHaveBeenCalledTimes(1)

        releaseConfig({})
        await running
    })

    it('emits NO lang attribute when nothing can resolve one', async () => {
        mockLoadClientConfig.mockResolvedValue({})

        // An `ExportedGlobalComposer` (bare string locale) exposes no available-locale list,
        // so there is no browser fallback either — and nothing is asserted rather than a
        // language the page will not render.
        await capturedPluginFn!({ $i18n: { locale: 'en-US' } })

        expect(lastHead().value.htmlAttrs).toEqual({})
    })

    it('emits lang once the site locale resolves, without re-registering', async () => {
        mockLoadClientConfig.mockResolvedValue({})

        await capturedPluginFn!({ $i18n: { locale: 'en-US' } })
        const head = lastHead()
        expect(head.value.htmlAttrs.lang).toBeUndefined()

        // The config landing is what resolves the locale; the head entry must follow it.
        hasLoadedConfig.value = true
        siteLocale.value = 'it-IT'

        expect(head.value.htmlAttrs).toEqual({ lang: 'it-IT' })
        expect(mockUseHead).toHaveBeenCalledTimes(1)
    })

    it('registers the head entry even on admin routes, where no config is loaded', async () => {
        mockRoutePath = '/admin/editor'

        await capturedPluginFn!({ $i18n: createI18n() })

        expect(mockUseHead).toHaveBeenCalledTimes(1)
    })
})

describe('clientConfig plugin — vue-i18n UI locale sync', () => {
    beforeEach(() => {
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockResolvedValue({})
    })

    it('drives the vue-i18n locale from the site locale after the config lands', async () => {
        siteLocale.value = 'it-IT'
        const i18n = createI18n()

        await capturedPluginFn!({ $i18n: i18n })

        expect(i18n.loadLocaleMessages).toHaveBeenCalledWith('it-IT')
        expect(i18n.locale.value).toBe('it-IT')
    })

    it('leaves the UI locale alone on admin routes', async () => {
        mockRoutePath = '/admin/editor'
        siteLocale.value = 'it-IT'
        const i18n = createI18n()

        await capturedPluginFn!({ $i18n: i18n })

        expect(i18n.loadLocaleMessages).not.toHaveBeenCalled()
        expect(i18n.locale.value).toBe('en-US')
    })

    it('syncs on the admin→public navigation, where boot already ran without a config', async () => {
        mockRoutePath = '/admin/editor'
        const i18n = createI18n()
        await capturedPluginFn!({ $i18n: i18n })
        expect(i18n.loadLocaleMessages).not.toHaveBeenCalled()

        siteLocale.value = 'it-IT'
        await capturedAfterEach!({ path: '/' })

        expect(i18n.locale.value).toBe('it-IT')
    })

    it('does not take the page down when the locale bundle fails to load', async () => {
        siteLocale.value = 'it-IT'
        const i18n = createI18n()
        const loadError = new Error('chunk load failed')
        i18n.loadLocaleMessages.mockRejectedValue(loadError)

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(capturedPluginFn!({ $i18n: i18n })).resolves.not.toThrow()

        expect(consoleSpy).toHaveBeenCalledWith(
            '[ClientConfig] Failed to apply the site locale to vue-i18n:',
            loadError
        )
        // The theme falls back to the default locale's strings — degraded, still rendering.
        expect(i18n.locale.value).toBe('en-US')

        consoleSpy.mockRestore()
    })
})

describe('clientConfig plugin — pre-config locale (loading + config-error surfaces)', () => {
    beforeEach(() => {
        mockLoadEnvConfig.mockResolvedValue({})
    })

    it('puts BOTH vue-i18n and <html lang> on the browser locale before the config lands', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        stubNavigator({ languages: ['it-IT', 'it'], language: 'it-IT' })
        const i18n = createI18n(['en-US', 'it'])

        await capturedPluginFn!({ $i18n: i18n })

        // The two must agree: Italian copy under `lang="en-US"` is the same WCAG 3.1.1
        // failure the site-locale fix removed, just moved to another surface.
        expect(i18n.locale.value).toBe('it')
        expect(lastHead().value.htmlAttrs).toEqual({ lang: 'it' })
    })

    it('applies it BEFORE the config await — the window those surfaces render in', async () => {
        let releaseConfig: (value: unknown) => void = () => {}
        mockLoadClientConfig.mockReturnValue(new Promise((resolve) => { releaseConfig = resolve }))
        stubNavigator({ languages: ['fr-CA'] })
        const i18n = createI18n(['en-US', 'fr-CA'])

        const running = capturedPluginFn!({ $i18n: i18n })
        // Flush pending microtasks WITHOUT resolving the config — the state the loading
        // spinner is actually on screen in.
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(i18n.locale.value).toBe('fr-CA')
        expect(lastHead().value.htmlAttrs).toEqual({ lang: 'fr-CA' })

        releaseConfig({})
        await running
    })

    it('is superseded by the site locale as soon as the config lands', async () => {
        stubNavigator({ languages: ['fr-CA'] })
        const i18n = createI18n(['en-US', 'fr-CA', 'it'])
        mockLoadClientConfig.mockImplementation(async () => {
            hasLoadedConfig.value = true
            siteLocale.value = 'it'
        })

        await capturedPluginFn!({ $i18n: i18n })

        expect(i18n.locale.value).toBe('it')
        expect(lastHead().value.htmlAttrs).toEqual({ lang: 'it' })
    })

    it('does NOT re-apply the browser locale on a navigation once the config has loaded', async () => {
        // Otherwise every public→public navigation flashes the visitor's language over the
        // site's own before the (no-op) config load resolves.
        mockLoadClientConfig.mockResolvedValue({})
        stubNavigator({ languages: ['fr-CA'] })
        const i18n = createI18n(['en-US', 'fr-CA', 'it'])
        // Boot from admin so the pre-config sync has not run yet — this case is about the
        // NAVIGATION hook, not about boot.
        mockRoutePath = '/admin/editor'
        await capturedPluginFn!({ $i18n: i18n })

        hasLoadedConfig.value = true
        siteLocale.value = 'it'
        await capturedAfterEach!({ path: '/servizi' })

        expect(i18n.locale.value).toBe('it')
        expect(i18n.loadLocaleMessages).not.toHaveBeenCalledWith('fr-CA')
    })

    it('leaves the UI locale alone on admin routes', async () => {
        mockRoutePath = '/admin/editor'
        stubNavigator({ languages: ['it'] })
        const i18n = createI18n(['en-US', 'it'])

        await capturedPluginFn!({ $i18n: i18n })

        expect(i18n.locale.value).toBe('en-US')
    })

    it('keeps the build default when the visitor asks for a language this build has no bundle for', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        stubNavigator({ languages: ['de-DE', 'ja'] })
        const i18n = createI18n(['en-US', 'it'])

        await capturedPluginFn!({ $i18n: i18n })

        expect(i18n.locale.value).toBe('en-US')
        expect(lastHead().value.htmlAttrs).toEqual({ lang: 'en-US' })
    })

    it('does not take the page down when the browser locale bundle fails to load', async () => {
        mockLoadClientConfig.mockResolvedValue({})
        stubNavigator({ languages: ['it'] })
        const i18n = createI18n(['en-US', 'it'])
        const loadError = new Error('chunk load failed')
        i18n.loadLocaleMessages.mockRejectedValue(loadError)

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(capturedPluginFn!({ $i18n: i18n })).resolves.not.toThrow()

        expect(consoleSpy).toHaveBeenCalledWith(
            '[ClientConfig] Failed to apply the pre-config locale to vue-i18n:',
            loadError
        )
        expect(i18n.locale.value).toBe('en-US')
        // And the document must NOT claim a language whose strings never arrived.
        expect(lastHead().value.htmlAttrs.lang).not.toBe('it')

        consoleSpy.mockRestore()
    })
})

describe('clientConfig plugin — router.afterEach (admin→public SPA nav)', () => {
    beforeEach(async () => {
        // Boot from admin route so initial load is skipped
        mockRoutePath = '/admin/editor'
        mockLoadClientConfig.mockResolvedValue({})
        mockLoadEnvConfig.mockResolvedValue({})
        await capturedPluginFn!({ $i18n: createI18n() })
        // Reset call counts after setup so assertions are clean
        mockLoadClientConfig.mockClear()
        mockLoadEnvConfig.mockClear()
    })

    it('loads config when navigating to a public route', async () => {
        await capturedAfterEach!({ path: '/' })

        expect(mockLoadClientConfig).toHaveBeenCalledTimes(1)
        expect(mockLoadEnvConfig).toHaveBeenCalledTimes(1)
    })

    it('does not load config when navigating to an admin route', async () => {
        await capturedAfterEach!({ path: '/admin/dashboard' })

        expect(mockLoadClientConfig).not.toHaveBeenCalled()
        expect(mockLoadEnvConfig).not.toHaveBeenCalled()
    })

    it('does not load config when navigating to a preview route', async () => {
        await capturedAfterEach!({ path: '/__preview' })

        expect(mockLoadClientConfig).not.toHaveBeenCalled()
        expect(mockLoadEnvConfig).not.toHaveBeenCalled()
    })

    it('catches errors in afterEach without re-throwing', async () => {
        mockLoadClientConfig.mockRejectedValue(new Error('Nav load failed'))
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(capturedAfterEach!({ path: '/home' })).resolves.not.toThrow()

        expect(consoleSpy).toHaveBeenCalledWith(
            '[ClientConfig] Failed to load config on navigation:',
            expect.any(Error)
        )

        consoleSpy.mockRestore()
    })
})
