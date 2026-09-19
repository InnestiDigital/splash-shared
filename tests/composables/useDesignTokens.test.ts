import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

// Mock dependencies — matches real useClientConfig which returns EMPTY_CONFIG (not null/throw)
const EMPTY_CONFIG = { theme: '', themeSettings: {}, navigation: {}, pages: {} }
const mockConfigData = ref<any>({ ...EMPTY_CONFIG })
const mockUseHead = vi.fn()

vi.mock('~/shared/composables/useClientConfig', () => ({
    useClientConfig: () => ({
        config: mockConfigData
    })
}))

vi.mock('#imports', () => ({
    useHead: (...args: any[]) => mockUseHead(...args)
}))

import { useCssOverridesFromConfig } from '~/shared/composables/useDesignTokens'

// --- Helpers ---

// useHead receives computed(() => ({ style, ... })) — unwrap .value to get the plain object.
function getLastHeadValue(): { style: any[] } | undefined {
    const lastCall = mockUseHead.mock.calls.at(-1)
    if (!lastCall) return undefined
    const arg = lastCall[0]
    return arg && typeof arg === 'object' && 'value' in arg ? arg.value : arg
}

function getInjectedCss(): string | undefined {
    const head = getLastHeadValue()
    if (!head?.style?.length) return undefined
    return head.style[0].innerHTML
}

// --- Tests ---

describe('useDesignTokens — useCssOverridesFromConfig', () => {
    beforeEach(() => {
        mockUseHead.mockReset()
        mockConfigData.value = { ...EMPTY_CONFIG }
    })

    describe('themeVars', () => {
        it('generates :root CSS vars from themeVars', async () => {
            mockConfigData.value = {
                themeVars: {
                    'base-font-color': '#333',
                    'primary-color': 'blue'
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--base-font-color: #333;')
            expect(css).toContain('--primary-color: blue;')
        })

        it('does not inject CSS when themeVars is empty', async () => {
            mockConfigData.value = { themeVars: {} }

            useCssOverridesFromConfig()
            await nextTick()

            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
        })

        it('does not inject CSS when themeVars is missing', async () => {
            mockConfigData.value = {}

            useCssOverridesFromConfig()
            await nextTick()

            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
        })
    })

    describe('cssOverride on blocks', () => {
        it('generates CSS vars for a block with cssOverride', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            {
                                type: 'HeroBlock',
                                cssOverride: {
                                    'font-family': 'Arial',
                                    'background-color': '#fff'
                                }
                            }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--HeroBlock-font-family: Arial;')
            expect(css).toContain('--HeroBlock-background-color: #fff;')
        })

        it('skips blocks without cssOverride', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            { type: 'HeroBlock', settings: { title: 'Hello' } }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
        })

        it('handles nested blocks with cssOverride in slots', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            {
                                type: 'Section',
                                slots: {
                                    default: [
                                        {
                                            type: 'Card',
                                            cssOverride: { padding: '2rem' }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--Card-padding: 2rem;')
        })

        it('handles cssOverride on block within settings', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            {
                                type: 'Header',
                                settings: {
                                    cssOverride: { 'menu-spacing': '1.5rem' }
                                }
                            }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            // settings is a container key, so parent component key 'Header' is preserved
            expect(css).toContain('--Header-menu-spacing: 1.5rem;')
        })
    })

    describe('navigation layout cssOverride', () => {
        it('handles cssOverride on navigation layout items', async () => {
            mockConfigData.value = {
                navigation: {
                    header: {
                        type: 'ProgramHeader',
                        cssOverride: { height: '80px' }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--ProgramHeader-height: 80px;')
        })
    })

    describe('combined themeVars + cssOverride', () => {
        it('produces separate :root blocks for themeVars and per-component overrides', async () => {
            mockConfigData.value = {
                themeVars: { 'brand-color': 'red' },
                pages: [
                    {
                        blocks: [
                            {
                                type: 'Footer',
                                cssOverride: { 'bg-color': '#222' }
                            }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--brand-color: red;')
            expect(css).toContain('--Footer-bg-color: #222;')
        })
    })

    describe('createVarBlock (via scanForCssOverrides)', () => {
        it('skips empty cssOverride objects', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            { type: 'Empty', cssOverride: {} }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
        })

        it('handles numeric values in cssOverride', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            { type: 'Grid', cssOverride: { columns: 3, gap: 16 } }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--Grid-columns: 3;')
            expect(css).toContain('--Grid-gap: 16;')
        })
    })

    describe('scanForCssOverrides edge cases', () => {
        it('ignores cssOverride when no component key can be resolved', async () => {
            // At the top level with no 'type' and no non-container key context,
            // scanForCssOverrides has no parentComponentKey
            mockConfigData.value = {
                settings: {
                    // 'settings' is a container key — preserves parent key (undefined at root)
                    cssOverride: { color: 'red' }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            // cssOverride with undefined parent component key should be skipped — useHead
            // is always called but with an empty style array (no CSS injected)
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
        })

        it('uses non-container key as component key when block has no type', async () => {
            // 'pages' is not in containerKeys, so it becomes the component key
            mockConfigData.value = {
                customSection: {
                    cssOverride: { color: 'red' }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--customSection-color: red;')
        })

        it('handles deeply nested config trees', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            {
                                type: 'Layout',
                                options: {
                                    nested: {
                                        type: 'Inner',
                                        cssOverride: { margin: '0 auto' }
                                    }
                                }
                            }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--Inner-margin: 0 auto;')
        })

        it('handles multiple blocks with cssOverride on the same page', async () => {
            mockConfigData.value = {
                pages: [
                    {
                        blocks: [
                            { type: 'Header', cssOverride: { height: '60px' } },
                            { type: 'Footer', cssOverride: { height: '40px' } }
                        ]
                    }
                ]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--Header-height: 60px;')
            expect(css).toContain('--Footer-height: 40px;')
        })

        it('handles null/undefined nodes gracefully', async () => {
            mockConfigData.value = {
                pages: [null, undefined, { blocks: [null, { type: 'A', cssOverride: { x: '1' } }] }]
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()
            expect(css).toContain('--A-x: 1;')
        })
    })

    describe('reactivity', () => {
        it('re-runs when config changes', async () => {
            mockConfigData.value = {
                themeVars: { color: 'red' }
            }

            useCssOverridesFromConfig()
            await nextTick()

            expect(getInjectedCss()).toContain('--color: red;')

            // Update config reactively
            mockConfigData.value = {
                themeVars: { color: 'blue' }
            }
            await nextTick()

            expect(getInjectedCss()).toContain('--color: blue;')
        })

        it('handles config becoming available after initial empty', async () => {
            // Start with empty config (no themeVars, no blocks)
            mockConfigData.value = { ...EMPTY_CONFIG }

            useCssOverridesFromConfig()
            await nextTick()

            // Empty config — useHead called but with empty style array (no CSS injected)
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])

            // Config becomes populated
            mockConfigData.value = {
                ...EMPTY_CONFIG,
                themeVars: { accent: 'green' }
            }
            await nextTick()

            expect(getInjectedCss()).toContain('--accent: green;')
        })
    })

    describe('useHead integration', () => {
        it('uses the correct style key for deduplication', async () => {
            mockConfigData.value = {
                themeVars: { x: '1' }
            }

            useCssOverridesFromConfig()
            await nextTick()

            expect(getLastHeadValue()?.style[0].key).toBe('client-config-css-overrides')
        })
    })

    describe('typography tokens (SPL-105)', () => {
        it('emits canonical font-family matching @font-face declarations', async () => {
            mockConfigData.value = {
                typography: {
                    variants: [
                        { name: 'gothic-a1-semibold', family: 'Gothic A1', weight: 600 }
                    ],
                    tokens: {
                        editorialDisplay: {
                            fontFamily: 'Gothic A1',
                            fontSize: '80px',
                            lineHeight: 0.95,
                            fontWeight: 600
                        }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()!
            expect(css).toContain("--type-editorial-display-font-family: 'Gothic A1';")
            expect(css).toContain('--type-editorial-display-weight: 600;')
            expect(css).toContain('--type-editorial-display-size: 80px;')
            expect(css).toContain('--type-editorial-display-line-height: 0.95;')
        })

        it('honors explicit numeric fontWeight on tokens', async () => {
            mockConfigData.value = {
                typography: {
                    variants: [
                        { name: 'inter-regular', family: 'Inter', weight: 400 },
                        { name: 'inter-semibold', family: 'Inter', weight: 600 }
                    ],
                    tokens: {
                        tag: { fontFamily: 'Inter', fontSize: '12px', fontWeight: 600 }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()!
            expect(css).toContain('--type-tag-weight: 600;')
            expect(css).toContain("--type-tag-font-family: 'Inter';")
        })

        it('derives default weight from variants when token has no fontWeight', async () => {
            mockConfigData.value = {
                typography: {
                    variants: [
                        { name: 'inter-regular', family: 'Inter', weight: 400 },
                        { name: 'inter-semibold', family: 'Inter', weight: 600 }
                    ],
                    tokens: {
                        body: { fontFamily: 'Inter', fontSize: '16px' }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()!
            expect(css).toContain('--type-body-weight: 400;')
            expect(css).toContain("--type-body-font-family: 'Inter';")
        })

        it('falls back to weight 400 for unknown families (preserves legacy behaviour)', async () => {
            mockConfigData.value = {
                typography: {
                    variants: [],
                    tokens: {
                        mystery: { fontFamily: 'NotRegistered', fontSize: '14px' }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()!
            expect(css).toContain('--type-mystery-weight: 400;')
            expect(css).toContain("--type-mystery-font-family: 'NotRegistered';")
        })

        it('emits letter-spacing and text-transform when present', async () => {
            mockConfigData.value = {
                typography: {
                    variants: [{ name: 'jost-medium', family: 'Jost', weight: 500 }],
                    tokens: {
                        displayMega: {
                            fontFamily: 'Jost',
                            fontSize: '150px',
                            letterSpacing: '-4px',
                            textTransform: 'uppercase',
                            fontWeight: 500
                        }
                    }
                }
            }

            useCssOverridesFromConfig()
            await nextTick()

            const css = getInjectedCss()!
            expect(css).toContain('--type-display-mega-letter-spacing: -4px;')
            expect(css).toContain('--type-display-mega-text-transform: uppercase;')
            expect(css).toContain('--type-display-mega-weight: 500;')
        })
    })
})
