// shared/features/cms/section-layouts/engine/resolveLayout.ts
//
// The generic section layout engine, as pure functions.
//
//   cloneLayout      schema `layout` block  → mutable draft
//   applyLayoutBindings   draft + settings + authored config → patched draft
//   resolveLayoutTier     tiers + viewport width → active tier
//   resolveSectionLayout  patched draft + tier → flat, already-resolved CSS
//   *Style                resolved CSS → inline style objects
//
// Nothing here touches the DOM, Vue or the viewport: `SchemaSectionLayout.vue`
// is a thin wrapper that feeds this module a width and renders what comes back.
// Contract: docs/architecture/section-layout-engine-contract.md.

import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'
import {
  LAYERED_COLLAPSE_MODES,
  LAYERED_DEFAULT_DESIGN_WIDTH,
  LAYERED_HEIGHTS,
  LAYOUT_GRID_BIND_TARGETS,
  LAYOUT_SLOT_BIND_FIELDS,
  LAYOUT_ZONE_BIND_FIELDS,
  SLOT_FLOW_MODES,
  SPACING_TIERS,
} from '~/shared/types/sectionTypes'
import type {
  CarouselFlowOptions,
  ColumnarFlowOptions,
  LayeredCollapseMode,
  LayeredFlowOptions,
  LayeredHeight,
  LayoutBinding,
  LayoutBoundOption,
  LayoutBoundValue,
  LayoutGridBindTarget,
  LayoutGridLines,
  LayoutOffset,
  LayoutResolverId,
  LayoutSlotBindField,
  LayoutSlotDefinition,
  LayoutTierDefinition,
  LayoutTierId,
  LayoutZoneBindField,
  PlaceableRole,
  ResolvedFlowOptions,
  ResolvedLayoutItem,
  ResolvedLayoutSlot,
  ResolvedSectionLayout,
  SectionLayoutDefinition,
  SectionPresetDefinition,
  SectionTypeSchemaV2,
  SlotFlowMode,
  SlotStickyConfig,
  SpacingTier,
  StackFlowOptions,
  StripFlowOptions,
  StripPattern,
} from '~/shared/types/sectionTypes'
import type { BindingContext, LayoutDraft, SchemaSetting, SlotDraft, ZoneDraft } from './types'

/** The unroled bucket `DynamicPage.buildBlocksByRole()` produces (contract §3.3). */
export const UNROLED_ROLE = '_default'

/** Fallbacks for a tier that declares no track list, and for a degraded tier-less schema. */
export const DEFAULT_COLUMN_TRACKS = 'minmax(0, 1fr)'
export const DEFAULT_ROW_TRACKS = 'auto'
export const DEFAULT_PLACE_ITEMS = 'start stretch'
export const DEFAULT_PLACE_SELF = 'start stretch'

function warn(ctx: BindingContext, message: string): void {
  if (ctx.onWarn) {
    ctx.onWarn(message)
    return
  }
  console.warn(`[layoutEngine] ${message}`)
}

// ---------------------------------------------------------------------------
// Value guards
//
// Authored values arrive from the database and end up in an inline `style`
// attribute. Every one of them is narrowed here before it is written, and a
// value that fails its guard is dropped rather than coerced (contract §8.14).
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isSpacingTier(value: unknown): value is SpacingTier {
  return SPACING_TIERS.some(tier => tier === value)
}

function isSlotFlowMode(value: unknown): value is SlotFlowMode {
  return SLOT_FLOW_MODES.some(mode => mode === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSticky(value: unknown): value is SlotStickyConfig {
  return isRecord(value) && isString(value.top) && isStringArray(value.tiers)
}

function isOffset(value: unknown): value is LayoutOffset {
  return isRecord(value) && isString(value.x) && isString(value.y)
}

function isGridLines(value: unknown): value is LayoutGridLines {
  return isRecord(value) && isString(value.column) && isString(value.row)
}

// ---------------------------------------------------------------------------
// Tier resolution (contract §4)
// ---------------------------------------------------------------------------

/**
 * The active tier: the first declared tier whose `minWidth` is `null` or whose
 * breakpoint is STRICTLY less than the viewport width.
 *
 * Strictly-greater is load-bearing. `isMobileViewport()` treats 768px as mobile
 * (`<=`), so a tier gated at `md` must NOT activate at exactly 768px or every
 * existing section changes behaviour on iPad portrait.
 *
 * Never throws (contract §8.16): a schema with no usable tier falls back to the
 * last declared tier, and a genuinely empty `tiers` array yields `null`, which
 * `resolveSectionLayout` renders as a single implicit column.
 */
export function resolveLayoutTier(
  tiers: readonly LayoutTierDefinition[],
  viewportWidth: number,
): LayoutTierId | null {
  for (const tier of tiers) {
    if (tier.minWidth === null) return tier.id
    const breakpoint: number | undefined = BREAKPOINTS[tier.minWidth]
    if (breakpoint !== undefined && viewportWidth > breakpoint) return tier.id
  }
  return tiers.length > 0 ? tiers[tiers.length - 1]!.id : null
}

/** The floor tier — the one declaring `minWidth: null`. Drives the `data-collapse` value. */
export function floorTierId(tiers: readonly LayoutTierDefinition[]): LayoutTierId | null {
  for (const tier of tiers) {
    if (tier.minWidth === null) return tier.id
  }
  return null
}

// ---------------------------------------------------------------------------
// Draft construction
// ---------------------------------------------------------------------------

function cloneZone(zone: {
  flow: SlotFlowMode
  gap: SpacingTier
  placeSelf?: string
  sticky?: SlotStickyConfig | null
  offset?: LayoutOffset
  zIndex?: number
  hiddenIn?: readonly LayoutTierId[]
}): ZoneDraft {
  return {
    flow: zone.flow,
    gap: zone.gap,
    placeSelf: zone.placeSelf ?? DEFAULT_PLACE_SELF,
    sticky: zone.sticky ? { top: zone.sticky.top, tiers: [...zone.sticky.tiers] } : null,
    offset: zone.offset ? { x: zone.offset.x, y: zone.offset.y } : null,
    zIndex: zone.zIndex ?? null,
    hiddenIn: [...(zone.hiddenIn ?? [])],
  }
}

function cloneSlot(slot: LayoutSlotDefinition): SlotDraft {
  const placed = 'place' in slot && isGridLines(slot.place)
  return {
    role: slot.role,
    zone: 'zone' in slot && isString(slot.zone) ? slot.zone : null,
    place: placed && isGridLines(slot.place) ? { column: slot.place.column, row: slot.place.row } : null,
    flow: slot.flow,
    flowOptions: { ...slot.flowOptions },
    placeSelf: 'placeSelf' in slot && isString(slot.placeSelf) ? slot.placeSelf : null,
    sticky: 'sticky' in slot && isSticky(slot.sticky) ? { top: slot.sticky.top, tiers: [...slot.sticky.tiers] } : null,
    offset: 'offset' in slot && isOffset(slot.offset) ? { x: slot.offset.x, y: slot.offset.y } : null,
    zIndex: 'zIndex' in slot && isFiniteNumber(slot.zIndex) ? slot.zIndex : null,
    hiddenIn: [...(slot.hiddenIn ?? [])],
  }
}

/** Mutable copy of a schema's `layout` block, with every optional field normalised. */
export function cloneLayout(layout: SectionLayoutDefinition): LayoutDraft {
  const areas: Record<LayoutTierId, string[]> = {}
  for (const [tier, rows] of Object.entries(layout.areas ?? {})) {
    areas[tier] = [...rows]
  }

  const zones: Record<string, ZoneDraft> = {}
  const zoneOrder: string[] = []
  for (const [name, zone] of Object.entries(layout.zones ?? {})) {
    zoneOrder.push(name)
    zones[name] = cloneZone(zone)
  }

  return {
    engine: layout.engine,
    tiers: layout.tiers.map(tier => ({ id: tier.id, minWidth: tier.minWidth })),
    areas,
    columns: { ...layout.columns },
    rows: { ...layout.rows },
    gap: { row: layout.gap.row, column: layout.gap.column },
    placeItems: layout.placeItems ?? DEFAULT_PLACE_ITEMS,
    minHeight: layout.minHeight ?? null,
    zoneOrder,
    zones,
    slots: layout.slots.map(cloneSlot),
  }
}

// ---------------------------------------------------------------------------
// Bind targets
// ---------------------------------------------------------------------------

type ParsedTarget =
  | { kind: 'grid'; field: LayoutGridBindTarget }
  | { kind: 'zone'; zone: string; field: LayoutZoneBindField }
  | { kind: 'slot'; role: string; field: LayoutSlotBindField }
  | { kind: 'slotFlowOption'; role: string; key: string }
  | { kind: 'unknown' }

function isGridTarget(value: string): value is LayoutGridBindTarget {
  return LAYOUT_GRID_BIND_TARGETS.some(target => target === value)
}

function isZoneField(value: string): value is LayoutZoneBindField {
  return LAYOUT_ZONE_BIND_FIELDS.some(field => field === value)
}

function isSlotField(value: string): value is LayoutSlotBindField {
  return LAYOUT_SLOT_BIND_FIELDS.some(field => field === value)
}

/** The closed target union as a parser — a typo yields `unknown` and the patch is dropped. */
export function parseBindTarget(target: string): ParsedTarget {
  if (isGridTarget(target)) return { kind: 'grid', field: target }

  const parts = target.split('.')
  if (parts.length === 3 && parts[0] === 'zone' && parts[1] && parts[2] && isZoneField(parts[2])) {
    return { kind: 'zone', zone: parts[1], field: parts[2] }
  }
  if (parts.length === 3 && parts[0] === 'slot' && parts[1] && parts[2] && isSlotField(parts[2])) {
    return { kind: 'slot', role: parts[1], field: parts[2] }
  }
  if (parts.length === 4 && parts[0] === 'slot' && parts[1] && parts[2] === 'flowOptions' && parts[3]) {
    return { kind: 'slotFlowOption', role: parts[1], key: parts[3] }
  }
  return { kind: 'unknown' }
}

/**
 * Targets stored per tier. Everything else is a single value, so a binding that
 * names a tier for one of those applies only while that tier is the active one.
 */
function isTierMappedTarget(target: string): boolean {
  return target === 'columns' || target === 'rows' || target === 'areas'
}

// ---------------------------------------------------------------------------
// Binding application
// ---------------------------------------------------------------------------

function tierIdsFor(draft: LayoutDraft, binding: LayoutBinding): LayoutTierId[] {
  if (binding.tier !== undefined) return [binding.tier]
  return draft.tiers.map(tier => tier.id)
}

function applyGridBinding(
  draft: LayoutDraft,
  binding: LayoutBinding,
  field: LayoutGridBindTarget,
  value: LayoutBoundValue,
  ctx: BindingContext,
): void {
  switch (field) {
    case 'columns':
    case 'rows': {
      if (!isString(value)) return warn(ctx, `${field} expects a track list string, got ${typeof value}`)
      for (const tier of tierIdsFor(draft, binding)) {
        draft[field][tier] = value
      }
      return
    }
    case 'areas': {
      if (!isStringArray(value)) return warn(ctx, 'areas expects an array of row strings')
      for (const tier of tierIdsFor(draft, binding)) {
        draft.areas[tier] = [...value]
      }
      return
    }
    case 'gap.row':
    case 'gap.column': {
      if (!isSpacingTier(value)) return warn(ctx, `${field} expects a spacing tier, got "${String(value)}"`)
      if (field === 'gap.row') draft.gap.row = value
      else draft.gap.column = value
      return
    }
    case 'placeItems': {
      if (!isString(value)) return warn(ctx, 'placeItems expects a place-items shorthand')
      draft.placeItems = value
      return
    }
    case 'minHeight': {
      if (!isString(value)) return warn(ctx, 'minHeight expects a length string')
      draft.minHeight = value
      return
    }
    default: {
      const exhaustive: never = field
      return warn(ctx, `unhandled grid target ${String(exhaustive)}`)
    }
  }
}

function applyZoneBinding(
  zone: ZoneDraft,
  field: LayoutZoneBindField,
  value: LayoutBoundValue,
  ctx: BindingContext,
): void {
  switch (field) {
    case 'flow':
      if (!isSlotFlowMode(value)) return warn(ctx, `zone flow expects a slot flow mode, got "${String(value)}"`)
      zone.flow = value
      return
    case 'gap':
      if (!isSpacingTier(value)) return warn(ctx, `zone gap expects a spacing tier, got "${String(value)}"`)
      zone.gap = value
      return
    case 'placeSelf':
      if (!isString(value)) return warn(ctx, 'zone placeSelf expects a place-self shorthand')
      zone.placeSelf = value
      return
    case 'sticky':
      if (value !== null && !isSticky(value)) return warn(ctx, 'zone sticky expects { top, tiers } or null')
      zone.sticky = value === null ? null : { top: value.top, tiers: [...value.tiers] }
      return
    case 'offset':
      if (!isOffset(value)) return warn(ctx, 'zone offset expects { x, y }')
      zone.offset = { x: value.x, y: value.y }
      return
    case 'zIndex':
      if (!isFiniteNumber(value)) return warn(ctx, 'zone zIndex expects a number')
      zone.zIndex = value
      return
    case 'hiddenIn':
      if (!isStringArray(value)) return warn(ctx, 'zone hiddenIn expects an array of tier ids')
      zone.hiddenIn = [...value]
      return
    default: {
      const exhaustive: never = field
      return warn(ctx, `unhandled zone field ${String(exhaustive)}`)
    }
  }
}

function applySlotBinding(
  slot: SlotDraft,
  field: LayoutSlotBindField,
  value: LayoutBoundValue,
  ctx: BindingContext,
): void {
  switch (field) {
    case 'zone':
      if (!isString(value)) return warn(ctx, 'slot zone expects a zone name')
      slot.zone = value
      slot.place = null
      return
    case 'flow':
      if (!isSlotFlowMode(value)) return warn(ctx, `slot flow expects a slot flow mode, got "${String(value)}"`)
      slot.flow = value
      return
    case 'placeSelf':
      if (!isString(value)) return warn(ctx, 'slot placeSelf expects a place-self shorthand')
      slot.placeSelf = value
      return
    case 'sticky':
      if (value !== null && !isSticky(value)) return warn(ctx, 'slot sticky expects { top, tiers } or null')
      slot.sticky = value === null ? null : { top: value.top, tiers: [...value.tiers] }
      return
    case 'offset':
      if (!isOffset(value)) return warn(ctx, 'slot offset expects { x, y }')
      slot.offset = { x: value.x, y: value.y }
      return
    case 'zIndex':
      if (!isFiniteNumber(value)) return warn(ctx, 'slot zIndex expects a number')
      slot.zIndex = value
      return
    case 'hiddenIn':
      if (!isStringArray(value)) return warn(ctx, 'slot hiddenIn expects an array of tier ids')
      slot.hiddenIn = [...value]
      return
    default: {
      const exhaustive: never = field
      return warn(ctx, `unhandled slot field ${String(exhaustive)}`)
    }
  }
}

function applyBinding(
  draft: LayoutDraft,
  binding: LayoutBinding,
  value: LayoutBoundValue,
  ctx: BindingContext,
): void {
  // A tier-scoped binding on a target that is NOT stored per tier applies only
  // while that tier is active. Gallery's column count is the live case: it binds
  // `tier: "full"` so the floor tier keeps its own single-column flow.
  if (binding.tier !== undefined && !isTierMappedTarget(binding.target) && binding.tier !== ctx.activeTier) {
    return
  }

  const parsed = parseBindTarget(binding.target)
  switch (parsed.kind) {
    case 'grid':
      return applyGridBinding(draft, binding, parsed.field, value, ctx)
    case 'zone': {
      const zone = draft.zones[parsed.zone]
      if (!zone) return warn(ctx, `binding targets undeclared zone "${parsed.zone}"`)
      return applyZoneBinding(zone, parsed.field, value, ctx)
    }
    case 'slot': {
      const slot = draft.slots.find(candidate => candidate.role === parsed.role)
      if (!slot) return warn(ctx, `binding targets undeclared slot "${parsed.role}"`)
      return applySlotBinding(slot, parsed.field, value, ctx)
    }
    case 'slotFlowOption': {
      const slot = draft.slots.find(candidate => candidate.role === parsed.role)
      if (!slot) return warn(ctx, `binding targets undeclared slot "${parsed.role}"`)
      if (!isString(value) && !isFiniteNumber(value) && !isBoolean(value)) {
        return warn(ctx, `flowOptions.${parsed.key} expects a string, number or boolean`)
      }
      slot.flowOptions[parsed.key] = value
      return
    }
    case 'unknown':
      return warn(ctx, `unknown layoutBind target "${binding.target}"`)
    default: {
      const exhaustive: never = parsed
      return warn(ctx, `unhandled target kind ${String(exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Value sources: options, toggles, resolvers
// ---------------------------------------------------------------------------

function boundOptions(setting: SchemaSetting): LayoutBoundOption[] {
  const options = setting.options ?? []
  const out: LayoutBoundOption[] = []
  for (const option of options) {
    if (!isString(option.value) || !isString(option.label)) continue
    out.push(option)
  }
  return out
}

/**
 * `alternate-by-index` — the one engine-owned resolver (contract §3.6).
 *
 * A section whose `shellSide` is "alternate" cannot carry a static value: the
 * answer depends on its index among its same-type siblings. The resolver picks
 * from the setting's OWN value-carrying options, default first so index 0
 * reproduces the unalternated default, then declaration order. With
 * editorial-split's two candidates (right = default, left) that is exactly
 * today's "even → right, odd → left".
 */
function resolveAlternateByIndex(
  setting: SchemaSetting,
  ctx: BindingContext,
): Readonly<Record<string, LayoutBoundValue>> | null {
  const candidates = boundOptions(setting).filter(option => option.layoutValues !== undefined)
  const ordered = [
    ...candidates.filter(option => option.value === setting.default),
    ...candidates.filter(option => option.value !== setting.default),
  ]
  if (ordered.length === 0) {
    warn(ctx, `resolver alternate-by-index on "${setting.id}" has no option carrying layoutValues`)
    return null
  }
  const index = Number.isFinite(ctx.sectionIndex) ? Math.abs(Math.trunc(ctx.sectionIndex)) : 0
  return ordered[index % ordered.length]!.layoutValues ?? null
}

function runResolver(
  resolver: LayoutResolverId,
  setting: SchemaSetting,
  ctx: BindingContext,
): Readonly<Record<string, LayoutBoundValue>> | null {
  switch (resolver) {
    case 'alternate-by-index':
      return resolveAlternateByIndex(setting, ctx)
    default: {
      const exhaustive: never = resolver
      warn(ctx, `unknown layoutResolver "${String(exhaustive)}"`)
      return null
    }
  }
}

/**
 * The values one setting contributes, keyed by bind target.
 *
 * An authored value that matches no declared option falls back to the setting's
 * default and is logged — it is never interpolated into a style (contract §8.14).
 */
export function resolveBoundValues(
  setting: SchemaSetting,
  authored: unknown,
  ctx: BindingContext,
): Readonly<Record<string, LayoutBoundValue>> | null {
  if (setting.type === 'toggle') {
    const on = isBoolean(authored) ? authored : setting.default === true
    return (on ? setting.layoutValue : setting.layoutValueOff) ?? null
  }

  const options = boundOptions(setting)
  let option = isString(authored) ? options.find(candidate => candidate.value === authored) : undefined

  if (!option) {
    if (authored !== undefined && authored !== null) {
      warn(ctx, `"${setting.id}" has unknown stored value "${String(authored)}" — falling back to default`)
    }
    option = options.find(candidate => candidate.value === setting.default)
  }
  if (!option) return null

  if (option.layoutResolver !== undefined) return runResolver(option.layoutResolver, setting, ctx)
  return option.layoutValues ?? null
}

/**
 * Every setting's effective value — authored where present, declared default
 * otherwise. The input a visibility guard is evaluated against.
 */
function effectiveSettingValues(
  settings: readonly SchemaSetting[],
  layoutConfig: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const setting of settings) {
    values[setting.id] = layoutConfig[setting.id] ?? setting.default
  }
  return values
}

/**
 * Whether a setting's visibility guard passes.
 *
 * Contract §8.8 permits two settings to share one bind target as long as their
 * guards are disjoint — gallery's `columns` (grid / masonry / strip) and
 * `carouselColumns` (carousel) are the live case. That permission is only sound
 * if the engine actually evaluates the guard: applied unconditionally, the
 * later-declared setting would overwrite the earlier one with its own default,
 * so choosing a 4-column grid would silently render 3.
 *
 * Two shapes, both already in the schemas: the implicit-AND `showIf` map
 * (array = one-of, boolean = truthiness) and the older single-field
 * `conditional: { field, value }`. Both must pass; an absent guard passes.
 */
export function settingApplies(
  setting: SchemaSetting,
  values: Record<string, unknown>,
): boolean {
  const conditional = setting.conditional
  if (conditional && isString(conditional.field)) {
    if (!matchesGuard(values[conditional.field], conditional.value)) return false
  }

  const showIf = setting.showIf
  if (isRecord(showIf)) {
    for (const [id, expected] of Object.entries(showIf)) {
      if (!matchesGuard(values[id], expected)) return false
    }
  }
  return true
}

function matchesGuard(current: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return expected.includes(current)
  if (typeof expected === 'boolean') return Boolean(current) === expected
  return current === expected
}

/**
 * Patch a draft with every `layoutBind` setting the schema declares.
 *
 * Settings are applied in declaration order; a `layoutConfig` key no setting
 * declares is ignored rather than fatal (contract §8.15), and a setting whose
 * visibility guard does not pass contributes nothing.
 */
export function applyLayoutBindings(
  draft: LayoutDraft,
  settings: readonly SchemaSetting[],
  layoutConfig: Record<string, unknown>,
  ctx: BindingContext,
): LayoutDraft {
  const guardValues = effectiveSettingValues(settings, layoutConfig)

  for (const setting of settings) {
    const bindings = setting.layoutBind
    if (!bindings || bindings.length === 0) continue
    if (!settingApplies(setting, guardValues)) continue

    const values = resolveBoundValues(setting, layoutConfig[setting.id], ctx)
    if (!values) continue

    for (const binding of bindings) {
      const value = values[binding.target]
      if (value === undefined) continue
      applyBinding(draft, binding, value, ctx)
    }
  }
  return draft
}

// ---------------------------------------------------------------------------
// Presets (2026-09 composition unification, C2)
// ---------------------------------------------------------------------------

/** The `layoutConfig` key naming the active preset. */
export const PRESET_CONFIG_KEY = 'layoutPreset'

/** The tier-scoped trio a preset value key may scope: `areas.full`, `columns.stack`, ... */
function isTierMappedField(field: string): field is 'columns' | 'rows' | 'areas' {
  return field === 'columns' || field === 'rows' || field === 'areas'
}

/**
 * Parse one preset `values` key into a `LayoutBinding`.
 *
 * Grammar: the same targets `layoutBind` accepts, plus a tier suffix on the
 * per-tier trio (`areas.full`). A key the engine cannot parse yields `null`
 * and is reported through the binding warn channel rather than crashing the
 * section — the generate-time lint (`scripts/lint-section-layouts.mjs`) is
 * the build-time gate for the same grammar.
 */
export function parsePresetTarget(key: string): LayoutBinding | null {
  const dot = key.indexOf('.')
  if (dot > 0) {
    const field = key.slice(0, dot)
    const rest = key.slice(dot + 1)
    if (isTierMappedField(field) && /^[a-z0-9-]+$/i.test(rest)) {
      return { target: field, tier: rest }
    }
  }
  // A plain grid target with no suffix must be one of the closed set; anything
  // else (zone./slot. paths) flows through `parseBindTarget`, which has already
  // validated the shape — rebuild the target from its parsed parts so the
  // `LayoutBindTarget` template types hold without an assertion.
  const parsed = parseBindTarget(key)
  switch (parsed.kind) {
    case 'grid':
      return parsed.field === key ? { target: key } : null
    case 'zone':
      return { target: `zone.${parsed.zone}.${parsed.field}` }
    case 'slot':
      return { target: `slot.${parsed.role}.${parsed.field}` }
    case 'slotFlowOption':
      return { target: `slot.${parsed.role}.flowOptions.${parsed.key}` }
    case 'unknown':
      return null
  }
}

/**
 * Patch a draft with a preset's values, BEFORE authored settings run — so a
 * section setting always wins over the preset it sits on.
 */
export function applyPreset(
  draft: LayoutDraft,
  preset: SectionPresetDefinition,
  ctx: BindingContext,
): LayoutDraft {
  for (const [key, value] of Object.entries(preset.values)) {
    const binding = parsePresetTarget(key)
    if (!binding) {
      warn(ctx, `preset "${preset.id}" declares unparseable target "${key}" — dropped`)
      continue
    }
    applyBinding(draft, binding, value, ctx)
  }
  return draft
}

/** The schema's preset for one authored preset id, or `null` (base layout only). */
export function presetById(
  schema: Pick<SectionTypeSchemaV2, 'presets'>,
  presetId: unknown,
): SectionPresetDefinition | null {
  if (typeof presetId !== 'string' || presetId.length === 0) return null
  return schema.presets?.find(preset => preset.id === presetId) ?? null
}

// ---------------------------------------------------------------------------
// Geometry resolution
// ---------------------------------------------------------------------------

/** Spacing tier → the CSS var the theme's `spacingTokens.sectionGap` group defines. */
export function gapToken(tier: SpacingTier): string {
  return `var(--section-gap-${tier})`
}

/**
 * The same tiers as a number of rem.
 *
 * A CSS var is enough everywhere except one place: the carousel's item basis is
 * `calc(<pct>% - <gapShare>rem)`, and the share has to be *computed* from the
 * gap and the item count, which arithmetic on an opaque `var()` cannot do
 * (GallerySectionLayout.vue:80-86 did the same sum against its own rem map).
 *
 * Mirrors `sectionGapTokens.scss` and `themes/*\/theme.json`'s
 * `spacingTokens.sectionGap`; the flow suite pins the two together.
 */
const GAP_REM: Record<SpacingTier, number> = { none: 0, sm: 0.5, md: 1.5, lg: 3, xl: 4.8 }

export function gapRem(tier: SpacingTier): number {
  return GAP_REM[tier]
}

/**
 * Column count for the active collapse state.
 *
 * Legacy capped every columnar gallery mode at two tracks on mobile
 * (`GallerySectionLayout.vue:519-525`, `repeat(min(var(--gallery-columns), 2), 1fr)`).
 * The cap is a structural collapse decision, so it lives here rather than in a
 * `@media` — CSS only ever sees the resolved number.
 */
export function effectiveColumns(columns: number, collapse: 'stack' | 'flow'): number {
  return collapse === 'stack' ? Math.min(columns, 2) : columns
}

/** Which items a strip pattern promotes to a two-track span (GallerySectionLayout.vue:34-41). */
export function isStripLargeItem(index: number, pattern: StripPattern): boolean {
  switch (pattern) {
    case 'first':
      return index === 0
    case 'alternating':
      return index % 2 === 0
    case 'every-third':
      return index % 3 === 0
    default: {
      const exhaustive: never = pattern
      throw new Error(`[layoutEngine] unhandled strip pattern "${String(exhaustive)}"`)
    }
  }
}

/**
 * Items visible in one carousel page.
 *
 * Ground truth `GallerySectionLayout.vue:57-63`. Three steps, not two: the
 * middle one keeps a 900px tablet at two items instead of the desktop count,
 * which is why this reads the raw viewport width rather than the layout tier.
 */
export function carouselItemsPerPage(columns: number, viewportWidth: number): number {
  const desktop = Math.max(1, Math.min(4, Math.trunc(columns) || 3))
  if (viewportWidth <= BREAKPOINTS.sm) return 1
  if (viewportWidth <= BREAKPOINTS.lg) return Math.min(desktop, 2)
  return desktop
}

/**
 * Autoplay period in milliseconds, clamped to 3–10s.
 *
 * `interval` is the one gallery setting that cannot bind (a `number` has no
 * option list to validate a stored value against, contract §3.6), so the raw
 * `layoutConfig` value arrives here as `unknown` and is narrowed before use.
 */
export function carouselInterval(authored: unknown, fallback: number): number {
  const raw = isFiniteNumber(authored) ? authored : fallback
  return Math.max(3, Math.min(10, raw || 5)) * 1000
}

/**
 * `position: sticky` needs `align-self: start`. A stretched grid item is already
 * full height, so sticky never fires on one — the single most common way a
 * sticky sidebar silently does nothing. Engine-enforced, not left to the schema.
 */
function forceStartAlign(placeSelf: string): string {
  const parts = placeSelf.trim().split(/\s+/)
  if (parts.length === 0) return 'start'
  return ['start', ...parts.slice(1)].join(' ')
}

/**
 * `grid-area` from line-based placement.
 *
 * `{ row: "1 / -1", column: "1 / -1" }` → `1 / 1 / -1 / -1`, CSS's
 * row-start / column-start / row-end / column-end order. A single-value line
 * ("span 2") gets an `auto` end.
 */
function gridAreaFromLines(lines: LayoutGridLines): string {
  const [rowStart, rowEnd] = splitLine(lines.row)
  const [columnStart, columnEnd] = splitLine(lines.column)
  return `${rowStart} / ${columnStart} / ${rowEnd} / ${columnEnd}`
}

function splitLine(line: string): [string, string] {
  const parts = line.split('/').map(part => part.trim()).filter(part => part.length > 0)
  if (parts.length === 0) return ['auto', 'auto']
  if (parts.length === 1) return [parts[0]!, 'auto']
  return [parts[0]!, parts[1]!]
}

interface GridItemInput {
  gridArea: string
  placeSelf: string
  sticky: SlotStickyConfig | null
  offset: LayoutOffset | null
  zIndex: number | null
  hiddenIn: readonly LayoutTierId[]
}

function resolveGridItem(input: GridItemInput, tier: LayoutTierId | null): ResolvedLayoutItem {
  const stickyActive = input.sticky !== null && tier !== null && input.sticky.tiers.includes(tier)
  return {
    gridArea: input.gridArea,
    placeSelf: stickyActive ? forceStartAlign(input.placeSelf) : input.placeSelf,
    position: stickyActive ? 'sticky' : 'static',
    top: stickyActive && input.sticky ? `calc(var(--header-height, 0px) + ${input.sticky.top})` : null,
    transform: input.offset ? `translate(${input.offset.x}, ${input.offset.y})` : null,
    zIndex: input.zIndex,
    rendered: tier === null || !input.hiddenIn.includes(tier),
  }
}

function readSpacingTier(raw: LayoutBoundValue | undefined, fallback: SpacingTier): SpacingTier {
  return isSpacingTier(raw) ? raw : fallback
}

function readColumns(raw: LayoutBoundValue | undefined, fallback: number): number {
  if (isFiniteNumber(raw)) return Math.max(1, Math.trunc(raw))
  if (isString(raw)) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return fallback
}

function readBoolean(raw: LayoutBoundValue | undefined, fallback: boolean): boolean {
  return isBoolean(raw) ? raw : fallback
}

function readStripPattern(raw: LayoutBoundValue | undefined): StripPattern {
  if (raw === 'first' || raw === 'every-third' || raw === 'alternating') return raw
  return 'every-third'
}

function readLayeredHeight(raw: LayoutBoundValue | undefined): LayeredHeight {
  return LAYERED_HEIGHTS.find(height => height === raw) ?? 'ratio-16x9'
}

/**
 * The mobile fallback a layered slot declares.
 *
 * The schema lint refuses a layered slot that declares none, so reaching the
 * fallback here means a hand-edited `layoutConfig` or a bound value that named
 * nothing. `stack` is the safe answer: a scaled zone whose designWidth nobody
 * vouched for can shrink content past legibility, a stacked one cannot.
 */
function readLayeredCollapse(raw: LayoutBoundValue | undefined): LayeredCollapseMode {
  return LAYERED_COLLAPSE_MODES.find(mode => mode === raw) ?? 'stack'
}

function readDesignWidth(raw: LayoutBoundValue | undefined): number {
  const parsed = isFiniteNumber(raw) ? raw : Number.parseInt(isString(raw) ? raw : '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LAYERED_DEFAULT_DESIGN_WIDTH
}

/**
 * Flow options, narrowed per mode.
 *
 * `flowOptions` is an open bag on the draft because a `layoutBind` may patch one
 * key of it; this is where it becomes the discriminated shape the flow renderer
 * consumes, with a default for anything the schema left out.
 */
export function resolveFlowOptions(
  flow: SlotFlowMode,
  raw: Record<string, LayoutBoundValue>,
): ResolvedFlowOptions {
  const gap = readSpacingTier(raw.gap, 'md')
  switch (flow) {
    case 'stack':
      return { gap }
    case 'layered':
      return {
        gap,
        height: readLayeredHeight(raw.height),
        collapse: readLayeredCollapse(raw.collapse),
        designWidth: readDesignWidth(raw.designWidth),
      }
    case 'grid':
    case 'masonry':
      return { gap, columns: readColumns(raw.columns, 3) }
    case 'strip':
      return { gap, columns: readColumns(raw.columns, 3), pattern: readStripPattern(raw.pattern) }
    case 'carousel':
      return {
        gap,
        columns: readColumns(raw.columns, 3),
        autoplay: readBoolean(raw.autoplay, false),
        interval: isFiniteNumber(raw.interval) ? raw.interval : 5,
        showDots: readBoolean(raw.showDots, true),
        showArrows: readBoolean(raw.showArrows, true),
      }
    default: {
      const exhaustive: never = flow
      throw new Error(`[layoutEngine] unhandled slot flow "${String(exhaustive)}"`)
    }
  }
}

/** Flat, already-resolved CSS for one section at one tier. */
export function resolveSectionLayout(
  draft: LayoutDraft,
  tier: LayoutTierId | null,
): ResolvedSectionLayout {
  const floor = floorTierId(draft.tiers)
  const areaRows = tier !== null ? draft.areas[tier] : undefined

  const zones: Record<string, ResolvedLayoutItem> = {}
  for (const name of draft.zoneOrder) {
    const zone = draft.zones[name]
    if (!zone) continue
    zones[name] = resolveGridItem(
      {
        // A tier that declares no `areas` places its zones in declaration order
        // in the implicit grid, so the item claims no named area.
        gridArea: areaRows && areaRows.length > 0 ? name : 'auto',
        placeSelf: zone.placeSelf,
        sticky: zone.sticky,
        offset: zone.offset,
        zIndex: zone.zIndex,
        hiddenIn: zone.hiddenIn,
      },
      tier,
    )
  }

  const slots: ResolvedLayoutSlot[] = draft.slots.map(slot => {
    const hiddenAtTier = tier !== null && slot.hiddenIn.includes(tier)
    const zoneRendered = slot.zone === null ? true : (zones[slot.zone]?.rendered ?? false)
    return {
      role: slot.role,
      zone: slot.zone,
      flow: slot.flow,
      flowOptions: resolveFlowOptions(slot.flow, slot.flowOptions),
      rendered: !hiddenAtTier && zoneRendered,
      item: slot.place
        ? resolveGridItem(
          {
            gridArea: gridAreaFromLines(slot.place),
            placeSelf: slot.placeSelf ?? DEFAULT_PLACE_SELF,
            sticky: slot.sticky,
            offset: slot.offset,
            zIndex: slot.zIndex,
            hiddenIn: slot.hiddenIn,
          },
          tier,
        )
        : null,
    }
  })

  return {
    tier: tier ?? '',
    collapse: tier === null || tier === floor ? 'stack' : 'flow',
    gridTemplateAreas: areaRows && areaRows.length > 0 ? areaRows.map(row => `"${row}"`).join(' ') : null,
    gridTemplateColumns: (tier !== null ? draft.columns[tier] : undefined) ?? DEFAULT_COLUMN_TRACKS,
    gridTemplateRows: (tier !== null ? draft.rows[tier] : undefined) ?? DEFAULT_ROW_TRACKS,
    rowGap: gapToken(draft.gap.row),
    columnGap: gapToken(draft.gap.column),
    placeItems: draft.placeItems,
    minHeight: draft.minHeight,
    zones,
    slots,
  }
}

// ---------------------------------------------------------------------------
// Inline style objects
//
// Inline style is intentional (contract §4.4): it wins specificity, it reads
// back as `element.style.gridTemplateColumns` under happy-dom, and it means a
// new section type ships zero bytes of CSS.
// ---------------------------------------------------------------------------

export function sectionRootStyle(resolved: ResolvedSectionLayout): Record<string, string> {
  const style: Record<string, string> = {
    display: 'grid',
    gridTemplateColumns: resolved.gridTemplateColumns,
    gridTemplateRows: resolved.gridTemplateRows,
    rowGap: resolved.rowGap,
    columnGap: resolved.columnGap,
    placeItems: resolved.placeItems,
  }
  if (resolved.gridTemplateAreas !== null) style.gridTemplateAreas = resolved.gridTemplateAreas
  if (resolved.minHeight !== null) style.minHeight = resolved.minHeight
  return style
}

export function gridItemStyle(item: ResolvedLayoutItem): Record<string, string> {
  const style: Record<string, string> = {
    gridArea: item.gridArea,
    placeSelf: item.placeSelf,
    position: item.position,
  }
  if (item.top !== null) style.top = item.top
  if (item.transform !== null) style.transform = item.transform
  if (item.zIndex !== null) style.zIndex = String(item.zIndex)
  return style
}

/**
 * Geometry for one slot root — how its blocks flow inside it (or, for a zone,
 * how its slots flow inside the zone).
 *
 * `collapse` is the active tier's state, and every columnar mode caps its track
 * count with it. Passing it is what keeps `@media` out of the engine: the
 * number CSS sees is already the collapsed one.
 *
 * `layered` is the one mode whose root geometry depends on `collapse` for a
 * reason other than a track count: at the floor tier a `collapse: "stack"` slot
 * stops being a positioning context entirely and becomes an ordinary column
 * (contract §7).
 */
export function slotFlowStyle(
  flow: SlotFlowMode,
  options: ResolvedFlowOptions,
  collapse: 'stack' | 'flow' = 'flow',
): Record<string, string> {
  const gap = gapToken(options.gap)
  const columns = effectiveColumns(columnsOf(options), collapse)
  switch (flow) {
    case 'stack':
      return { display: 'flex', flexDirection: 'column', gap }
    case 'layered':
      return isLayeredOptions(options) && !stacksAtFloor(options, collapse)
        ? layeredBoxStyle(options)
        : { display: 'flex', flexDirection: 'column', gap }
    case 'grid':
    case 'strip':
      // Legacy strip and grid share one track list; only the per-item span
      // differs (GallerySectionLayout.vue:350-371).
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
      }
    case 'masonry':
      // Multi-column, not grid: `column-count` balances item HEIGHTS, which is
      // the whole point of masonry. There is no row gap in a multi-column
      // container, so each item carries its own bottom margin instead.
      return { display: 'block', columnCount: String(columns), columnGap: gap }
    case 'carousel':
      // The root is only the vertical stack of [track+arrows, dots]. The track's
      // own gap is applied inside the renderer, so it is deliberately absent
      // here — a gap on both would double the spacing under the arrows.
      return { display: 'flex', flexDirection: 'column' }
    default: {
      const exhaustive: never = flow
      throw new Error(`[layoutEngine] unhandled slot flow "${String(exhaustive)}"`)
    }
  }
}

function columnsOf(options: ResolvedFlowOptions): number {
  return 'columns' in options ? options.columns : 1
}

/** Narrows the resolved bag to the layered shape without an assertion. */
export function isLayeredOptions(options: ResolvedFlowOptions): options is LayeredFlowOptions {
  return 'height' in options && 'collapse' in options
}

/**
 * Whether a layered slot gives up free placement at this tier.
 *
 * True only for the `stack` fallback at the floor tier: `scale` keeps the
 * composition and shrinks it, so it stays a positioning context all the way down.
 */
export function stacksAtFloor(
  options: LayeredFlowOptions,
  collapse: 'stack' | 'flow',
): boolean {
  return collapse === 'stack' && options.collapse === 'stack'
}

/**
 * The height a layered box owns.
 *
 * An absolutely-positioned child contributes nothing to its parent's height, so
 * without one of these the slot would be a zero-height band and every layer would
 * paint outside it. `svh` rather than `vh` for the viewport mode: mobile browser
 * chrome makes `vh` overshoot by the toolbar height.
 */
export function layeredHeightStyle(height: LayeredHeight): Record<string, string> {
  switch (height) {
    case 'ratio-16x9':
      return { aspectRatio: '16 / 9' }
    case 'ratio-4x3':
      return { aspectRatio: '4 / 3' }
    case 'viewport':
      return { minHeight: '100svh' }
    case 'content-min':
      return { minHeight: 'var(--layered-content-min-height, 24rem)' }
    default: {
      const exhaustive: never = height
      throw new Error(`[layoutEngine] unhandled layered height "${String(exhaustive)}"`)
    }
  }
}

function layeredBoxStyle(options: LayeredFlowOptions): Record<string, string> {
  return {
    display: 'block',
    position: 'relative',
    // A private stacking context: authored `zIndex` on a layer is ordering
    // WITHIN the slot and must never out-paint the section's own chrome.
    isolation: 'isolate',
    overflow: 'hidden',
    ...layeredHeightStyle(options.height),
  }
}

/**
 * A zone lays its slots out the same way a slot lays out its blocks — with one
 * exception. Free placement is a slot-level contract: the canvas surface is wired
 * per slot, over that slot's blocks. A zone holds slots, not blocks, so there is
 * nothing for it to position and a layered zone box would be an empty band. The
 * lint refuses `flow: "layered"` on a zone; this is what a hand-edited schema
 * that got past it degrades to.
 */
export function zoneFlowStyle(zone: ZoneDraft, collapse: 'stack' | 'flow' = 'flow'): Record<string, string> {
  const flow = zone.flow === 'layered' ? 'stack' : zone.flow
  return slotFlowStyle(flow, resolveFlowOptions(flow, { gap: zone.gap }), collapse)
}

/** Roles the layout can render — used to decide whether orphaned blocks have an outlet. */
export function declaredRoles(draft: LayoutDraft): PlaceableRole[] {
  return draft.slots.map(slot => slot.role)
}
