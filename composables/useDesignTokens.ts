import { useHead } from '#imports'
import { computed } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'

type CssOverride = Record<string, string | number>

function createVarBlock(parentKey: string, overrides: CssOverride): string {
    const lines = Object.entries(overrides).map(([prop, value]) => {
        // prop is kebab-case: "font-family", "menu-spacing", etc.
        return `  --${parentKey}-${prop}: ${value};`
    })

    if (!lines.length) return ''

    return `
:root {
${lines.join('\n')}
}
`
}
function scanForCssOverrides(
    node: unknown,
    parentComponentKey: string | undefined,
    acc: string[]
) {
    if (!node || typeof node !== 'object') return

    if (Array.isArray(node)) {
        for (const item of node) {
            if (!item || typeof item !== 'object') continue

            const obj = item as Record<string, any>
            const itemComponentKey =
                typeof obj.type === 'string' ? obj.type : parentComponentKey

            scanForCssOverrides(obj, itemComponentKey, acc)
        }
        return
    }

    const obj = node as Record<string, any>

    const thisComponentKey =
        typeof obj.type === 'string' ? obj.type : parentComponentKey

    if (obj.cssOverride && thisComponentKey && typeof obj.cssOverride === 'object') {
        const block = createVarBlock(thisComponentKey, obj.cssOverride as CssOverride)
        if (block) acc.push(block)
    }

    const containerKeys = new Set(['options', 'settings', 'blocks', 'slots'])

    for (const [key, value] of Object.entries(obj)) {
        if (!value || typeof value !== 'object') continue
        if (key === 'cssOverride') continue // già gestito sopra

        const nextParentComponentKey = containerKeys.has(key)
            ? thisComponentKey
            : key

        scanForCssOverrides(value, nextParentComponentKey, acc)
    }
}

export function useCssOverridesFromConfig() {
    const { config } = useClientConfig()

    const css = computed(() => {
        const cfg = config.value
        if (!cfg) return ''

        const cssBlocks: string[] = []

        // Handle theme-level CSS vars (no component prefix, e.g. --base-font-color)
        // Selector is `:root:root` (not plain `:root`): the theme stylesheet ships
        // its own `:root` token defaults and — being layout-chunk-loaded since
        // CSS-01..05 — its <style> tag lands AFTER this useHead block in <head>.
        // Equal specificity would let the static defaults win over the author's
        // DB-configured values (e.g. accentColor reverting to the scss fallback).
        // Doubling the pseudo-class keeps these author overrides authoritative
        // regardless of injection order.
        const themeVars = cfg.themeVars as Record<string, string> | undefined
        if (themeVars && typeof themeVars === 'object') {
            const lines = Object.entries(themeVars).map(([k, v]) => `  --${k}: ${v};`)
            if (lines.length) {
                cssBlocks.push(`:root:root {\n${lines.join('\n')}\n}`)
            }
        }

        // Typography token CSS custom properties
        const typographyTokens = cfg.typography?.tokens as Record<string, Record<string, any>> | undefined
        if (typographyTokens && typeof typographyTokens === 'object') {
            // Build a family → default weight lookup from the variant registry.
            // First variant encountered per family wins — matches the prior static
            // weightMap behaviour (e.g. Open Sans defaults to 400 because
            // open-sans-regular is listed first) while removing the hard-coded map.
            const variants = (cfg.typography?.variants ?? []) as Array<{ name: string; family?: string; weight?: number }>
            const defaultWeightByFamily = new Map<string, number>()
            for (const v of variants) {
                const fam = v.family ?? v.name
                if (!defaultWeightByFamily.has(fam)) defaultWeightByFamily.set(fam, v.weight ?? 400)
            }

            const lines: string[] = []
            for (const [tokenName, props] of Object.entries(typographyTokens)) {
                // Convert camelCase token names to kebab-case CSS var names
                // e.g., sectionTitle → section-title
                const cssName = tokenName.replace(/([A-Z])/g, '-$1').toLowerCase()
                if (props.fontSize) lines.push(`  --type-${cssName}-size: ${props.fontSize};`)
                if (props.letterSpacing) lines.push(`  --type-${cssName}-letter-spacing: ${props.letterSpacing};`)
                if (props.lineHeight !== undefined) lines.push(`  --type-${cssName}-line-height: ${props.lineHeight};`)
                if (props.textTransform) lines.push(`  --type-${cssName}-text-transform: ${props.textTransform};`)
                if (props.fontFamily) {
                    // Honor explicit numeric fontWeight on the token; otherwise fall
                    // back to the family's default weight derived from variants.
                    const familyDefaultWeight = defaultWeightByFamily.get(props.fontFamily) ?? 400
                    const weight = typeof props.fontWeight === 'number' ? props.fontWeight : familyDefaultWeight
                    lines.push(`  --type-${cssName}-weight: ${weight};`)
                    lines.push(`  --type-${cssName}-font-family: '${props.fontFamily}';`)
                }
            }
            if (lines.length) {
                cssBlocks.push(`:root:root {\n${lines.join('\n')}\n}`)
            }
        }

        // Spacing token CSS custom properties (section-space-y, container-inset-x, stack-gap)
        const spacingTokens = cfg.spacingTokens as Record<string, Record<string, string>> | undefined
        if (spacingTokens && typeof spacingTokens === 'object') {
            const lines: string[] = []
            for (const [groupName, values] of Object.entries(spacingTokens)) {
                // Convert camelCase group names to kebab-case CSS var prefix
                // e.g., sectionSpaceY → section-space-y
                const cssPrefix = groupName.replace(/([A-Z])/g, '-$1').toLowerCase()
                for (const [tier, value] of Object.entries(values)) {
                    lines.push(`  --${cssPrefix}-${tier}: ${value};`)
                }
            }
            if (lines.length) {
                cssBlocks.push(`:root:root {\n${lines.join('\n')}\n}`)
            }
        }

        // Scan for cssOverride objects anywhere in the config tree
        // (per-block and per-navigation layout overrides)
        scanForCssOverrides(cfg, undefined, cssBlocks)

        return cssBlocks.join('\n')
    })

    // useHead must be called in setup() context — passing a computed keeps it reactive
    // without re-calling useHead on every config update.
    useHead(computed(() => ({
        style: css.value ? [{ key: 'client-config-css-overrides', innerHTML: css.value }] : [],
    })))
}