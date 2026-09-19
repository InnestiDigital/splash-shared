import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'
import type { ClientConfig } from '~/shared/types/previewMessages'

// --- Mocks ---

// Mock useCmsPreview
const mockPreviewConfig = ref<ClientConfig | null>(null)
let mockIsInPreviewMode = false

vi.mock('~/shared/composables/useCmsPreview', () => ({
    useCmsPreview: () => ({
        previewConfig: mockPreviewConfig,
        isInPreviewMode: () => mockIsInPreviewMode,
    })
}))

// Mock Nuxt auto-imports: useState, useRoute, $fetch
const stateStore = new Map<string, Ref>()
vi.stubGlobal('useState', (key: string, init?: () => any) => {
    if (!stateStore.has(key)) {
        stateStore.set(key, ref(init ? init() : undefined))
    }
    return stateStore.get(key)!
})

const mockRouteQuery: Record<string, string> = {}
vi.stubGlobal('useRoute', () => ({
    path: '/',
    query: mockRouteQuery,
}))

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useClientConfig } from '~/shared/composables/useClientConfig'

// --- Helpers ---

function makeConfig(overrides: Partial<ClientConfig> = {}): ClientConfig {
    return {
        theme: 'test-theme',
        themeSettings: { primaryColor: '#ff0000' },
        navigation: {
            header: { logo: '/logo.png' },
            footer: { copyrightText: { 'en-US': '2026' } },
        },
        pages: {
            home: {
                title: { 'en-US': 'Home' },
                layout: 'default',
                dynamic: false,
                meta: {},
                blocks: [],
            },
            shop: {
                title: { 'en-US': 'Shop' },
                layout: 'default',
                dynamic: false,
                meta: {},
                blocks: [],
                pages: {
                    'product-detail': {
                        title: { 'en-US': 'Product Detail' },
                        layout: 'default',
                        dynamic: true,
                        meta: {},
                        blocks: [],
                    },
                },
            },
        },
        typography: { fontFamily: 'Inter' },
        ...overrides,
    }
}

// --- Tests ---

describe('useClientConfig', () => {
    beforeEach(() => {
        stateStore.clear()
        mockPreviewConfig.value = null
        mockIsInPreviewMode = false
        mockFetch.mockReset()
        // Clear route query
        Object.keys(mockRouteQuery).forEach(k => delete mockRouteQuery[k])
    })

    describe('config computed', () => {
        it('returns EMPTY_CONFIG when no config is loaded (non-preview)', () => {
            const { config } = useClientConfig()

            expect(config.value).toEqual({
                theme: '',
                themeSettings: {},
                navigation: {},
                pages: {},
                childSites: {},
            })
        })

        it('returns runtime config after loadClientConfig', async () => {
            const testConfig = makeConfig()
            mockFetch.mockResolvedValueOnce(testConfig)

            const { loadClientConfig, config } = useClientConfig()
            await loadClientConfig()

            expect(config.value).toEqual(testConfig)
        })

        it('returns preview config when in preview mode', () => {
            mockIsInPreviewMode = true
            const previewCfg = makeConfig({ theme: 'preview-theme' })
            mockPreviewConfig.value = previewCfg

            const { config } = useClientConfig()

            expect(config.value.theme).toBe('preview-theme')
        })

        it('returns EMPTY_CONFIG in preview mode when preview config not yet received', () => {
            mockIsInPreviewMode = true
            mockPreviewConfig.value = null

            const { config } = useClientConfig()

            expect(config.value).toEqual({
                theme: '',
                themeSettings: {},
                navigation: {},
                pages: {},
                childSites: {},
            })
        })

        it('preview config takes priority over runtime config', async () => {
            const runtimeCfg = makeConfig({ theme: 'runtime' })
            mockFetch.mockResolvedValueOnce(runtimeCfg)

            const { loadClientConfig, config } = useClientConfig()
            await loadClientConfig()

            // Now switch to preview mode
            mockIsInPreviewMode = true
            const previewCfg = makeConfig({ theme: 'preview' })
            mockPreviewConfig.value = previewCfg

            expect(config.value.theme).toBe('preview')
        })
    })

    describe('hasLoadedConfig', () => {
        it('is false initially', () => {
            const { hasLoadedConfig } = useClientConfig()
            expect(hasLoadedConfig.value).toBe(false)
        })

        it('is true after loadClientConfig succeeds', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig, hasLoadedConfig } = useClientConfig()
            await loadClientConfig()

            expect(hasLoadedConfig.value).toBe(true)
        })

        it('reflects preview config availability in preview mode', () => {
            mockIsInPreviewMode = true

            const { hasLoadedConfig } = useClientConfig()
            expect(hasLoadedConfig.value).toBe(false)

            mockPreviewConfig.value = makeConfig()
            expect(hasLoadedConfig.value).toBe(true)
        })
    })

    describe('loadClientConfig', () => {
        it('fetches from /api/site-config', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig } = useClientConfig()
            await loadClientConfig()

            expect(mockFetch).toHaveBeenCalledWith('/api/site-config')
        })

        it('returns cached config on second call (no re-fetch)', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig } = useClientConfig()
            await loadClientConfig()
            const result = await loadClientConfig()

            expect(mockFetch).toHaveBeenCalledTimes(1)
            expect(result.theme).toBe('test-theme')
        })

        it('forwards ?site= query param from route', async () => {
            mockRouteQuery.site = 'site-123'
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig } = useClientConfig()
            await loadClientConfig()

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('site=site-123')
            )
        })

        it('adds cache-bust param on force reload', async () => {
            mockFetch.mockResolvedValue(makeConfig())

            const { loadClientConfig } = useClientConfig()
            await loadClientConfig()
            mockFetch.mockClear()

            await loadClientConfig(true)

            expect(mockFetch).toHaveBeenCalledTimes(1)
            const url = mockFetch.mock.calls[0][0] as string
            expect(url).toContain('t=')
        })
    })

    describe('reloadClientConfig', () => {
        it('forces re-fetch even if already loaded', async () => {
            mockFetch.mockResolvedValue(makeConfig())

            const { loadClientConfig, reloadClientConfig } = useClientConfig()
            await loadClientConfig()
            mockFetch.mockClear()

            await reloadClientConfig()

            expect(mockFetch).toHaveBeenCalledTimes(1)
        })
    })

    describe('getPage', () => {
        it('returns undefined for empty pageId', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, getPage } = useClientConfig()
            await loadClientConfig()

            expect(getPage('')).toBeUndefined()
        })

        it('returns top-level page by slug', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, getPage } = useClientConfig()
            await loadClientConfig()

            const page = getPage('home')
            expect(page).toBeDefined()
            expect(page.title).toEqual({ 'en-US': 'Home' })
        })

        it('returns nested page by path', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, getPage } = useClientConfig()
            await loadClientConfig()

            const page = getPage('shop/product-detail')
            expect(page).toBeDefined()
            expect(page.title).toEqual({ 'en-US': 'Product Detail' })
        })

        it('returns undefined for nonexistent page', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, getPage } = useClientConfig()
            await loadClientConfig()

            expect(getPage('nonexistent')).toBeUndefined()
        })

        it('returns undefined for nonexistent nested path', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, getPage } = useClientConfig()
            await loadClientConfig()

            expect(getPage('shop/nonexistent')).toBeUndefined()
        })
    })

    describe('buildUrlFromPageId', () => {
        it('returns "#" for undefined pageId', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, buildUrlFromPageId } = useClientConfig()
            await loadClientConfig()

            expect(buildUrlFromPageId(undefined)).toBe('#')
        })

        it('returns "#" for nonexistent page', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, buildUrlFromPageId } = useClientConfig()
            await loadClientConfig()

            expect(buildUrlFromPageId('missing-page')).toBe('#')
        })

        it('builds URL for top-level page', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, buildUrlFromPageId } = useClientConfig()
            await loadClientConfig()

            expect(buildUrlFromPageId('home')).toBe('/home')
        })

        it('builds URL for nested page', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, buildUrlFromPageId } = useClientConfig()
            await loadClientConfig()

            expect(buildUrlFromPageId('product-detail')).toBe('/shop/product-detail')
        })
    })

    describe('computed properties', () => {
        it('navigation returns config navigation', async () => {
            const cfg = makeConfig()
            mockFetch.mockResolvedValueOnce(cfg)

            const { loadClientConfig, navigation } = useClientConfig()
            await loadClientConfig()

            expect(navigation.value).toEqual(cfg.navigation)
        })

        it('themeSettings returns config themeSettings', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig, themeSettings } = useClientConfig()
            await loadClientConfig()

            expect(themeSettings.value).toEqual({ primaryColor: '#ff0000' })
        })

        it('typography returns config typography', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig, typography } = useClientConfig()
            await loadClientConfig()

            expect(typography.value).toEqual({ fontFamily: 'Inter' })
        })

        it('themeName returns config theme', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig, themeName } = useClientConfig()
            await loadClientConfig()

            expect(themeName.value).toBe('test-theme')
        })

        it('locale is always en-US', () => {
            const { locale } = useClientConfig()
            expect(locale.value).toBe('en-US')
        })

        it('pagesTree returns empty object when no pages', () => {
            const { config } = useClientConfig()
            // config is EMPTY_CONFIG, pages should be {}
            expect(config.value.pages).toEqual({})
        })
    })

    describe('childSites', () => {
        it('returns empty object when no config loaded', () => {
            const { childSites } = useClientConfig()
            expect(childSites.value).toEqual({})
        })

        it('returns empty object when config has no childSites', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())
            const { loadClientConfig, childSites } = useClientConfig()
            await loadClientConfig()

            expect(childSites.value).toEqual({})
        })

        it('returns childSites map from config', async () => {
            const childSitesData = {
                shop: {
                    siteId: 'child-1',
                    theme: 'standalone',
                    themeSettings: { color: 'red' },
                    apiConfig: {},
                    envConfig: {},
                    navigation: { header: { logo: '/child-logo.png' } },
                },
            }
            mockFetch.mockResolvedValueOnce(makeConfig({ childSites: childSitesData }))
            const { loadClientConfig, childSites } = useClientConfig()
            await loadClientConfig()

            expect(childSites.value).toEqual(childSitesData)
            expect(childSites.value.shop.theme).toBe('standalone')
        })
    })

    describe('isConfigLoaded and configError', () => {
        it('isConfigLoaded is false initially', () => {
            const { isConfigLoaded } = useClientConfig()
            expect(isConfigLoaded.value).toBe(false)
        })

        it('isConfigLoaded becomes true after loading', async () => {
            mockFetch.mockResolvedValueOnce(makeConfig())

            const { loadClientConfig, isConfigLoaded } = useClientConfig()
            await loadClientConfig()

            expect(isConfigLoaded.value).toBe(true)
        })

        it('configError is null initially', () => {
            const { configError } = useClientConfig()
            expect(configError.value).toBeNull()
        })

        it('sets configError when fetch fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('500 Server Error'))

            const { loadClientConfig, configError, isConfigLoaded } = useClientConfig()

            await expect(loadClientConfig()).rejects.toThrow('500 Server Error')
            expect(configError.value).toBe('500 Server Error')
            expect(isConfigLoaded.value).toBe(false)
        })

        it('sets generic configError for non-Error rejections', async () => {
            mockFetch.mockRejectedValueOnce('network down')

            const { loadClientConfig, configError } = useClientConfig()

            await expect(loadClientConfig()).rejects.toBe('network down')
            expect(configError.value).toBe('Failed to load configuration')
        })

        it('clears configError on successful reload after failure', async () => {
            // First call fails
            mockFetch.mockRejectedValueOnce(new Error('Temporary failure'))
            const { loadClientConfig, reloadClientConfig, configError } = useClientConfig()

            await expect(loadClientConfig()).rejects.toThrow()
            expect(configError.value).toBe('Temporary failure')

            // Reload succeeds
            mockFetch.mockResolvedValueOnce(makeConfig())
            await reloadClientConfig()

            expect(configError.value).toBeNull()
        })
    })
})

// ---------------------------------------------------------------------------
// Page-fetch de-duplication + boot prefetch
// ---------------------------------------------------------------------------

describe('loadPageBlocks de-duplication', () => {
    beforeEach(() => {
        mockFetch.mockReset()
        stateStore.clear()
    })

    // The boot prefetch and DynamicPage's onMounted call both go through
    // loadPageBlocks. The cache is only populated once a response lands, so
    // without an in-flight map the second caller would issue a second request.
    it('joins an in-flight request instead of issuing a second one', async () => {
        let resolveFetch!: (v: any) => void
        mockFetch.mockReturnValue(new Promise((r) => { resolveFetch = r }))

        const { loadPageBlocks } = useClientConfig()
        const a = loadPageBlocks('dedupe-a', 'v1')
        const b = loadPageBlocks('dedupe-a', 'v1')

        expect(mockFetch).toHaveBeenCalledTimes(1)

        resolveFetch({ blocks: [{ id: 'b1' }] })
        expect(await a).toEqual([{ id: 'b1' }])
        expect(await b).toEqual([{ id: 'b1' }])
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('keys the in-flight request so a different page still fetches', async () => {
        mockFetch.mockResolvedValue({ blocks: [] })

        const { loadPageBlocks } = useClientConfig()
        await Promise.all([
            loadPageBlocks('dedupe-b', 'v1'),
            loadPageBlocks('dedupe-c', 'v1'),
        ])

        expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    // A failed request must not be remembered as in-flight forever, or the page
    // could never retry.
    it('clears the in-flight entry after a rejection', async () => {
        mockFetch.mockRejectedValueOnce(new Error('boom'))

        const { loadPageBlocks } = useClientConfig()
        await expect(loadPageBlocks('dedupe-d', 'v1')).rejects.toThrow('boom')

        mockFetch.mockResolvedValueOnce({ blocks: [{ id: 'retry' }] })
        expect(await loadPageBlocks('dedupe-d', 'v1')).toEqual([{ id: 'retry' }])
        expect(mockFetch).toHaveBeenCalledTimes(2)
    })
})

describe('prefetchPageBlocks', () => {
    beforeEach(() => {
        mockFetch.mockReset()
        stateStore.clear()
    })

    it('starts the request, and a later loadPageBlocks joins it', async () => {
        let resolveFetch!: (v: any) => void
        mockFetch.mockReturnValue(new Promise((r) => { resolveFetch = r }))

        const { prefetchPageBlocks, loadPageBlocks } = useClientConfig()
        prefetchPageBlocks('prefetch-a', 'v1')
        expect(mockFetch).toHaveBeenCalledTimes(1)

        const joined = loadPageBlocks('prefetch-a', 'v1')
        resolveFetch({ blocks: [{ id: 'p1' }] })

        expect(await joined).toEqual([{ id: 'p1' }])
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does nothing for an empty path — "/" renders no DynamicPage', () => {
        const { prefetchPageBlocks } = useClientConfig()
        prefetchPageBlocks('', 'v1')
        expect(mockFetch).not.toHaveBeenCalled()
    })

    // Fire-and-forget: a rejection here must be handled, or a 404 at boot
    // surfaces as an unhandled rejection before the renderer attaches.
    it('swallows a rejection rather than leaving it unhandled', async () => {
        mockFetch.mockRejectedValueOnce(new Error('404'))

        const { prefetchPageBlocks } = useClientConfig()
        expect(() => prefetchPageBlocks('prefetch-b', 'v1')).not.toThrow()
        await new Promise((r) => setTimeout(r, 0))
    })
})
