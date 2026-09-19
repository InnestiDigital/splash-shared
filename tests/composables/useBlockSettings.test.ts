import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useThemeConfig before importing the composable
const mockGetBlockSchema = vi.fn()
const mockGetBlockDefaults = vi.fn()

vi.mock('~/shared/composables/useThemeConfig', () => ({
    useThemeConfig: () => ({
        getBlockSchema: mockGetBlockSchema,
        getBlockDefaults: mockGetBlockDefaults
    })
}))

import { useBlockSettings } from '~/shared/composables/useBlockSettings'

// --- Helpers ---

function makeSchema(fields: Array<Record<string, any>> = []) {
    return {
        component: 'TestBlock',
        type: 'test-block',
        label: { 'en-US': 'Test Block' },
        settings: fields.map(f => ({
            type: 'text',
            id: f.id,
            label: { 'en-US': f.id },
            ...f
        }))
    }
}

// --- Tests ---

describe('useBlockSettings', () => {
    beforeEach(() => {
        mockGetBlockSchema.mockReset()
        mockGetBlockDefaults.mockReturnValue({})
    })

    describe('settings cascade', () => {
        it('returns instance settings when no schema exists', () => {
            mockGetBlockSchema.mockReturnValue(null)

            const { resolvedSettings, schema } = useBlockSettings('missing-block', { title: 'Hello' })

            expect(schema).toBeNull()
            expect(resolvedSettings.value).toEqual({ title: 'Hello' })
        })

        it('uses schema defaults when no instance or theme defaults provided', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'color', default: '#000000' },
                    { id: 'size', default: 'medium' }
                ])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {})

            expect(resolvedSettings.value.color).toBe('#000000')
            expect(resolvedSettings.value.size).toBe('medium')
        })

        it('theme defaults override schema defaults', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'color', default: '#000000' },
                    { id: 'size', default: 'medium' }
                ])
            )
            mockGetBlockDefaults.mockReturnValue({ color: '#ff0000' })

            const { resolvedSettings } = useBlockSettings('test-block', {})

            expect(resolvedSettings.value.color).toBe('#ff0000')
            expect(resolvedSettings.value.size).toBe('medium')
        })

        it('instance settings override theme defaults and schema defaults', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'color', default: '#000000' },
                    { id: 'size', default: 'medium' }
                ])
            )
            mockGetBlockDefaults.mockReturnValue({ color: '#ff0000', size: 'large' })

            const { resolvedSettings } = useBlockSettings('test-block', { color: '#00ff00' })

            expect(resolvedSettings.value.color).toBe('#00ff00')
            expect(resolvedSettings.value.size).toBe('large')
        })

        it('passes through extra instance settings not in schema', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'title', default: 'Default' }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {
                title: 'Custom',
                extraProp: 'should-survive'
            })

            expect(resolvedSettings.value.title).toBe('Custom')
            expect(resolvedSettings.value.extraProp).toBe('should-survive')
        })

        it('leaves field undefined when no value exists at any level', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'optional' }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {})

            expect(resolvedSettings.value.optional).toBeUndefined()
        })
    })

    describe('translatable field resolution', () => {
        it('resolves exact locale match', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: { 'en-US': 'Hello', 'fr-CA': 'Bonjour' }
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {}, 'fr-CA')

            expect(resolvedSettings.value.heading).toBe('Bonjour')
        })

        it('falls back to en-US when locale not found', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: { 'en-US': 'Hello' }
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {}, 'de-DE')

            expect(resolvedSettings.value.heading).toBe('Hello')
        })

        it('falls back to first available value when no en-US', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: { 'ja-JP': 'Konnichiwa' }
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {}, 'de-DE')

            expect(resolvedSettings.value.heading).toBe('Konnichiwa')
        })

        it('returns non-object values as-is for translatable fields', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: 'Plain string'
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {})

            expect(resolvedSettings.value.heading).toBe('Plain string')
        })

        it('does not resolve locale for non-translatable object values', () => {
            const objectValue = { nested: 'data', 'en-US': 'should-not-resolve' }
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'config',
                    translatable: false,
                    default: objectValue
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', {})

            expect(resolvedSettings.value.config).toEqual(objectValue)
        })

        it('resolves instance translatable values over defaults', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: { 'en-US': 'Default', 'fr-CA': 'Défaut' }
                }])
            )

            const instanceSettings = {
                heading: { 'en-US': 'Custom', 'fr-CA': 'Personnalisé' }
            }

            const { resolvedSettings } = useBlockSettings('test-block', instanceSettings, 'fr-CA')

            expect(resolvedSettings.value.heading).toBe('Personnalisé')
        })

        it('returns null/undefined translatable values as-is', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'heading', translatable: true }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', { heading: null })

            expect(resolvedSettings.value.heading).toBeNull()
        })

        it('returns bare TipTap doc as-is on a translatable field (not as locale map)', () => {
            // A bare TipTap doc on a translatable field should be returned
            // unchanged. Treating it as a locale map would return value.type
            // ('doc' — a string) instead of the document, breaking rendering.
            const bareDoc = {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
            }
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'body', translatable: true, type: 'richtext' }])
            )

            const { resolvedSettings } = useBlockSettings('test-block', { body: bareDoc }, 'fr-CA')

            expect(resolvedSettings.value.body).toEqual(bareDoc)
        })

        it('resolves TipTap doc per locale from a locale map', () => {
            const enDoc = {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
            }
            const frDoc = {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }],
            }
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'body', translatable: true, type: 'richtext' }])
            )

            const { resolvedSettings } = useBlockSettings(
                'test-block',
                { body: { 'en-US': enDoc, 'fr-CA': frDoc } },
                'fr-CA',
            )

            expect(resolvedSettings.value.body).toEqual(frDoc)
        })

        it('resolves empty string translatable value instead of falling through to another locale', () => {
            // Empty string was previously falsy-skipped because of `if (value[locale])`.
            // Empty should be a valid, explicit authored value.
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{ id: 'heading', translatable: true }])
            )

            const { resolvedSettings } = useBlockSettings(
                'test-block',
                { heading: { 'en-US': 'Hello', 'fr-CA': '' } },
                'fr-CA',
            )

            expect(resolvedSettings.value.heading).toBe('')
        })
    })

    describe('validate', () => {
        it('returns schema error when no schema exists', () => {
            mockGetBlockSchema.mockReturnValue(null)

            const { validate } = useBlockSettings('unknown-block')
            const errors = validate()

            expect(errors).toHaveLength(1)
            expect(errors[0].field).toBe('_schema')
            expect(errors[0].message).toContain('unknown-block')
        })

        it('returns empty array when all valid', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'title', validation: { required: true } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { title: 'Valid' })

            expect(validate()).toEqual([])
        })

        it('catches required field violations', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'title', validation: { required: true } }
                ])
            )

            const { validate } = useBlockSettings('test-block', {})

            const errors = validate()
            expect(errors).toHaveLength(1)
            expect(errors[0].field).toBe('title')
            expect(errors[0].message).toContain('required')
        })

        it('treats empty string as missing for required fields', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'title', validation: { required: true } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { title: '' })

            expect(validate()).toHaveLength(1)
        })

        it('catches maxLength violations', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'name', validation: { maxLength: 5 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { name: 'toolong' })

            const errors = validate()
            expect(errors).toHaveLength(1)
            expect(errors[0].field).toBe('name')
            expect(errors[0].message).toContain('max length')
        })

        it('passes maxLength when value is within limit', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'name', validation: { maxLength: 10 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { name: 'ok' })

            expect(validate()).toEqual([])
        })

        it('catches range min violations', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'opacity', type: 'range', options: { min: 0, max: 100 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { opacity: -5 })

            const errors = validate()
            expect(errors).toHaveLength(1)
            expect(errors[0].field).toBe('opacity')
            expect(errors[0].message).toContain('>= 0')
        })

        it('catches range max violations', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'opacity', type: 'range', options: { min: 0, max: 100 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', { opacity: 150 })

            const errors = validate()
            expect(errors).toHaveLength(1)
            expect(errors[0].message).toContain('<= 100')
        })

        it('catches invalid select values', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'align',
                    type: 'select',
                    options: [
                        { value: 'left', label: { 'en-US': 'Left' } },
                        { value: 'center', label: { 'en-US': 'Center' } },
                        { value: 'right', label: { 'en-US': 'Right' } }
                    ]
                }])
            )

            const { validate } = useBlockSettings('test-block', { align: 'justify' })

            const errors = validate()
            expect(errors).toHaveLength(1)
            expect(errors[0].field).toBe('align')
            expect(errors[0].message).toContain('left, center, right')
        })

        it('passes valid select values', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'align',
                    type: 'select',
                    options: [
                        { value: 'left', label: { 'en-US': 'Left' } },
                        { value: 'center', label: { 'en-US': 'Center' } }
                    ]
                }])
            )

            const { validate } = useBlockSettings('test-block', { align: 'center' })

            expect(validate()).toEqual([])
        })

        it('collects multiple validation errors', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'title', validation: { required: true } },
                    { id: 'desc', validation: { maxLength: 3 } },
                    { id: 'opacity', type: 'range', options: { min: 0, max: 1 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', {
                desc: 'toolong',
                opacity: 5
            })

            const errors = validate()
            expect(errors).toHaveLength(3)
            const fields = errors.map(e => e.field)
            expect(fields).toContain('title')
            expect(fields).toContain('desc')
            expect(fields).toContain('opacity')
        })

        it('skips range validation for null/undefined values', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([
                    { id: 'opacity', type: 'range', options: { min: 0, max: 100 } }
                ])
            )

            const { validate } = useBlockSettings('test-block', {})

            expect(validate()).toEqual([])
        })

        it('skips select validation for null/undefined values', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'align',
                    type: 'select',
                    options: [{ value: 'left', label: { 'en-US': 'Left' } }]
                }])
            )

            const { validate } = useBlockSettings('test-block', {})

            expect(validate()).toEqual([])
        })
    })

    describe('schema exposure', () => {
        it('exposes the schema from useThemeConfig', () => {
            const schema = makeSchema([{ id: 'test' }])
            mockGetBlockSchema.mockReturnValue(schema)

            const result = useBlockSettings('test-block')

            expect(result.schema).toBe(schema)
        })
    })

    describe('default locale', () => {
        it('defaults to en-US when no locale provided', () => {
            mockGetBlockSchema.mockReturnValue(
                makeSchema([{
                    id: 'heading',
                    translatable: true,
                    default: { 'en-US': 'English', 'fr-CA': 'French' }
                }])
            )

            const { resolvedSettings } = useBlockSettings('test-block')

            expect(resolvedSettings.value.heading).toBe('English')
        })
    })
})
