import { computed, type ComputedRef } from 'vue'
import { useThemeConfig } from '~/shared/composables/useThemeConfig'
import { isTipTapDocument } from '~/shared/tiptap/types'

type LabelMap = Record<string, string>

type SettingField = {
    type: string
    id: string
    label: LabelMap
    default?: any
    group?: string
    translatable?: boolean
    validation?: {
        required?: boolean
        maxLength?: number
    }
    options?: any
}

type BlockSchema = {
    component: string
    type: string
    label: LabelMap
    settings: SettingField[]
    groups?: Array<{ id: string; label: LabelMap }>
    presets?: Array<{ name: LabelMap; settings: Record<string, any> }>
}

type ValidationError = {
    field: string
    message: string
}

type UseBlockSettingsReturn = {
    schema: BlockSchema | null
    resolvedSettings: ComputedRef<Record<string, any>>
    validate: () => ValidationError[]
}

/**
 * Composable to resolve block settings with proper default merging
 *
 * Resolution priority (highest to lowest):
 * 1. Instance settings (from block.settings in client.json)
 * 2. Theme blockDefaults (from theme.json blockDefaults[type])
 * 3. Schema defaults (from *.settings.json settings[].default)
 *
 * When authState is provided and the block schema has authAware: true,
 * _auth or _guest overrides are merged on top after the standard cascade.
 *
 * @param blockType - The block type (kebab-case, e.g., 'hero-block')
 * @param instanceSettings - The settings provided for this block instance
 * @param locale - Optional locale for resolving translatable values
 * @param authState - Optional auth state for auth-aware blocks ('auth' | 'guest' | null)
 */
/**
 * The locale block-settings resolution tries FIRST (and falls back to). The
 * renderer passes it in `DynamicPage`; anything that WRITES a translatable
 * setting value meant for a renderer that resolves this way (the brand-canvas
 * override workspace) must write under the same key, or the value silently
 * never paints.
 */
export const SETTINGS_RESOLUTION_LOCALE = 'en-US'

export function useBlockSettings(
    blockType: string,
    instanceSettings: Record<string, any> = {},
    locale: string = 'en-US',
    authState?: 'auth' | 'guest' | null
): UseBlockSettingsReturn {
    const { getBlockSchema, getBlockDefaults } = useThemeConfig()

    const schema = getBlockSchema(blockType)
    const themeDefaults = getBlockDefaults(blockType)

    // Compute schema defaults
    const schemaDefaults = computed(() => {
        if (!schema) return {}

        const defaults: Record<string, any> = {}
        for (const field of schema.settings || []) {
            if (field.default !== undefined) {
                defaults[field.id] = field.default
            }
        }
        return defaults
    })

    // Resolve a potentially localized value
    const resolveValue = (value: any, field: SettingField): any => {
        if (value === undefined || value === null) return value

        // If field is translatable and value is an object with locale keys.
        // Important: a bare TipTap JSON doc is also an object, but it's NOT a
        // locale map — its keys are 'type' and 'content'. Treating it as a
        // locale map returns value.type === 'doc' (a string) instead of the
        // document itself, breaking rendering. Return bare docs as-is.
        if (
            field.translatable
            && typeof value === 'object'
            && !Array.isArray(value)
            && !isTipTapDocument(value)
        ) {
            // Try exact locale match first
            if (value[locale] !== undefined) return value[locale]
            // Fall back to en-US (matches server-side behavior)
            if (value['en-US'] !== undefined) return value['en-US']
            // Fall back to first available value
            const keys = Object.keys(value)
            if (keys.length > 0) return value[keys[0]]
        }

        return value
    }

    // Merge all settings sources with proper priority
    const resolvedSettings = computed(() => {
        const merged: Record<string, any> = {}

        if (!schema) {
            // No schema, just return instance settings
            return { ...instanceSettings }
        }

        // For each field in the schema, resolve the value
        for (const field of schema.settings || []) {
            const id = field.id

            // Priority: instance > theme defaults > schema defaults
            let value: any
            if (instanceSettings[id] !== undefined) {
                value = instanceSettings[id]
            } else if (themeDefaults[id] !== undefined) {
                value = themeDefaults[id]
            } else if (schemaDefaults.value[id] !== undefined) {
                value = schemaDefaults.value[id]
            }

            // Resolve localized values
            merged[id] = resolveValue(value, field)
        }

        // Also include any extra settings not in schema (passthrough),
        // but skip internal auth override keys
        for (const [key, value] of Object.entries(instanceSettings)) {
            if (key === '_auth' || key === '_guest') continue
            if (!(key in merged)) {
                merged[key] = value
            }
        }

        // Apply auth/guest overrides on top if authState is specified
        if (authState === 'auth' && instanceSettings._auth) {
            Object.assign(merged, instanceSettings._auth)
        } else if (authState === 'guest' && instanceSettings._guest) {
            Object.assign(merged, instanceSettings._guest)
        }

        return merged
    })

    // Validate settings against schema
    const validate = (): ValidationError[] => {
        const errors: ValidationError[] = []

        if (!schema) {
            errors.push({ field: '_schema', message: `No schema found for block type "${blockType}"` })
            return errors
        }

        const settings = resolvedSettings.value

        for (const field of schema.settings || []) {
            const value = settings[field.id]

            // Check required
            if (field.validation?.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: field.id,
                    message: `Field "${field.id}" is required`
                })
            }

            // Check maxLength
            if (field.validation?.maxLength && typeof value === 'string' && value.length > field.validation.maxLength) {
                errors.push({
                    field: field.id,
                    message: `Field "${field.id}" exceeds max length of ${field.validation.maxLength}`
                })
            }

            // Check range constraints
            if (field.type === 'range' && value !== undefined && value !== null) {
                const opts = field.options || {}
                if (opts.min !== undefined && value < opts.min) {
                    errors.push({
                        field: field.id,
                        message: `Field "${field.id}" must be >= ${opts.min}`
                    })
                }
                if (opts.max !== undefined && value > opts.max) {
                    errors.push({
                        field: field.id,
                        message: `Field "${field.id}" must be <= ${opts.max}`
                    })
                }
            }

            // Check select options
            if (field.type === 'select' && value !== undefined && value !== null) {
                const validValues = (field.options as Array<{ value: string }>)?.map(o => o.value) || []
                if (validValues.length > 0 && !validValues.includes(value)) {
                    errors.push({
                        field: field.id,
                        message: `Field "${field.id}" must be one of: ${validValues.join(', ')}`
                    })
                }
            }
        }

        return errors
    }

    return {
        schema,
        resolvedSettings,
        validate
    }
}
