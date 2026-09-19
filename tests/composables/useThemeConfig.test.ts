import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// --- Mocks ---

const mockConfig = ref<Record<string, any>>({})
const mockThemeName = ref('standalone')

vi.mock('~/shared/composables/useClientConfig', () => ({
    useClientConfig: () => ({
        config: mockConfig,
        themeName: mockThemeName
    })
}))

const mockThemeConfigs: Record<string, any> = {}
const mockBlockSchemas: Record<string, any> = {}
vi.mock('~/shared/features/cms/themeData', () => ({
    getThemeConfig: (name: string) => mockThemeConfigs[name] || {},
}))

vi.mock('~/shared/features/cms/blockSchemasRuntime', () => ({
    getRuntimeBlockSchemas: (name: string) => mockBlockSchemas[name] || {},
}))

import { useThemeConfig } from '~/shared/composables/useThemeConfig'

// --- Helpers ---

function setThemeConfig(name: string, config: Record<string, any>) {
    mockThemeConfigs[name] = config
}

function setBlockSchemas(name: string, schemas: Record<string, any>) {
    mockBlockSchemas[name] = schemas
}

function clearMocks() {
    for (const key of Object.keys(mockThemeConfigs)) delete mockThemeConfigs[key]
    for (const key of Object.keys(mockBlockSchemas)) delete mockBlockSchemas[key]
    mockConfig.value = {}
    mockThemeName.value = 'standalone'
}

// --- Tests ---

describe('useThemeConfig', () => {
    beforeEach(clearMocks)

    describe('theme', () => {
        it('resolves theme config based on active theme name', () => {
            setThemeConfig('standalone', { name: 'standalone', label: { 'en-US': 'Apple' }, allowedBlocks: ['hero'] })
            const { theme } = useThemeConfig()
            expect(theme.value.name).toBe('standalone')
        })

        it('returns empty object when theme config not found', () => {
            const { theme } = useThemeConfig()
            expect(theme.value).toEqual({})
        })

        it('reacts to theme name changes', () => {
            setThemeConfig('standalone', { name: 'standalone', allowedBlocks: ['hero'] })
            setThemeConfig('other', { name: 'other', allowedBlocks: ['header'] })

            const { theme } = useThemeConfig()
            expect(theme.value.name).toBe('standalone')

            mockThemeName.value = 'other'
            expect(theme.value.name).toBe('other')
        })
    })

    describe('themeSettings', () => {
        it('returns schema defaults when no client overrides', () => {
            setThemeConfig('standalone', {
                settings: [
                    { type: 'color', id: 'primaryColor', label: { 'en-US': 'Primary' }, default: '#ff0000' },
                    { type: 'text', id: 'siteName', label: { 'en-US': 'Name' }, default: 'My Site' }
                ]
            })

            const { themeSettings } = useThemeConfig()
            expect(themeSettings.value).toEqual({ primaryColor: '#ff0000', siteName: 'My Site' })
        })

        it('merges client overrides over schema defaults', () => {
            setThemeConfig('standalone', {
                settings: [
                    { type: 'color', id: 'primaryColor', label: { 'en-US': 'Primary' }, default: '#ff0000' },
                    { type: 'text', id: 'siteName', label: { 'en-US': 'Name' }, default: 'Default' }
                ]
            })
            mockConfig.value = { themeSettings: { primaryColor: '#00ff00' } }

            const { themeSettings } = useThemeConfig()
            expect(themeSettings.value).toEqual({ primaryColor: '#00ff00', siteName: 'Default' })
        })

        it('returns empty object when no settings defined', () => {
            setThemeConfig('standalone', {})
            const { themeSettings } = useThemeConfig()
            expect(themeSettings.value).toEqual({})
        })

        it('skips fields without default values', () => {
            setThemeConfig('standalone', {
                settings: [
                    { type: 'text', id: 'withDefault', label: { 'en-US': 'A' }, default: 'yes' },
                    { type: 'text', id: 'noDefault', label: { 'en-US': 'B' } }
                ]
            })

            const { themeSettings } = useThemeConfig()
            expect(themeSettings.value).toEqual({ withDefault: 'yes' })
            expect('noDefault' in themeSettings.value).toBe(false)
        })

        it('client overrides can add keys not in schema', () => {
            setThemeConfig('standalone', { settings: [] })
            mockConfig.value = { themeSettings: { customKey: 'extra' } }

            const { themeSettings } = useThemeConfig()
            expect(themeSettings.value).toEqual({ customKey: 'extra' })
        })
    })

    describe('allowedBlocks', () => {
        it('returns allowed block types from theme config', () => {
            setThemeConfig('standalone', { allowedBlocks: ['hero', 'text', 'image'] })
            const { allowedBlocks } = useThemeConfig()
            expect(allowedBlocks.value).toEqual(['hero', 'text', 'image'])
        })

        it('returns empty array when no allowedBlocks defined', () => {
            setThemeConfig('standalone', {})
            const { allowedBlocks } = useThemeConfig()
            expect(allowedBlocks.value).toEqual([])
        })
    })

    describe('blockDefaults', () => {
        it('returns block defaults from theme config', () => {
            setThemeConfig('standalone', {
                blockDefaults: { hero: { title: 'Welcome' }, text: { fontSize: '16px' } }
            })
            const { blockDefaults } = useThemeConfig()
            expect(blockDefaults.value).toEqual({ hero: { title: 'Welcome' }, text: { fontSize: '16px' } })
        })

        it('returns empty object when no blockDefaults defined', () => {
            setThemeConfig('standalone', {})
            const { blockDefaults } = useThemeConfig()
            expect(blockDefaults.value).toEqual({})
        })
    })

    describe('getBlockSchema', () => {
        it('returns schema for a known block type', () => {
            const heroSchema = {
                component: 'HeroBlock',
                type: 'hero',
                label: { 'en-US': 'Hero Banner' },
                settings: [{ type: 'text', id: 'title', label: { 'en-US': 'Title' } }]
            }
            setBlockSchemas('standalone', { hero: heroSchema })

            const { getBlockSchema } = useThemeConfig()
            expect(getBlockSchema('hero')).toEqual(heroSchema)
        })

        it('returns null for unknown block type', () => {
            setBlockSchemas('standalone', {})
            const { getBlockSchema } = useThemeConfig()
            expect(getBlockSchema('nonexistent')).toBeNull()
        })

        it('returns the runtime schema verbatim — no dynamic option injection', () => {
            // getBlockSchema used to inject `options` onto form-button's
            // `method` field from config.api.requests. The runtime projection
            // dropped `options` entirely: the only consumer of this function is
            // useBlockSettings, which reads id/type/default/translatable. The
            // settings panel that renders that select reads full schemas from
            // /api/admin/s/:siteId/schemas, which still carries options.
            const formButtonSchema = {
                type: 'form-button',
                settings: [
                    { type: 'select', id: 'method' },
                    { type: 'text', id: 'label', default: 'Send' }
                ]
            }
            setBlockSchemas('standalone', { 'form-button': formButtonSchema })
            mockConfig.value = { api: { requests: { login: {}, register: {} } } }

            const { getBlockSchema } = useThemeConfig()
            const result = getBlockSchema('form-button')!

            expect(result).toEqual(formButtonSchema)
            expect(result.settings.find(f => f.id === 'method')).not.toHaveProperty('options')
        })
    })

    describe('getBlockDefaults', () => {
        it('returns defaults for a specific block type', () => {
            setThemeConfig('standalone', {
                blockDefaults: { hero: { title: 'Welcome', bg: '#fff' } }
            })
            const { getBlockDefaults } = useThemeConfig()
            expect(getBlockDefaults('hero')).toEqual({ title: 'Welcome', bg: '#fff' })
        })

        it('returns empty object for block type without defaults', () => {
            setThemeConfig('standalone', { blockDefaults: { hero: { title: 'X' } } })
            const { getBlockDefaults } = useThemeConfig()
            expect(getBlockDefaults('text')).toEqual({})
        })

        it('returns empty object when no blockDefaults exist', () => {
            setThemeConfig('standalone', {})
            const { getBlockDefaults } = useThemeConfig()
            expect(getBlockDefaults('hero')).toEqual({})
        })
    })

    describe('isBlockAllowed', () => {
        it('returns true for allowed block type', () => {
            setThemeConfig('standalone', { allowedBlocks: ['hero', 'text'] })
            const { isBlockAllowed } = useThemeConfig()
            expect(isBlockAllowed('hero')).toBe(true)
        })

        it('returns false for disallowed block type', () => {
            setThemeConfig('standalone', { allowedBlocks: ['hero'] })
            const { isBlockAllowed } = useThemeConfig()
            expect(isBlockAllowed('text')).toBe(false)
        })

        it('returns false when no allowedBlocks defined', () => {
            setThemeConfig('standalone', {})
            const { isBlockAllowed } = useThemeConfig()
            expect(isBlockAllowed('hero')).toBe(false)
        })
    })

    describe('typography', () => {
        it('returns typography config from theme', () => {
            const typo = {
                variants: [{ name: 'Heebo', file: 'Heebo.woff2', weight: 400 }],
                defaults: { fontFamily: 'Heebo' }
            }
            setThemeConfig('standalone', { typography: typo })
            const { typography } = useThemeConfig()
            expect(typography.value).toEqual(typo)
        })

        it('returns empty object when no typography defined', () => {
            setThemeConfig('standalone', {})
            const { typography } = useThemeConfig()
            expect(typography.value).toEqual({})
        })
    })

    describe('layout', () => {
        it('returns layout config from theme', () => {
            setThemeConfig('standalone', { layout: { header: { sticky: true, justifyMenu: 'start' } } })
            const { layout } = useThemeConfig()
            expect(layout.value).toEqual({ header: { sticky: true, justifyMenu: 'start' } })
        })

        it('returns empty object when no layout defined', () => {
            setThemeConfig('standalone', {})
            const { layout } = useThemeConfig()
            expect(layout.value).toEqual({})
        })
    })

    describe('envVariablesSchema', () => {
        it('returns env variables schema from theme', () => {
            const envVars = {
                API_URL: { type: 'text' as const, label: { 'en-US': 'API URL' }, description: 'Base API URL', default: '' },
                API_KEY: { type: 'text' as const, label: { 'en-US': 'API Key' }, description: 'API key', default: '' }
            }
            setThemeConfig('standalone', { envVariables: envVars })
            const { envVariablesSchema } = useThemeConfig()
            expect(envVariablesSchema.value).toEqual(envVars)
        })

        it('returns empty object when no envVariables defined', () => {
            setThemeConfig('standalone', {})
            const { envVariablesSchema } = useThemeConfig()
            expect(envVariablesSchema.value).toEqual({})
        })
    })

    describe('getEnvVarSchema', () => {
        it('returns schema for a known env variable', () => {
            const envVars = {
                API_URL: { type: 'text' as const, label: { 'en-US': 'API URL' }, description: 'Base URL', default: 'https://api.example.com' }
            }
            setThemeConfig('standalone', { envVariables: envVars })
            const { getEnvVarSchema } = useThemeConfig()
            expect(getEnvVarSchema('API_URL')).toEqual(envVars.API_URL)
        })

        it('returns null for unknown env variable', () => {
            setThemeConfig('standalone', { envVariables: {} })
            const { getEnvVarSchema } = useThemeConfig()
            expect(getEnvVarSchema('UNKNOWN')).toBeNull()
        })
    })
})
