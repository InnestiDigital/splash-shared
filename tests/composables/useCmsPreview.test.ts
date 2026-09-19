// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock vue-router
const mockRoute = { path: '/__preview' }
vi.mock('vue-router', () => ({
    useRoute: () => mockRoute,
}))

// Mock getCurrentInstance so useCmsPreview knows it's in setup context
// and will call useRoute() instead of skipping it
vi.mock('vue', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue')>()
    return {
        ...actual,
        getCurrentInstance: () => ({}) as any,
    }
})

import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import { PREVIEW_MESSAGE_DISPATCHER_KEY, type ClientConfig, type EditorToNuxtMessage } from '~/shared/types/previewMessages'
import type { AnimationEngine, AnimationScene } from '~/shared/types/animation'

// --- Helpers ---

function makeConfig(overrides: Partial<ClientConfig> = {}): ClientConfig {
    return {
        theme: 'standalone',
        themeSettings: {},
        navigation: { header: {}, footer: {} },
        pages: {
            home: {
                title: { 'en-US': 'Home' },
                layout: 'default',
                dynamic: false,
                meta: {},
                blocks: [],
            },
        },
        ...overrides,
    }
}

/** Mock parent window to simulate iframe context */
let mockPostMessage: ReturnType<typeof vi.fn>

function setupMockParent() {
    mockPostMessage = vi.fn()
    Object.defineProperty(window, 'parent', {
        value: { postMessage: mockPostMessage },
        writable: true,
        configurable: true,
    })
}

function restoreParent() {
    Object.defineProperty(window, 'parent', {
        value: window,
        writable: true,
        configurable: true,
    })
}

function dispatchMessage(data: EditorToNuxtMessage | any, origin?: string) {
    const event = new MessageEvent('message', {
        data,
        origin: origin ?? window.location.origin,
    })
    window.dispatchEvent(event)
}

describe('useCmsPreview', () => {
    let preview: ReturnType<typeof useCmsPreview>

    beforeEach(() => {
        mockRoute.path = '/__preview'
        setupMockParent()
        preview = useCmsPreview()
    })

    afterEach(() => {
        preview.cleanupPreviewMode()
        restoreParent()
        delete (window as any)[PREVIEW_MESSAGE_DISPATCHER_KEY]
        vi.restoreAllMocks()
    })

    // ──────────────────────────────────────────
    // Preview mode detection
    // ──────────────────────────────────────────

    describe('isInPreviewMode', () => {
        it('returns true when route is /__preview', () => {
            expect(preview.isInPreviewMode()).toBe(true)
        })

        it('returns true for /__preview with query params', () => {
            mockRoute.path = '/__preview?site=abc'
            expect(useCmsPreview().isInPreviewMode()).toBe(true)
        })

        it('returns false for non-preview routes', () => {
            mockRoute.path = '/admin/editor'
            expect(useCmsPreview().isInPreviewMode()).toBe(false)
        })

        it('returns false for root route', () => {
            mockRoute.path = '/'
            expect(useCmsPreview().isInPreviewMode()).toBe(false)
        })
    })

    describe('inPreviewMode (computed)', () => {
        it('is true on /__preview route', () => {
            expect(preview.inPreviewMode.value).toBe(true)
        })

        it('is false on non-preview route', () => {
            mockRoute.path = '/shop'
            expect(useCmsPreview().inPreviewMode.value).toBe(false)
        })
    })

    // ──────────────────────────────────────────
    // Initialization and cleanup
    // ──────────────────────────────────────────

    describe('initPreviewMode', () => {
        it('sends PREVIEW_READY to parent and sets isPreviewReady', () => {
            preview.initPreviewMode()

            expect(preview.isPreviewReady.value).toBe(true)
            expect(mockPostMessage).toHaveBeenCalledWith(
                { type: 'PREVIEW_READY', source: 'nuxt-preview' },
                expect.any(String)
            )
        })

        it('does nothing when not in preview mode', () => {
            mockRoute.path = '/admin'
            const p = useCmsPreview()
            p.initPreviewMode()

            expect(p.isPreviewReady.value).toBe(false)
            expect(mockPostMessage).not.toHaveBeenCalled()
        })
    })

    describe('cleanupPreviewMode', () => {
        it('sets isPreviewReady to false', () => {
            preview.initPreviewMode()
            expect(preview.isPreviewReady.value).toBe(true)

            preview.cleanupPreviewMode()
            expect(preview.isPreviewReady.value).toBe(false)
        })
    })

    // ──────────────────────────────────────────
    // Sending messages to editor
    // ──────────────────────────────────────────

    describe('sendToEditor', () => {
        it('posts message to parent window', () => {
            preview.sendToEditor({ type: 'PREVIEW_READY', source: 'nuxt-preview' })
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'PREVIEW_READY' }),
                expect.any(String)
            )
        })

        it('does nothing when parent === window (no iframe)', () => {
            restoreParent() // window.parent === window
            const spy = vi.spyOn(window, 'postMessage')
            preview.sendToEditor({ type: 'PREVIEW_READY', source: 'nuxt-preview' })
            // Should not call postMessage since the guard returns early
            expect(spy).not.toHaveBeenCalled()
        })

        it('captures editorOrigin from PREVIEW_INIT and uses it for subsequent messages', () => {
            preview.initPreviewMode()
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
            })

            mockPostMessage.mockClear()
            preview.notifySectionClick('block-1')

            // After handshake, uses the captured origin (window.location.origin)
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'SECTION_CLICKED', sectionId: 'block-1' }),
                window.location.origin
            )
        })
    })

    describe('notifySectionClick', () => {
        it('sends SECTION_CLICKED message with correct sectionId', () => {
            preview.notifySectionClick('section-42')
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'SECTION_CLICKED',
                    source: 'nuxt-preview',
                    sectionId: 'section-42',
                }),
                expect.any(String)
            )
        })
    })

    describe('notifyLayoutClick', () => {
        it('sends LAYOUT_CLICKED for header', () => {
            preview.notifyLayoutClick('header')
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'LAYOUT_CLICKED',
                    source: 'nuxt-preview',
                    area: 'header',
                }),
                expect.any(String)
            )
        })

        it('sends LAYOUT_CLICKED for footer', () => {
            preview.notifyLayoutClick('footer')
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'LAYOUT_CLICKED',
                    source: 'nuxt-preview',
                    area: 'footer',
                }),
                expect.any(String)
            )
        })
    })

    describe('sendRedirectRequest', () => {
        it('sends REDIRECT_REQUEST with pageId', () => {
            preview.sendRedirectRequest('page-123')
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'REDIRECT_REQUEST',
                    source: 'nuxt-preview',
                    pageId: 'page-123',
                }),
                expect.any(String)
            )
        })
    })

    // ──────────────────────────────────────────
    // Handling incoming messages
    // ──────────────────────────────────────────

    describe('handleMessage — PREVIEW_INIT', () => {
        beforeEach(() => {
            preview.initPreviewMode()
        })

        it('sets previewConfig from message', () => {
            const config = makeConfig()
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config,
            })

            expect(preview.previewConfig.value).toEqual(config)
        })

        it('sets currentPageSlug when provided', () => {
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
                pageSlug: 'about',
            })

            expect(preview.currentPageSlug.value).toBe('about')
        })

        it('retains previous pageSlug when not provided in message', () => {
            // First set a slug
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
                pageSlug: 'shop',
            })
            expect(preview.currentPageSlug.value).toBe('shop')

            // Second init without pageSlug — should keep 'shop'
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
            })
            expect(preview.currentPageSlug.value).toBe('shop')
        })

        it('sets previewQuery when provided', () => {
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
                query: { category: 'shoes' },
            })

            expect(preview.previewQuery.value).toEqual({ category: 'shoes' })
        })

        it('sets previewRouteParams when provided', () => {
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
                routeParams: { slug: 'product-1' },
            })

            expect(preview.previewRouteParams.value).toEqual({ slug: 'product-1' })
        })

        it('defaults routeParams to empty object when not provided', () => {
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
            })

            expect(preview.previewRouteParams.value).toEqual({})
        })
    })

    describe('handleMessage — CONFIG_UPDATE', () => {
        beforeEach(() => {
            preview.initPreviewMode()
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'splash',
                config: makeConfig(),
            })
        })

        it('updates theme via shallow merge of non-pages keys', () => {
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig({ theme: 'standalone' }),
            })

            expect(preview.previewConfig.value!.theme).toBe('standalone')
        })

        it('deep-merges pages without clobbering siblings', () => {
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig({
                    pages: {
                        shop: {
                            title: { 'en-US': 'Shop' },
                            layout: 'default',
                            dynamic: false,
                            meta: {},
                            blocks: [],
                        },
                    },
                }),
            })

            expect(preview.previewConfig.value!.pages.home).toBeDefined()
            expect(preview.previewConfig.value!.pages.shop).toBeDefined()
        })

        it('deep-merges nested child pages', () => {
            // Parent with child "profile"
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig({
                    pages: {
                        account: {
                            title: { 'en-US': 'Account' },
                            layout: 'account',
                            dynamic: false,
                            meta: {},
                            blocks: [],
                            pages: {
                                profile: {
                                    title: { 'en-US': 'Profile' },
                                    layout: 'account',
                                    dynamic: false,
                                    meta: {},
                                    blocks: [],
                                },
                            },
                        },
                    },
                }),
            })

            // Add child "orders" — profile should remain
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig({
                    pages: {
                        account: {
                            title: { 'en-US': 'Account' },
                            layout: 'account',
                            dynamic: false,
                            meta: {},
                            blocks: [],
                            pages: {
                                orders: {
                                    title: { 'en-US': 'Orders' },
                                    layout: 'account',
                                    dynamic: false,
                                    meta: {},
                                    blocks: [],
                                },
                            },
                        },
                    },
                }),
            })

            const accountPages = (preview.previewConfig.value!.pages.account as any).pages
            expect(accountPages.profile).toBeDefined()
            expect(accountPages.orders).toBeDefined()
        })

        it('updates pageSlug on CONFIG_UPDATE', () => {
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig(),
                pageSlug: 'contact',
            })

            expect(preview.currentPageSlug.value).toBe('contact')
        })

        it('updates query on CONFIG_UPDATE', () => {
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig(),
                query: { search: 'test' },
            })

            expect(preview.previewQuery.value).toEqual({ search: 'test' })
        })

        it('updates routeParams on CONFIG_UPDATE', () => {
            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: makeConfig(),
                routeParams: { id: '42' },
            })

            expect(preview.previewRouteParams.value).toEqual({ id: '42' })
        })

        it('replaces entire config when config has no pages key', () => {
            const configNoPages = { theme: 'new', themeSettings: {}, navigation: {} } as any

            dispatchMessage({
                type: 'CONFIG_UPDATE',
                source: 'splash',
                config: configNoPages,
            })

            expect(preview.previewConfig.value!.theme).toBe('new')
            expect((preview.previewConfig.value as any).pages).toBeUndefined()
        })
    })

    describe('handleMessage — SECTION_SELECT', () => {
        beforeEach(() => {
            preview.initPreviewMode()
        })

        it('sets selectedSectionId and clears selectedLayoutId', () => {
            dispatchMessage({
                type: 'SECTION_SELECT',
                source: 'splash',
                sectionId: 'block-5',
            })

            expect(preview.selectedSectionId.value).toBe('block-5')
            expect(preview.selectedLayoutId.value).toBeNull()
        })

        it('clears selectedSectionId when sectionId is null', () => {
            dispatchMessage({ type: 'SECTION_SELECT', source: 'splash', sectionId: 'block-5' })
            dispatchMessage({ type: 'SECTION_SELECT', source: 'splash', sectionId: null })

            expect(preview.selectedSectionId.value).toBeNull()
        })

        // The scroll is deferred a frame so it measures the post-update layout.
        function nextFrame(): Promise<void> {
            return new Promise(resolve => requestAnimationFrame(() => resolve()))
        }

        it('scrolls element into view when sectionId is set', async () => {
            const region = document.createElement('section')
            region.setAttribute('data-preview-section-id', 'block-7')
            const scrollIntoView = vi.fn()
            region.scrollIntoView = scrollIntoView
            document.body.appendChild(region)

            dispatchMessage({
                type: 'SECTION_SELECT',
                source: 'splash',
                sectionId: 'block-7',
            })
            await nextFrame()

            expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'center',
            })
            region.remove()
        })

        it('scrolls the block root, not the boxless region wrapping it', async () => {
            // A block region is AnimatedBlock's `display: contents` wrapper: it
            // has no box, so scrolling it lands at the document origin.
            const region = document.createElement('div')
            region.className = 'preview-region preview-region--boxless'
            region.setAttribute('data-preview-section-id', 'block-8')
            const blockRoot = document.createElement('section')
            const rootScroll = vi.fn()
            blockRoot.scrollIntoView = rootScroll
            const regionScroll = vi.fn()
            region.scrollIntoView = regionScroll
            region.appendChild(blockRoot)
            document.body.appendChild(region)

            dispatchMessage({
                type: 'SECTION_SELECT',
                source: 'splash',
                sectionId: 'block-8',
            })
            await nextFrame()

            expect(rootScroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
            expect(regionScroll).not.toHaveBeenCalled()
            region.remove()
        })
    })

    describe('handleMessage — LAYOUT_SELECT', () => {
        beforeEach(() => {
            preview.initPreviewMode()
        })

        it('sets selectedLayoutId and clears selectedSectionId', () => {
            dispatchMessage({ type: 'SECTION_SELECT', source: 'splash', sectionId: 'block-1' })
            dispatchMessage({ type: 'LAYOUT_SELECT', source: 'splash', layoutId: 'header' })

            expect(preview.selectedLayoutId.value).toBe('header')
            expect(preview.selectedSectionId.value).toBeNull()
        })

        it('handles footer layout selection', () => {
            dispatchMessage({ type: 'LAYOUT_SELECT', source: 'splash', layoutId: 'footer' })
            expect(preview.selectedLayoutId.value).toBe('footer')
        })

        it('clears layout selection with null', () => {
            dispatchMessage({ type: 'LAYOUT_SELECT', source: 'splash', layoutId: 'header' })
            dispatchMessage({ type: 'LAYOUT_SELECT', source: 'splash', layoutId: null })
            expect(preview.selectedLayoutId.value).toBeNull()
        })
    })

    // ──────────────────────────────────────────
    // Message filtering / security
    // ──────────────────────────────────────────

    describe('message filtering', () => {
        beforeEach(() => {
            preview.initPreviewMode()
        })

        it('ignores messages from different origins', () => {
            const configBefore = preview.previewConfig.value
            dispatchMessage(
                {
                    type: 'PREVIEW_INIT',
                    source: 'splash',
                    config: makeConfig({ theme: 'evil-theme' }),
                },
                'https://evil.com'
            )

            expect(preview.previewConfig.value).toBe(configBefore)
        })

        it('ignores messages without splash source', () => {
            const configBefore = preview.previewConfig.value
            dispatchMessage({
                type: 'PREVIEW_INIT',
                source: 'unknown-source',
                config: makeConfig({ theme: 'unknown' }),
            })

            expect(preview.previewConfig.value).toBe(configBefore)
        })

        it('ignores null data', () => {
            const configBefore = preview.previewConfig.value
            const event = new MessageEvent('message', {
                data: null,
                origin: window.location.origin,
            })
            window.dispatchEvent(event)

            expect(preview.previewConfig.value).toBe(configBefore)
        })

        it('ignores messages with no source field', () => {
            const configBefore = preview.previewConfig.value
            dispatchMessage({ type: 'PREVIEW_INIT', config: makeConfig() } as any)
            expect(preview.previewConfig.value).toBe(configBefore)
        })
    })

    // ──────────────────────────────────────────
    // isInteractiveElement helper
    // ──────────────────────────────────────────

    describe('isInteractiveElement', () => {
        it('returns false for anchor elements', () => {
            // Deliberate: following a link navigates the iframe away from the
            // page the editor is synchronised to. In the editor a link is
            // chrome to select; Cmd/Ctrl-click remains the escape hatch for
            // actually visiting the target.
            const a = document.createElement('a')
            a.setAttribute('href', '/somewhere')
            expect(preview.isInteractiveElement(a)).toBe(false)
        })

        it('returns true for button elements', () => {
            const btn = document.createElement('button')
            expect(preview.isInteractiveElement(btn)).toBe(true)
        })

        it('returns true for input elements', () => {
            const input = document.createElement('input')
            expect(preview.isInteractiveElement(input)).toBe(true)
        })

        it('returns true for elements with role="button"', () => {
            const div = document.createElement('div')
            div.setAttribute('role', 'button')
            expect(preview.isInteractiveElement(div)).toBe(true)
        })

        it('returns true for elements with data-interactive="true"', () => {
            const div = document.createElement('div')
            div.setAttribute('data-interactive', 'true')
            expect(preview.isInteractiveElement(div)).toBe(true)
        })

        it('returns true for child of interactive element', () => {
            const btn = document.createElement('button')
            const span = document.createElement('span')
            btn.appendChild(span)
            document.body.appendChild(btn)
            expect(preview.isInteractiveElement(span)).toBe(true)
            document.body.removeChild(btn)
        })

        it('returns false for non-interactive elements', () => {
            const div = document.createElement('div')
            document.body.appendChild(div)
            expect(preview.isInteractiveElement(div)).toBe(false)
            document.body.removeChild(div)
        })

        it('returns true for a tabbable custom control', () => {
            const div = document.createElement('div')
            div.setAttribute('tabindex', '0')
            expect(preview.isInteractiveElement(div)).toBe(true)
        })

        it('does not treat tabindex="-1" as interactive', () => {
            // The regression this pins: theme layouts give their skip-link
            // target `<main tabindex="-1">`, an ancestor of every block. When
            // the predicate matched any [tabindex], `closest()` hit that <main>
            // for every click in the preview and click-to-select was dead on
            // the entire page.
            const main = document.createElement('main')
            main.setAttribute('tabindex', '-1')
            const paragraph = document.createElement('p')
            main.appendChild(paragraph)
            document.body.appendChild(main)

            expect(preview.isInteractiveElement(main)).toBe(false)
            expect(preview.isInteractiveElement(paragraph)).toBe(false)

            main.remove()
        })
    })

    // ──────────────────────────────────────────
    // Scene message handling (preview side)
    // ──────────────────────────────────────────

    describe('scene messages', () => {
        let mockEngine: AnimationEngine

        function makeScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
            return {
                id: 'scene-1',
                pageId: 'page-1',
                versionId: 'v-1',
                trigger: { type: 'intersection', anchor: { entityType: 'block', entityId: 'b1', part: 'root' } },
                entries: [],
                ...overrides,
            }
        }

        beforeEach(() => {
            mockEngine = {
                registerBlockTargets: vi.fn(),
                unregisterTargets: vi.fn(),
                loadScenes: vi.fn(),
                upsertScene: vi.fn(),
                removeScene: vi.fn(),
                refreshTargets: vi.fn(),
                rebindAffectedScenes: vi.fn(),
                play: vi.fn(),
                pause: vi.fn(),
                scrub: vi.fn(),
                seekAll: vi.fn(),
                resetAll: vi.fn(),
                getSceneAdapter: vi.fn(),
                hasActiveSceneForPart: vi.fn().mockReturnValue(false),
                activeAdapters: new Set<string>(),
            }
            preview.setAnimationEngine(mockEngine)
            preview.initPreviewMode()
        })

        afterEach(() => {
            preview.setAnimationEngine(null)
        })

        it('calls engine.upsertScene on SCENE_UPSERT', () => {
            const scene = makeScene()
            dispatchMessage({
                type: 'SCENE_UPSERT',
                source: 'splash',
                scene,
            })

            expect(mockEngine.upsertScene).toHaveBeenCalledWith(scene)
        })

        it('calls engine.upsertScene on PREVIEW_SCENE', () => {
            const scene = makeScene({ id: 'preview-scene-1' })
            dispatchMessage({
                type: 'PREVIEW_SCENE',
                source: 'splash',
                scene,
            })

            expect(mockEngine.upsertScene).toHaveBeenCalledWith(scene)
        })

        it('routes SCENE_COMMAND messages to engine playback controls', () => {
            dispatchMessage({
                type: 'SCENE_COMMAND',
                source: 'splash',
                sceneId: 'scene-1',
                command: 'restart',
            })

            expect(mockEngine.pause).toHaveBeenCalledWith('scene-1')
            expect(mockEngine.scrub).toHaveBeenCalledWith('scene-1', 0)
            expect(mockEngine.play).toHaveBeenCalledWith('scene-1')
        })

        it('routes hover-out commands to reset the scene without replaying', () => {
            dispatchMessage({
                type: 'SCENE_COMMAND',
                source: 'splash',
                sceneId: 'scene-1',
                command: 'hover-out',
            })

            expect(mockEngine.pause).toHaveBeenCalledWith('scene-1')
            expect(mockEngine.scrub).toHaveBeenCalledWith('scene-1', 0)
            expect(mockEngine.play).not.toHaveBeenCalled()
        })

        it('calls engine.removeScene on SCENE_REMOVE', () => {
            dispatchMessage({
                type: 'SCENE_REMOVE',
                source: 'splash',
                sceneId: 'scene-42',
            })

            expect(mockEngine.removeScene).toHaveBeenCalledWith('scene-42')
        })

        it('calls engine.refreshTargets on SCENE_TARGETS_REFRESH', () => {
            dispatchMessage({
                type: 'SCENE_TARGETS_REFRESH',
                source: 'splash',
                blockId: 'block-7',
            })

            expect(mockEngine.refreshTargets).toHaveBeenCalledWith('block-7')
        })

        it('does not throw when no engine is set', () => {
            preview.setAnimationEngine(null)

            expect(() => {
                dispatchMessage({
                    type: 'SCENE_UPSERT',
                    source: 'splash',
                    scene: makeScene(),
                })
            }).not.toThrow()

            expect(() => {
                dispatchMessage({
                    type: 'SCENE_REMOVE',
                    source: 'splash',
                    sceneId: 'scene-1',
                })
            }).not.toThrow()

            expect(() => {
                dispatchMessage({
                    type: 'SCENE_TARGETS_REFRESH',
                    source: 'splash',
                    blockId: 'block-1',
                })
            }).not.toThrow()
        })
    })

    // ──────────────────────────────────────────
    // Scatter item-patch notify (preview → editor)
    // ──────────────────────────────────────────

    describe('notifyScatterItemPatch', () => {
        it('posts SCATTER_ITEM_PATCH with source nuxt-preview to parent window', () => {
            preview.notifyScatterItemPatch('blk1', { id: 'it1', positionX: 42 })

            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'SCATTER_ITEM_PATCH',
                    source: 'nuxt-preview',
                    blockId: 'blk1',
                    patch: { id: 'it1', positionX: 42 },
                }),
                expect.any(String)
            )
        })
    })

    describe('notifyCanvasBlockPlacementPatch', () => {
        it('posts CANVAS_BLOCK_PLACEMENT_PATCH with source nuxt-preview', () => {
            const patch = { x: 50, y: 40, width: 30, height: 20, rotation: 0, zIndex: 2, locked: false }
            preview.notifyCanvasBlockPlacementPatch('block-1', patch)

            expect(mockPostMessage).toHaveBeenCalledWith(
                {
                    type: 'CANVAS_BLOCK_PLACEMENT_PATCH',
                    source: 'nuxt-preview',
                    blockId: 'block-1',
                    patch,
                },
                expect.any(String),
            )
        })
    })

    // ──────────────────────────────────────────
    // Editor-side send functions
    // ──────────────────────────────────────────

    describe('sendSceneUpsert', () => {
        it('posts SCENE_UPSERT to preview iframe', () => {
            const mockIframePostMessage = vi.fn()
            const iframe = document.createElement('iframe')
            iframe.setAttribute('data-preview', '')
            Object.defineProperty(iframe, 'contentWindow', {
                value: { postMessage: mockIframePostMessage },
                configurable: true,
            })
            document.body.appendChild(iframe)

            const scene: AnimationScene = {
                id: 'scene-1',
                pageId: 'page-1',
                versionId: 'v-1',
                trigger: { type: 'intersection', anchor: { entityType: 'block', entityId: 'b1', part: 'root' } },
                entries: [],
            }
            preview.sendSceneUpsert(scene)

            expect(mockIframePostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'SCENE_UPSERT', source: 'splash', scene }),
                window.location.origin
            )

            document.body.removeChild(iframe)
        })
    })

    describe('sendPreviewScene', () => {
        it('posts PREVIEW_SCENE to preview iframe', () => {
            const mockIframePostMessage = vi.fn()
            const iframe = document.createElement('iframe')
            iframe.setAttribute('data-preview', '')
            Object.defineProperty(iframe, 'contentWindow', {
                value: { postMessage: mockIframePostMessage },
                configurable: true,
            })
            document.body.appendChild(iframe)

            const scene: AnimationScene = {
                id: 'scene-preview-1',
                pageId: 'page-1',
                versionId: 'v-1',
                trigger: { type: 'intersection', anchor: { entityType: 'block', entityId: 'b1', part: 'root' } },
                entries: [],
            }
            preview.sendPreviewScene(scene)

            expect(mockIframePostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'PREVIEW_SCENE', source: 'splash', scene }),
                window.location.origin
            )

            document.body.removeChild(iframe)
        })
    })

    describe('sendSceneRemove', () => {
        it('posts SCENE_REMOVE to preview iframe', () => {
            const mockIframePostMessage = vi.fn()
            const iframe = document.createElement('iframe')
            iframe.setAttribute('data-preview', '')
            Object.defineProperty(iframe, 'contentWindow', {
                value: { postMessage: mockIframePostMessage },
                configurable: true,
            })
            document.body.appendChild(iframe)

            preview.sendSceneRemove('scene-99')

            expect(mockIframePostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'SCENE_REMOVE', source: 'splash', sceneId: 'scene-99' }),
                window.location.origin
            )

            document.body.removeChild(iframe)
        })
    })

    describe('sendSceneTargetsRefresh', () => {
        it('posts SCENE_TARGETS_REFRESH to preview iframe', () => {
            const mockIframePostMessage = vi.fn()
            const iframe = document.createElement('iframe')
            iframe.setAttribute('data-preview', '')
            Object.defineProperty(iframe, 'contentWindow', {
                value: { postMessage: mockIframePostMessage },
                configurable: true,
            })
            document.body.appendChild(iframe)

            preview.sendSceneTargetsRefresh('block-5')

            expect(mockIframePostMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'SCENE_TARGETS_REFRESH', source: 'splash', blockId: 'block-5' }),
                window.location.origin
            )

            document.body.removeChild(iframe)
        })
    })

    describe('sendSceneCommand', () => {
        it('posts SCENE_COMMAND to the preview dispatcher when available', () => {
            const dispatcher = vi.fn()
            ;(window as any)[PREVIEW_MESSAGE_DISPATCHER_KEY] = dispatcher

            preview.sendSceneCommand('scene-42', 'hover-in')

            expect(dispatcher).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'SCENE_COMMAND',
                    source: 'splash',
                    sceneId: 'scene-42',
                    command: 'hover-in',
                })
            )

            delete (window as any)[PREVIEW_MESSAGE_DISPATCHER_KEY]
        })
    })
})
