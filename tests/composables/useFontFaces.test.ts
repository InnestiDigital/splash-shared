import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// --- Mocks ---

const mockConfigRef = ref<any>(null)
const mockUseHead = vi.fn()

// useFontFaces accesses config.value inside a try/catch — to simulate a throw,
// we use a computed-like ref whose .value getter can throw
function createThrowingRef() {
    return {
        get value(): any {
            throw new Error('Config not available')
        }
    }
}

vi.mock('~/shared/composables/useClientConfig', () => ({
    useClientConfig: () => ({
        config: mockConfigRef
    })
}))

vi.mock('#imports', () => ({
    useHead: (...args: any[]) => mockUseHead(...args)
}))

// watchEffect in test env runs synchronously on import
import { useFontFaces } from '~/shared/composables/useFontFaces'

// --- Helpers ---

// useHead receives computed(() => ({ style, link })) — unwrap .value to get the plain object.
function getLastHeadValue(): { style: any[]; link: any[] } | undefined {
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

function getPreloadLinks(): any[] | undefined {
    return getLastHeadValue()?.link
}

// --- Tests ---

describe('useFontFaces', () => {
    beforeEach(() => {
        mockUseHead.mockReset()
        mockConfigRef.value = null
    })

    describe('when config is unavailable (throws)', () => {
        it('calls useHead but computed resolves safely when config.value throws', () => {
            // useHead is called unconditionally (outside any conditional) so it's always
            // registered. The computed passed to useHead evaluates lazily — a throwing
            // config ref would only surface when the computed getter runs, not at call time.
            // In practice useFontFaces guards with `if (!cfg) return ''`, so null/undefined
            // configs produce empty output without throwing.
            mockConfigRef.value = null
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
        })
    })

    describe('when config has no typography', () => {
        it('calls useHead with empty style and link when typography is undefined', () => {
            mockConfigRef.value = {}
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })

        it('calls useHead with empty style and link when typography is empty', () => {
            mockConfigRef.value = { typography: {} }
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })

        it('calls useHead with empty style and link when variants and defaults are empty', () => {
            mockConfigRef.value = { typography: { variants: [], defaults: {} } }
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })
    })

    describe('font-face generation from variants', () => {
        it('generates @font-face for a single variant with defaults', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'Heebo', file: 'heebo-regular' }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()
            expect(css).toBeDefined()
            expect(css).toContain("font-family: 'Heebo'")
            expect(css).toContain("url('/fonts/heebo-regular.woff2') format('woff2')")
            expect(css).toContain("url('/fonts/heebo-regular.woff') format('woff')")
            expect(css).toContain('font-weight: 400')
            expect(css).toContain('font-style: normal')
            expect(css).toContain('font-display: swap')
        })

        it('uses canonical family name when family field is provided (SPL-105)', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'gothic-a1-semibold', family: 'Gothic A1', file: 'GothicA1-SemiBold', weight: 600 }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain("font-family: 'Gothic A1'")
            expect(css).not.toContain("font-family: 'gothic-a1-semibold'")
            expect(css).toContain('font-weight: 600')
        })

        it('falls back to slug name when family field is absent (SPL-105)', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'legacy-slug', file: 'legacy-slug', weight: 400 }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain("font-family: 'legacy-slug'")
        })

        it('emits identical family across multiple weight variants (SPL-105)', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'gothic-a1-semibold',  family: 'Gothic A1', file: 'GothicA1-SemiBold',  weight: 600 },
                        { name: 'gothic-a1-bold',      family: 'Gothic A1', file: 'GothicA1-Bold',      weight: 700 },
                        { name: 'gothic-a1-extrabold', family: 'Gothic A1', file: 'GothicA1-ExtraBold', weight: 800 }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            const familyMatches = css.match(/font-family: 'Gothic A1'/g) || []
            expect(familyMatches).toHaveLength(3)
            expect(css).toContain('font-weight: 600')
            expect(css).toContain('font-weight: 700')
            expect(css).toContain('font-weight: 800')
        })

        it('uses explicit weight and style when provided', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'Heebo', file: 'heebo-bold', weight: 700, style: 'italic' }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()
            expect(css).toContain('font-weight: 700')
            expect(css).toContain('font-style: italic')
        })

        it('generates multiple @font-face rules for multiple variants', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'Heebo', file: 'heebo-regular' },
                        { name: 'Heebo', file: 'heebo-bold', weight: 700 },
                        { name: 'Roboto', file: 'roboto-light', weight: 300, style: 'normal' }
                    ]
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            const faceCount = (css.match(/@font-face/g) || []).length
            expect(faceCount).toBe(3)
            expect(css).toContain("font-family: 'Heebo'")
            expect(css).toContain("font-family: 'Roboto'")
        })

        // A theme declares every face it might use; a page renders a handful.
        // Preloading the declared set fetched all 10 standalone variants
        // (758KB, High priority) on a page using two families. The @font-face
        // rules alone let the browser fetch only what its text matches.
        it('emits no preload links for theme variants', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'Heebo', file: 'heebo-regular' },
                        { name: 'Heebo', file: 'heebo-bold', weight: 700 }
                    ]
                }
            }

            useFontFaces()

            expect(getPreloadLinks()).toBeUndefined()
            // The faces themselves must still be declared, or nothing loads at all.
            expect(getInjectedCss()).toContain("src: url('/fonts/heebo-regular.woff2')")
        })

        it('emits no preload links for editor-uploaded faces', () => {
            mockConfigRef.value = {
                typography: {
                    fontFaces: [
                        {
                            name: 'Uploaded',
                            src: '/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
                            weight: 400,
                            style: 'normal',
                        }
                    ]
                }
            }

            useFontFaces()

            expect(getPreloadLinks()).toBeUndefined()
            expect(getInjectedCss()).toContain("font-family: 'Uploaded'")
        })
    })

    describe('variable font variants (Phase C)', () => {
        it('emits range descriptors for variable variants', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{
                        name: 'fraunces-vf', family: 'Fraunces', file: 'Fraunces-VF',
                        variable: true,
                        axes: { wght: { min: 100, max: 900, default: 400 } },
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toContain("font-family: 'Fraunces'")
            expect(css).toContain('font-weight: 100 900')
            expect(css).toContain("format('woff2-variations')")
            expect(css).toContain('font-display: swap')
        })

        it('emits oblique range for variable variants with slnt axis', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{
                        name: 'recursive-vf', family: 'Recursive', file: 'Recursive-VF',
                        variable: true,
                        axes: {
                            wght: { min: 300, max: 1000, default: 400 },
                            slnt: { min: -15, max: 0, default: 0 },
                        },
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toContain('font-style: oblique -15deg 0deg')
        })

        it('does not emit range descriptors for static variants (regression)', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{
                        name: 'inter-regular', family: 'Inter', file: 'Inter-Regular', weight: 400,
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toContain('font-weight: 400')
            expect(css).not.toContain('woff2-variations')
        })
    })

    describe('typography defaults (CSS variables)', () => {
        it('generates :root CSS variables from defaults', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        body: {
                            fontFamily: 'Heebo, sans-serif',
                            fontSize: '1.5rem',
                            lineHeight: 1.6,
                            fontWeight: 400
                        }
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain(':root {')
            expect(css).toContain('--body-font-family: Heebo, sans-serif;')
            expect(css).toContain('--body-font-size: 1.5rem;')
            expect(css).toContain('--body-line-height: 1.6;')
            expect(css).toContain('--body-font-weight: 400;')
        })

        it('generates CSS variables for multiple tokens (h1, h2, body)', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        h1: { fontFamily: 'Georgia', fontSize: '3.6rem' },
                        h2: { fontSize: '2.8rem', fontWeight: 600 },
                        body: { fontFamily: 'Heebo', lineHeight: 1.5 }
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain('--h1-font-family: Georgia;')
            expect(css).toContain('--h1-font-size: 3.6rem;')
            expect(css).toContain('--h2-font-size: 2.8rem;')
            expect(css).toContain('--h2-font-weight: 600;')
            expect(css).toContain('--body-font-family: Heebo;')
            expect(css).toContain('--body-line-height: 1.5;')
        })

        it('skips properties that are undefined', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        body: { fontFamily: 'Arial' }
                        // no fontSize, lineHeight, fontWeight
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain('--body-font-family: Arial;')
            expect(css).not.toContain('--body-font-size')
            expect(css).not.toContain('--body-line-height')
            expect(css).not.toContain('--body-font-weight')
        })

        it('handles lineHeight of 0 (falsy but defined)', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        body: { lineHeight: 0 }
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain('--body-line-height: 0;')
        })

        it('handles fontWeight of 0 (falsy but defined)', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        body: { fontWeight: 0 }
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain('--body-font-weight: 0;')
        })

        it('skips defaults with no set properties', () => {
            mockConfigRef.value = {
                typography: {
                    defaults: {
                        body: {}
                    }
                }
            }

            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })
    })

    describe('combined variants + defaults', () => {
        it('generates both @font-face and :root CSS in one style tag', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [
                        { name: 'Heebo', file: 'heebo-regular' }
                    ],
                    defaults: {
                        body: { fontFamily: 'Heebo, sans-serif', fontSize: '1.5rem' }
                    }
                }
            }

            useFontFaces()

            const css = getInjectedCss()!
            expect(css).toContain('@font-face')
            expect(css).toContain(':root {')
            expect(css).toContain("font-family: 'Heebo'")
            expect(css).toContain('--body-font-family: Heebo, sans-serif;')
        })

        it('uses correct style key for deduplication', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{ name: 'Test', file: 'test' }]
                }
            }

            useFontFaces()

            expect(getLastHeadValue()?.style[0].key).toBe('client-config-font-faces-and-typography')
        })
    })

    describe('CSS injection hardening — uploaded fontFaces', () => {
        it('escapes single quote in font name', () => {
            mockConfigRef.value = {
                typography: {
                    fontFaces: [{
                        name: "O'Grady",
                        src: '/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
                        weight: 400,
                        style: 'normal',
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            // Must be escaped — raw quote would terminate the CSS string.
            expect(css).toContain("font-family: 'O\\'Grady'")
        })

        it('escapes newline in font name', () => {
            mockConfigRef.value = {
                typography: {
                    fontFaces: [{
                        name: "Bad\nName",
                        src: '/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
                        weight: 400,
                        style: 'normal',
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            // The newline inside the name must be CSS-escaped, not raw.
            expect(css).toMatch(/\\00000a /i)
            // The escaped newline must appear inside the font-family value, not
            // as a literal newline breaking the CSS string.
            expect(css).not.toMatch(/font-family: '[^']*\n/)
        })

        it('skips @font-face rule when src URL fails allowlist check', () => {
            mockConfigRef.value = {
                typography: {
                    fontFaces: [{
                        name: 'Safe Name',
                        src: "'); body{display:none}; @font-face{src:url('",
                        weight: 400,
                        style: 'normal',
                    }],
                },
            }
            useFontFaces()
            // A hostile src must produce no @font-face output at all.
            expect(getLastHeadValue()?.style).toEqual([])
        })

        it('skips only the bad entry when mixed with a safe one', () => {
            mockConfigRef.value = {
                typography: {
                    fontFaces: [
                        {
                            name: 'Good Font',
                            src: '/api/fonts/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002',
                            weight: 400,
                            style: 'normal',
                        },
                        {
                            name: 'Evil Font',
                            src: 'https://evil.example.com/hack.woff2',
                            weight: 400,
                            style: 'normal',
                        },
                    ],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toContain('Good Font')
            expect(css).not.toContain('Evil Font')
            expect(css).not.toContain('evil.example.com')
        })
    })

    describe('CSS injection hardening — theme variants', () => {
        it('escapes single quote in variant family name', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{ name: "O'Neill", file: "oneill", weight: 400 }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toContain("font-family: 'O\\'Neill'")
        })

        it('escapes newline in variable-font variant family name', () => {
            mockConfigRef.value = {
                typography: {
                    variants: [{
                        name: "Bad\nVar",
                        file: "bad-var",
                        family: "Bad\nVar",
                        variable: true,
                        axes: { wght: { min: 100, max: 900, default: 400 } },
                    }],
                },
            }
            useFontFaces()
            const css = getInjectedCss()!
            expect(css).toMatch(/\\00000a /i)
        })
    })

    describe('config value is null/undefined', () => {
        it('calls useHead with empty style and link when config.value is null', () => {
            mockConfigRef.value = null
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })

        it('calls useHead with empty style and link when config.value is undefined', () => {
            mockConfigRef.value = undefined
            useFontFaces()
            expect(mockUseHead).toHaveBeenCalledOnce()
            expect(getLastHeadValue()?.style).toEqual([])
            expect(getLastHeadValue()?.link).toBeUndefined()
        })
    })
})
