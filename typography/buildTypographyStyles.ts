import type { TypographySnapshotPreset, TypographySnapshotRoles } from '~/server/services/typography/typographyTypes'
import {
  resolveAxes,
  formatFontVariationSettings,
  axisToLegacyProperties,
  type ResolvedAxis,
  type ThemeVariant,
} from '~/shared/typography/axisResolution'

interface PresetCssProps {
  family: string
  size: string
  weight: string
  'line-height': string
  'letter-spacing': string
  'text-transform': string
  color?: string
  // Extended properties — present only when the preset has a defined value
  'font-style'?: string
  'font-stretch'?: string
  'font-synthesis'?: string
  'text-align'?: string
  'word-spacing'?: string
  'text-indent'?: string
  'text-decoration-line'?: string
  'text-decoration-style'?: string
  'text-decoration-thickness'?: string
  'font-variant-ligatures'?: string
  'font-variant-caps'?: string
  'font-variant-numeric'?: string
  'font-kerning'?: string
  'font-optical-sizing'?: string
  'font-feature-settings'?: string
  'text-rendering'?: string
}

/**
 * Quote a single font family name. Returns it as-is if it already contains
 * quotes or is a comma-separated stack (caller manages stacks themselves).
 */
function cssFontFamily(raw: string): string {
  if (raw.includes(',') || raw.includes("'") || raw.includes('"')) return raw
  if (!raw.includes(' ')) return raw
  return `'${raw}'`
}

function presetToProps(preset: TypographySnapshotPreset): PresetCssProps {
  const props: PresetCssProps = {
    family: preset.fontFamily ? cssFontFamily(preset.fontFamily) : 'inherit',
    size: preset.fontSize || 'inherit',
    weight: preset.fontWeight != null ? String(preset.fontWeight) : 'inherit',
    'line-height': preset.lineHeight || 'inherit',
    'letter-spacing': preset.letterSpacing || 'normal',
    'text-transform': preset.textTransform || 'none',
  }
  if (preset.color) {
    props.color = preset.color
  }
  // Extended properties: emit only when explicitly set (null/undefined = absent)
  if (preset.fontStyle != null) props['font-style'] = preset.fontStyle
  if (preset.fontStretch != null) props['font-stretch'] = preset.fontStretch
  if (preset.fontSynthesis != null) props['font-synthesis'] = preset.fontSynthesis
  if (preset.textAlign != null) props['text-align'] = preset.textAlign
  if (preset.wordSpacing != null) props['word-spacing'] = preset.wordSpacing
  if (preset.textIndent != null) props['text-indent'] = preset.textIndent
  if (preset.textDecorationLine != null) props['text-decoration-line'] = preset.textDecorationLine
  if (preset.textDecorationStyle != null) props['text-decoration-style'] = preset.textDecorationStyle
  if (preset.textDecorationThickness != null) props['text-decoration-thickness'] = preset.textDecorationThickness
  if (preset.fontVariantLigatures != null) props['font-variant-ligatures'] = preset.fontVariantLigatures
  if (preset.fontVariantCaps != null) props['font-variant-caps'] = preset.fontVariantCaps
  if (preset.fontVariantNumeric != null) props['font-variant-numeric'] = preset.fontVariantNumeric
  if (preset.fontKerning != null) props['font-kerning'] = preset.fontKerning
  if (preset.fontOpticalSizing != null) props['font-optical-sizing'] = preset.fontOpticalSizing
  if (preset.fontFeatureSettings != null) props['font-feature-settings'] = preset.fontFeatureSettings
  if (preset.textRendering != null) props['text-rendering'] = preset.textRendering
  return props
}

interface VariablePresetEmission {
  /** Value for the `font-variation-settings` declaration + custom property. */
  fontVariationSettings: string
  /**
   * Derived legacy CSS properties (font-weight, font-optical-sizing, etc.).
   * For variable-font presets, the legacy DB fields (`fontWeight`,
   * `fontStyle`) are ignored at emit time — values come from axes via
   * `resolveAxes`. The columns stay populated and re-engage automatically
   * when the preset switches back to a static font.
   */
  legacy: Record<string, string>
}

function variableEmission(
  preset: TypographySnapshotPreset,
  variants: ThemeVariant[],
): VariablePresetEmission | null {
  const resolved = resolveAxes(preset.fontFamily, preset.variationAxes ?? null, variants)
  if (resolved.length === 0) return null
  return {
    fontVariationSettings: formatFontVariationSettings(resolved),
    legacy: axisToLegacyProperties(resolved),
  }
}

export interface ResolvedTypographyPresetStyle {
  mode: 'variable' | 'legacy'
  props: PresetCssProps
  resolvedAxes: ResolvedAxis[]
  fontVariationSettings?: string
  derivedLegacyProps: Record<string, string>
}

export interface ResolveTypographyPresetStyleOptions {
  mode?: 'auto' | 'force-legacy'
}

/**
 * Unified resolver for typography preset styles.
 *
 * Drives both runtime CSS emission (`buildTypographyStyles`) and the editor
 * preview (`PresetEditor.vue`) from the same codepath so the two stay in
 * lockstep when axes or fallback rules change.
 *
 * - mode='auto' (default): variable path when axes resolve; legacy otherwise.
 * - mode='force-legacy': always returns the legacy column values. Used by the
 *   editor to compute what fallback values will actually render after a
 *   variable→static family switch, so the warning banner can surface them.
 */
export function resolveTypographyPresetStyle(
  preset: TypographySnapshotPreset,
  themeVariants: ThemeVariant[] = [],
  options: ResolveTypographyPresetStyleOptions = {},
): ResolvedTypographyPresetStyle {
  const props = presetToProps(preset)

  if ((options.mode ?? 'auto') === 'force-legacy') {
    return { mode: 'legacy', props, resolvedAxes: [], derivedLegacyProps: {} }
  }

  const resolvedAxes = resolveAxes(preset.fontFamily, preset.variationAxes ?? null, themeVariants)
  if (resolvedAxes.length === 0) {
    return { mode: 'legacy', props, resolvedAxes: [], derivedLegacyProps: {} }
  }

  const derivedLegacyProps = axisToLegacyProperties(resolvedAxes)
  // Axis-derived weight wins over the legacy DB column for variable presets.
  if (derivedLegacyProps['font-weight']) props.weight = derivedLegacyProps['font-weight']

  return {
    mode: 'variable',
    props,
    resolvedAxes,
    fontVariationSettings: formatFontVariationSettings(resolvedAxes),
    derivedLegacyProps,
  }
}

/**
 * Extended CSS property keys in their CSS hyphen-case form.
 * Order matches declaration order in emitted output.
 */
const EXTENDED_CSS_PROPS = [
  'font-style',
  'font-stretch',
  'font-synthesis',
  'text-align',
  'word-spacing',
  'text-indent',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-thickness',
  'font-variant-ligatures',
  'font-variant-caps',
  'font-variant-numeric',
  'font-kerning',
  'font-optical-sizing',
  'font-feature-settings',
  'text-rendering',
] as const

type ExtendedCssPropKey = typeof EXTENDED_CSS_PROPS[number]

/**
 * Generates CSS custom properties and utility classes from typography presets and role mappings.
 *
 * INVARIANT: preset keys must be lowercase kebab-case ASCII (generated by `generatePresetKey`).
 * This function uses keys directly in CSS selectors (`.rt-preset-{key}`) and custom property
 * names (`--rt-preset-{key}-*`), so non-ASCII or special characters would break output.
 *
 * Scope:
 *   - Default `:root` — vars are global; utility classes are unscoped.
 *     Works for single-site pages (preview and published) but breaks when
 *     multiple sites share the same DOM (nested child sites) because
 *     `.rt-preset-{key}` rules are global and collide.
 *   - A custom wrapper selector (e.g. `[data-site-root="abc"]` or
 *     `.cms-preview-root`) — vars are scoped to that wrapper AND the
 *     utility classes are nested under it, so multiple sites can coexist
 *     without style collisions. Use this in multi-site/nested contexts.
 *
 * Variable fonts (Phase C):
 *   When `themeVariants` resolves a preset's fontFamily to a variable variant
 *   with declared axes, the emission includes `font-variation-settings` plus
 *   derived legacy properties (font-weight from `wght`, font-optical-sizing
 *   from `opsz`, etc.). For variable-font presets, the legacy DB fields
 *   (`fontWeight`, `fontStyle`) are ignored at emit time — values come from
 *   axes. The columns stay populated and re-engage automatically when the
 *   preset switches back to a static font. Default `themeVariants = []`
 *   preserves the static-font path byte-identical for callers that haven't
 *   been updated yet.
 */
export function buildTypographyStyles(
  presets: TypographySnapshotPreset[],
  roles: TypographySnapshotRoles,
  scope: string = ':root',
  themeVariants: ThemeVariant[] = [],
): string {
  if (presets.length === 0) return ''

  const parts: string[] = []
  const presetMap = new Map(presets.map(p => [p.key, p]))

  // Precompute variable emissions per preset key so we don't re-resolve
  // once for preset vars, once for the utility class, and once per role.
  const variableEmissions = new Map<string, VariablePresetEmission>()
  for (const preset of presets) {
    const emission = variableEmission(preset, themeVariants)
    if (emission) variableEmissions.set(preset.key, emission)
  }

  // 1. Preset CSS variables (scoped via the scope selector)
  const presetVars: string[] = []
  for (const preset of presets) {
    const props = presetToProps(preset)
    const ve = variableEmissions.get(preset.key)
    // Axes win over the legacy `fontWeight` column for variable presets.
    // Apply the axis-derived legacy properties AFTER computing `props` so
    // the font-weight override is explicit at the callsite.
    if (ve) {
      const derivedWeight = ve.legacy['font-weight']
      if (derivedWeight) props.weight = derivedWeight
    }
    presetVars.push(`  --rt-preset-${preset.key}-family: ${props.family};`)
    presetVars.push(`  --rt-preset-${preset.key}-size: ${props.size};`)
    presetVars.push(`  --rt-preset-${preset.key}-weight: ${props.weight};`)
    presetVars.push(`  --rt-preset-${preset.key}-line-height: ${props['line-height']};`)
    presetVars.push(`  --rt-preset-${preset.key}-letter-spacing: ${props['letter-spacing']};`)
    presetVars.push(`  --rt-preset-${preset.key}-text-transform: ${props['text-transform']};`)
    if (props.color) {
      presetVars.push(`  --rt-preset-${preset.key}-color: ${props.color};`)
    }
    for (const key of EXTENDED_CSS_PROPS) {
      const val = props[key as ExtendedCssPropKey]
      if (val != null) presetVars.push(`  --rt-preset-${preset.key}-${key}: ${val};`)
    }
    if (ve) {
      presetVars.push(`  --rt-preset-${preset.key}-font-variation-settings: ${ve.fontVariationSettings};`)
      for (const [prop, value] of Object.entries(ve.legacy)) {
        if (prop === 'font-weight') continue // already applied via props.weight
        presetVars.push(`  --rt-preset-${preset.key}-${prop}: ${value};`)
      }
    }
  }

  // 2. Role CSS variables
  const roleVars: string[] = []
  for (const [role, presetKey] of Object.entries(roles)) {
    if (!presetKey) continue
    const preset = presetMap.get(presetKey)
    if (!preset) continue

    const props = presetToProps(preset)
    const ve = variableEmissions.get(preset.key)
    // Roles inherit from their bound preset, so axes win for variable-font
    // presets here too. Apply derived weight override after computing props.
    if (ve) {
      const derivedWeight = ve.legacy['font-weight']
      if (derivedWeight) props.weight = derivedWeight
    }
    roleVars.push(`  --rt-role-${role}-family: ${props.family};`)
    roleVars.push(`  --rt-role-${role}-size: ${props.size};`)
    roleVars.push(`  --rt-role-${role}-weight: ${props.weight};`)
    roleVars.push(`  --rt-role-${role}-line-height: ${props['line-height']};`)
    roleVars.push(`  --rt-role-${role}-letter-spacing: ${props['letter-spacing']};`)
    roleVars.push(`  --rt-role-${role}-text-transform: ${props['text-transform']};`)
    if (props.color) {
      roleVars.push(`  --rt-role-${role}-color: ${props.color};`)
    }
    for (const key of EXTENDED_CSS_PROPS) {
      const val = props[key as ExtendedCssPropKey]
      if (val != null) roleVars.push(`  --rt-role-${role}-${key}: ${val};`)
    }
    if (ve) {
      roleVars.push(`  --rt-role-${role}-font-variation-settings: ${ve.fontVariationSettings};`)
      for (const [prop, value] of Object.entries(ve.legacy)) {
        if (prop === 'font-weight') continue // already applied via props.weight
        roleVars.push(`  --rt-role-${role}-${prop}: ${value};`)
      }
    }
  }

  if (presetVars.length > 0 || roleVars.length > 0) {
    parts.push(`${scope} {\n${[...presetVars, ...roleVars].join('\n')}\n}`)
  }

  // 3. Preset utility classes. When a non-root scope is provided, prefix
  //    the class selector with the scope so the declarations only apply
  //    inside that wrapper. This prevents class-rule collisions between
  //    nested sites that define the same preset key with different values.
  const classSelectorPrefix = scope === ':root' ? '' : `${scope} `
  for (const preset of presets) {
    const props = presetToProps(preset)
    const ve = variableEmissions.get(preset.key)
    // Axes win at the utility-class level too. Override `props.weight` AFTER
    // computing it so the precedence (legacy column → axis-derived) is
    // explicit at the callsite.
    if (ve) {
      const derivedWeight = ve.legacy['font-weight']
      if (derivedWeight) props.weight = derivedWeight
    }
    const declarations = [
      `  font-family: ${props.family};`,
      `  font-size: ${props.size};`,
      `  font-weight: ${props.weight};`,
      `  line-height: ${props['line-height']};`,
      `  letter-spacing: ${props['letter-spacing']};`,
      `  text-transform: ${props['text-transform']};`,
    ]
    if (props.color) {
      declarations.push(`  color: ${props.color};`)
    }
    for (const key of EXTENDED_CSS_PROPS) {
      const val = props[key as ExtendedCssPropKey]
      if (val != null) declarations.push(`  ${key}: ${val};`)
    }
    if (ve) {
      declarations.push(`  font-variation-settings: ${ve.fontVariationSettings};`)
      for (const [prop, value] of Object.entries(ve.legacy)) {
        if (prop === 'font-weight') continue // already applied via props.weight
        declarations.push(`  ${prop}: ${value};`)
      }
    }
    parts.push(`${classSelectorPrefix}.rt-preset-${preset.key} {\n${declarations.join('\n')}\n}`)
  }

  return parts.join('\n\n')
}
