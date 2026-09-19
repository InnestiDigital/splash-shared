import { computed } from 'vue'
import { getThemeConfig } from '~/shared/features/cms/themeData'
import { getRuntimeBlockSchemas } from '~/shared/features/cms/blockSchemasRuntime'
import type { RuntimeBlockSchema } from '~/shared/types/theme'
import { useClientConfig } from '~/shared/composables/useClientConfig'

// Types
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

// The renderer sees the PROJECTED schema (`blockSchemasRuntime.ts`), not the
// authoring one — no labels, groups, presets, options or validation. Admin
// reads full schemas from `/api/admin/s/:siteId/schemas` instead.
type BlockSchema = RuntimeBlockSchema

type EnvVariableField = {
    type: 'text'
    label: LabelMap
    description: string
    default: string
}

type ThemeConfig = {
    name: string
    label: LabelMap
    allowedBlocks: string[]
    settings?: SettingField[]
    groups?: Array<{ id: string; label: LabelMap }>
    blockDefaults?: Record<string, Record<string, any>>
    typography?: {
        variants?: Array<{ name: string; file: string; weight?: number; style?: string }>
        defaults?: Record<string, any>
    }
    layout?: Record<string, any>
    envVariables?: Record<string, EnvVariableField>
    motion?: {
        defaultDuration?: number   // milliseconds, e.g. 600
        defaultEasing?: string     // CSS easing string, e.g. 'cubic-bezier(.25,.1,.25,1)'
        reducedMotion?: string     // 'fade-only' | 'none'
        motionScale?: number       // multiplier, e.g. 1.0
    }
}

export function useThemeConfig() {
    const { config, themeName } = useClientConfig()

    // Reactively resolve theme config and schemas based on active theme
    const theme = computed<ThemeConfig>(() => getThemeConfig(themeName.value) as ThemeConfig)
    const schemas = computed(() => getRuntimeBlockSchemas(themeName.value))

    // Merge theme settings with client overrides
    const themeSettings = computed(() => {
        const defaults: Record<string, any> = {}

        // Extract defaults from theme settings schema
        for (const field of theme.value.settings || []) {
            if (field.default !== undefined) {
                defaults[field.id] = field.default
            }
        }

        // Override with client-provided values (reactive to config changes)
        return {
            ...defaults,
            ...(config.value.themeSettings || {})
        }
    })

    // Get allowed block types
    const allowedBlocks = computed(() => theme.value.allowedBlocks || [])

    // Get block defaults from theme
    const blockDefaults = computed(() => theme.value.blockDefaults || {})

    // Get block schema by type.
    //
    // This used to inject dynamic `options` onto form-button's `method` field
    // from `config.api.requests`. Dropped with the runtime projection: the only
    // consumer of this function is `useBlockSettings`, which reads `id`,
    // `type`, `default` and `translatable` — nothing reads `options` at
    // runtime. The settings panel that renders that select gets its schema from
    // `/api/admin/s/:siteId/schemas`, which still carries full options.
    const getBlockSchema = (type: string): BlockSchema | null => {
        return schemas.value[type] || null
    }

    // Get block defaults for a specific type
    const getBlockDefaults = (type: string): Record<string, any> => {
        return theme.value.blockDefaults?.[type] || {}
    }

    // Check if a block type is allowed
    const isBlockAllowed = (type: string): boolean => {
        return allowedBlocks.value.includes(type)
    }

    // Typography config
    const typography = computed(() => theme.value.typography || {})

    // Layout config
    const layout = computed(() => theme.value.layout || {})

    // Environment variables schema from theme (flat list)
    const envVariablesSchema = computed(() => theme.value.envVariables || {})

    // Get env variable schema by key
    const getEnvVarSchema = (key: string): EnvVariableField | null => {
        return envVariablesSchema.value[key] || null
    }

    return {
        theme,
        themeSettings,
        allowedBlocks,
        blockDefaults,
        getBlockSchema,
        getBlockDefaults,
        isBlockAllowed,
        typography,
        layout,
        envVariablesSchema,
        getEnvVarSchema
    }
}
