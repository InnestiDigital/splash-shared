// shared/types/sectionTypes.ts

import { LAYOUT_CONTAINER_MODES, LAYOUT_SPACING_TIERS } from '~/shared/types/layout'
import type { LayoutContainerMode, LayoutSpacingTier } from '~/shared/types/layout'

/**
 * Layout roles and section types are THEME vocabulary, not a closed language.
 *
 * Both widen to `string`: what a section type is, and which roles it offers,
 * is answered by the theme's `section-types/*.settings.json` files at runtime
 * (`sectionTypeCatalog` server-side, `sectionSchemas` client-side), not by a
 * union nobody outside `shared/` can extend. The `Builtin*` aliases below name
 * the four types and six roles that ship with the reference theme; they are a
 * seed for defaults and for themes that predate v2 schemas — never a ceiling.
 */
export type LayoutRole = string

export type SectionType = string

/**
 * Derived from the seed tuples below rather than restated, so the tuple and the
 * union cannot drift apart the way a hand-written `readonly SectionType[]`
 * annotation allowed them to.
 */
export type BuiltinSectionType = typeof KNOWN_SECTION_TYPES[number]
export type BuiltinLayoutRole = typeof KNOWN_LAYOUT_ROLES[number]

// Layout slot definition in section type schema
export interface LayoutSlot {
  role: LayoutRole
  required: boolean
  multiple: boolean
  description?: string  // Optional help text explaining role behavior to editors
}

// Section type schema (loaded from *.settings.json)
export interface SectionTypeSchema {
  type: SectionType
  label: string
  description: string
  usesContainer: boolean
  layoutSlots: LayoutSlot[]
  settings: Array<{
    id: string
    type: string
    label: string
    description?: string
    default?: any
    group?: string
    options?: Array<{ value: string; label: string; icon?: string; description?: string }>
    translatable?: boolean
    conditional?: { field: string; value: any }
    display?: 'visual-picker'
  }>
  groups: Array<{ id: string; label: string }>
}

// Stack gap options for inter-block spacing within sections. Authored content
// speaks the spacing tiers since the 2026_08_25_000003 value migration; the
// legacy names (tight/normal/spacious, gallery's loose) survive only as
// STACK_GAP_MAP fallback keys for the engine kill-switch path.
export type StackGap = 'none' | 'sm' | 'md' | 'lg'

// Type-specific layout config shapes
export type TypographyScale = 'default' | 'display' | 'compact'

/**
 * Custom color scheme fields — available on any section type when colorScheme is 'custom'.
 *
 * One field per `--section-*` var the `.section-renderer--custom` rule reads, so
 * the type and the emitted custom-property set stay in step. `SectionRenderer`'s
 * `customSchemeStyle` maps each field to its `--custom-section-*` override.
 */
export interface SectionCustomColorFields {
  customBgColor?: string
  customTextColor?: string
  customAccentColor?: string
  customBorderColor?: string
  customSurfaceColor?: string
  customTextMuted?: string
  customTextFaint?: string
}

export interface HeroLayoutConfig extends SectionCustomColorFields {
  mediaPosition?: 'center' | 'top' | 'bottom'
  contentAlign?: 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-left' | 'top-center' | 'top-right'
  height?: 'viewport' | 'large' | 'medium' | 'auto'
  typographyScale?: TypographyScale
}

export interface StackedLayoutConfig extends SectionCustomColorFields {
  shellLayout?: 'stacked' | 'centered' | 'none'
  contentAlignment?: 'left' | 'center' | 'full'
  stackGap?: StackGap
  typographyScale?: TypographyScale
}

export interface EditorialSplitLayoutConfig extends SectionCustomColorFields {
  shellSide?: 'left' | 'right' | 'alternate'
  showSeparators?: boolean
  contentWidthRatio?: 'equal' | 'wide-left' | 'wide-right' | 'sidebar-left' | 'sidebar-right' | 'narrow-left'
  /** Opt-in surface treatment for the content column. 'outlined' draws a thin themeable border card. */
  contentSurface?: 'none' | 'outlined'
  stackGap?: StackGap
  chromeAlign?: 'sticky-top' | 'center' | 'top' | 'bottom'
  typographyScale?: TypographyScale
}

export interface GalleryLayoutConfig extends SectionCustomColorFields {
  layout?: 'grid' | 'masonry' | 'strip' | 'carousel'
  columns?: number | string
  gap?: 'none' | 'sm' | 'md' | 'lg'
  // Strip-specific settings
  stripPattern?: 'first' | 'every-third' | 'alternating'
  // Carousel-specific settings
  autoplay?: boolean
  interval?: number
  showDots?: boolean
  showArrows?: boolean
  carouselColumns?: number | string
  typographyScale?: TypographyScale
}

/**
 * The layout config of a section type nobody in `shared/` has a shape for.
 *
 * A theme-defined section type carries whatever its own schema declares, so the
 * only guarantees are the custom-colour fields every section supports.
 */
export type GenericLayoutConfig = SectionCustomColorFields & {
  typographyScale?: TypographyScale
  [setting: string]: unknown
}

export type SectionLayoutConfigByType = {
  hero: HeroLayoutConfig
  stacked: StackedLayoutConfig
  'editorial-split': EditorialSplitLayoutConfig
  gallery: GalleryLayoutConfig
}

/**
 * Layout config for one section type: the precise builtin shape when the type
 * is one of the four the reference theme ships, the open shape otherwise.
 */
export type LayoutConfigForType<T extends string> =
  T extends BuiltinSectionType ? SectionLayoutConfigByType[T] : GenericLayoutConfig

// BlocksByRole — computed map passed to layout subcomponents
export interface ResolvedBlock {
  block: any
  component: any
  props: Record<string, any>
}

export type BlocksByRole = Record<string, ResolvedBlock[]>

/**
 * The builtin seed vocabulary — NOT a validation ceiling.
 *
 * Validation is theme-scoped: the server resolves a section type against the
 * site theme's `section-types/` catalog and a layout role against that
 * catalog's declared `layoutSlots`. These two tuples remain the fallback for a
 * theme that ships no section-type schemas at all, and the set the assistant's
 * protocol enum is seeded from.
 */
export const KNOWN_SECTION_TYPES = ['hero', 'stacked', 'editorial-split', 'gallery'] as const

export const KNOWN_LAYOUT_ROLES = [
  'section-heading', 'editorial-body', 'supporting-text', 'media-gallery', 'media-chrome', 'section-cta',
] as const

// Section preset types
export interface SectionPresetBlock {
  type: string
  layoutRole?: LayoutRole
  settings?: Record<string, any>
}

/**
 * Section presentation vocabulary, as runtime tuples.
 *
 * The unions are derived rather than declared so the values are available to
 * anything that has to publish or validate them at runtime (the assistant's
 * editor digest, the editor-op enum) without a second hand-copied list.
 */
export const SECTION_COLOR_SCHEMES = ['light', 'dark', 'accent', 'custom', 'transparent'] as const
export type SectionColorScheme = typeof SECTION_COLOR_SCHEMES[number]

/**
 * Aliases, not a second list. The frame is the page-level default behind a
 * section's own `containerMode`, so the two were always the same vocabulary
 * written twice; `shared/types/layout.ts` is now the single declaration.
 */
export const SECTION_CONTAINER_MODES = LAYOUT_CONTAINER_MODES
export type SectionContainerMode = LayoutContainerMode

export interface SectionPreset {
  id: string
  label: { [locale: string]: string }
  description?: { [locale: string]: string }
  preview?: string
  sectionType: SectionType
  colorScheme?: SectionColorScheme
  containerMode?: SectionContainerMode
  layoutConfig?: Partial<LayoutConfigForType<SectionType>>
  blocks: SectionPresetBlock[]
}

// ---------------------------------------------------------------------------
// Schema-driven section layout — L0 contract draft
//
// Additive only: nothing above this line changes. These types describe the
// `layout` block a section-type schema will declare so that one generic engine
// can render every section type as data. The engine itself lands in L1; see
// docs/architecture/section-layout-engine-contract.md for the prose contract
// and themes/standalone/section-types/*.v2.json for the four draft schemas.
// ---------------------------------------------------------------------------

/**
 * Spacing vocabulary shared with `sectionSpaceY` / `containerInsetX`.
 *
 * Replaces the two divergent gap vocabularies in use today (`stackGap`'s
 * none|tight|normal|spacious and gallery's none|tight|normal|loose). L1 must
 * ship a `layoutConfig` value migration; the mapping table is in §5.5 of the
 * contract.
 */
export const SPACING_TIERS = LAYOUT_SPACING_TIERS
export type SpacingTier = LayoutSpacingTier

/** How the blocks *within* one slot flow. */
export const SLOT_FLOW_MODES = ['stack', 'grid', 'masonry', 'strip', 'carousel', 'layered'] as const
export type SlotFlowMode = typeof SLOT_FLOW_MODES[number]

/**
 * How tall a `layered` slot's box is (contract §7).
 *
 * Absolutely-positioned children contribute nothing to their parent's height, so
 * a layered slot that stated no height would collapse to zero and render as an
 * empty band. Every mode here therefore produces a height the box owns itself:
 * two intrinsic aspect ratios, the viewport, or a content floor.
 */
export const LAYERED_HEIGHTS = ['ratio-16x9', 'ratio-4x3', 'viewport', 'content-min'] as const
export type LayeredHeight = typeof LAYERED_HEIGHTS[number]

/**
 * The mandatory mobile fallback for a `layered` slot.
 *
 * `stack` renders the blocks as a position-ordered single column at the floor
 * tier; `scale` keeps the free composition and scales the whole zone down from
 * `designWidth`. There is no third option and no default: free placement authored
 * at desktop proportions has no automatic narrow-viewport answer, so the schema
 * has to state which one it wants. The layout lint enforces it.
 */
export const LAYERED_COLLAPSE_MODES = ['stack', 'scale'] as const
export type LayeredCollapseMode = typeof LAYERED_COLLAPSE_MODES[number]

/** The width a `scale`-collapsing layered slot is authored against, in CSS pixels. */
export const LAYERED_DEFAULT_DESIGN_WIDTH = 1440

/** `canvas` is declared but rejected by the validator (see contract §7). */
export const LAYOUT_ENGINE_KINDS = ['grid', 'canvas'] as const
export type LayoutEngineKind = typeof LAYOUT_ENGINE_KINDS[number]

/** Which items a `strip` flow renders double-width. */
export const STRIP_PATTERNS = ['first', 'every-third', 'alternating'] as const
export type StripPattern = typeof STRIP_PATTERNS[number]

/** Free identifier naming one responsive tier (`full`, `mid`, `stack`, …). */
export type LayoutTierId = string

/**
 * One responsive tier.
 *
 * `minWidth` is a key of `BREAKPOINTS` (shared/features/cms/composition/
 * responsive.ts) or `null` for the floor tier — exactly one tier per schema has
 * `null`. A tier is active when `viewportWidth > BREAKPOINTS[minWidth]`,
 * STRICTLY greater, so 768px lands in the tier below `md` and matches
 * `isMobileViewport()`'s existing `<=` semantics.
 */
export interface LayoutTierDefinition {
  id: LayoutTierId
  minWidth: 'sm' | 'md' | 'lg' | 'xl' | null
}

/** `grid-template-areas` per tier, each entry an array of row strings. `.` is the empty cell. */
export type LayoutAreaMap = Readonly<Record<LayoutTierId, readonly string[]>>

/** `grid-template-columns` / `grid-template-rows` track list per tier, verbatim CSS. */
export type LayoutTrackMap = Readonly<Record<LayoutTierId, string>>

/** Line-based grid placement — the overlap escape from named zones. */
export interface LayoutGridLines {
  column: string
  row: string
}

/** `transform: translate(x, y)` on a grid item; does not affect grid sizing. */
export interface LayoutOffset {
  x: string
  y: string
}

/**
 * Sticky positioning for a zone or a line-placed slot.
 *
 * The engine forces `align-self: start` alongside `position: sticky` — a
 * stretched grid item is already full height, so sticky would never fire.
 * `tiers` lists the tier ids where sticky applies; the floor tier is normally
 * excluded, since a single-column sticky item pins over its own content.
 */
export interface SlotStickyConfig {
  top: string
  tiers: readonly LayoutTierId[]
}

/** CSS `place-items` / `place-self` shorthand: `"<align> <justify>"`. */
export type PlaceShorthand = string

/** Properties a grid item carries, whether it is a named zone or a line-placed slot. */
export interface LayoutGridItemProperties {
  placeSelf?: PlaceShorthand
  sticky?: SlotStickyConfig | null
  offset?: LayoutOffset
  zIndex?: number
  hiddenIn?: readonly LayoutTierId[]
}

/**
 * One named grid area. Zones are the grid items; slots live inside them and
 * stack in `layout.slots` declaration order.
 */
export interface LayoutZoneDefinition extends LayoutGridItemProperties {
  flow: SlotFlowMode
  gap: SpacingTier
}

export interface StackFlowOptions {
  gap: SpacingTier
}

export interface ColumnarFlowOptions extends StackFlowOptions {
  columns: number
}

export interface StripFlowOptions extends ColumnarFlowOptions {
  pattern: StripPattern
}

export interface CarouselFlowOptions extends ColumnarFlowOptions {
  autoplay: boolean
  interval: number
  showDots: boolean
  showArrows: boolean
}

export interface LayeredFlowOptions extends StackFlowOptions {
  height: LayeredHeight
  collapse: LayeredCollapseMode
  /** Only read when `collapse` is `scale`. */
  designWidth: number
}

/** Every shape `resolveFlowOptions()` can return, as one alias. */
export type ResolvedFlowOptions =
  | StackFlowOptions
  | ColumnarFlowOptions
  | StripFlowOptions
  | CarouselFlowOptions
  | LayeredFlowOptions

/** Discriminated on `flow` so `flowOptions` is exhaustively narrowed at the call site. */
export type SlotFlowSpec =
  | { flow: 'stack'; flowOptions: StackFlowOptions }
  | { flow: 'grid'; flowOptions: ColumnarFlowOptions }
  | { flow: 'masonry'; flowOptions: ColumnarFlowOptions }
  | { flow: 'strip'; flowOptions: StripFlowOptions }
  | { flow: 'carousel'; flowOptions: CarouselFlowOptions }
  | { flow: 'layered'; flowOptions: LayeredFlowOptions }

/** `_default` is the unroled bucket `DynamicPage.buildBlocksByRole()` already produces. */
export type PlaceableRole = LayoutRole | '_default'

interface LayoutSlotCommon {
  role: PlaceableRole
  hiddenIn?: readonly LayoutTierId[]
}

/** A slot rendered inside a named zone. The zone is the grid item, not the slot. */
export interface ZonePlacedSlot extends LayoutSlotCommon {
  zone: string
  place?: never
}

/**
 * A slot placed directly on grid lines, bypassing zones. Line placements may
 * overlap, which named areas cannot — this is how hero stacks its three roles
 * and how the asymmetric composition in contract §6(b) works. Such a slot IS
 * the grid item, so it carries the grid-item properties itself.
 */
export interface LinePlacedSlot extends LayoutSlotCommon, LayoutGridItemProperties {
  place: LayoutGridLines
  zone?: never
}

export type LayoutSlotDefinition = (ZonePlacedSlot | LinePlacedSlot) & SlotFlowSpec

/** The `layout` block on a section-type schema. */
export interface SectionLayoutDefinition {
  engine: LayoutEngineKind
  tiers: readonly LayoutTierDefinition[]
  areas?: LayoutAreaMap
  columns: LayoutTrackMap
  rows: LayoutTrackMap
  gap: { row: SpacingTier; column: SpacingTier }
  placeItems?: PlaceShorthand
  minHeight?: string
  zones?: Readonly<Record<string, LayoutZoneDefinition>>
  slots: readonly LayoutSlotDefinition[]
}

/** Fields of a zone that a setting may patch. */
export const LAYOUT_ZONE_BIND_FIELDS = [
  'flow', 'gap', 'placeSelf', 'sticky', 'offset', 'zIndex', 'hiddenIn',
] as const
export type LayoutZoneBindField = typeof LAYOUT_ZONE_BIND_FIELDS[number]

/** Fields of a slot that a setting may patch (beyond `flowOptions.<key>`). */
export const LAYOUT_SLOT_BIND_FIELDS = [
  'zone', 'flow', 'placeSelf', 'sticky', 'offset', 'zIndex', 'hiddenIn',
] as const
export type LayoutSlotBindField = typeof LAYOUT_SLOT_BIND_FIELDS[number]

/** Grid-level targets, as a runtime tuple so the validator can check membership. */
export const LAYOUT_GRID_BIND_TARGETS = [
  'columns', 'rows', 'areas', 'gap.row', 'gap.column', 'placeItems', 'minHeight',
] as const
export type LayoutGridBindTarget = typeof LAYOUT_GRID_BIND_TARGETS[number]

/**
 * Closed union of everything a setting may patch. Deliberately not a free-form
 * JSON pointer: the engine switches over the target kind with a `never`
 * default, and the validator rejects typos at build time.
 */
export type LayoutBindTarget =
  | LayoutGridBindTarget
  | `zone.${string}.${LayoutZoneBindField}`
  | `slot.${PlaceableRole}.${LayoutSlotBindField}`
  | `slot.${PlaceableRole}.flowOptions.${string}`

/**
 * One binding. `tier` omitted patches EVERY declared tier; present, only that
 * one — which is how gallery's column count applies at `full` while the floor
 * tier keeps its single-column declaration.
 */
export interface LayoutBinding {
  target: LayoutBindTarget
  tier?: LayoutTierId
}

/** Everything a bound option may carry. Validated per target kind before it reaches a style. */
export type LayoutBoundValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly LayoutTierId[]
  | SlotStickyConfig
  | LayoutOffset
  | null

/**
 * Engine-owned resolvers for values no static option can carry.
 *
 * Exactly one member today: `alternate-by-index` reproduces
 * `editorial-split`'s `shellSide: 'alternate'`, which depends on the section's
 * index among its siblings. Adding a second is a deliberate `shared/` edit.
 */
export const LAYOUT_RESOLVERS = ['alternate-by-index'] as const
export type LayoutResolverId = typeof LAYOUT_RESOLVERS[number]

/** A `select` / `radio` option that patches layout data instead of naming a class. */
export interface LayoutBoundOption {
  value: string
  label: string
  icon?: string
  description?: string
  /** Keyed by `LayoutBindTarget`; one key per target declared in the setting's `layoutBind`. */
  layoutValues?: Readonly<Record<string, LayoutBoundValue>>
  layoutResolver?: LayoutResolverId
}

/**
 * The `layoutBind` surface added to a schema setting.
 *
 * Legal only on `select` / `radio` (per-option `layoutValues`) and `toggle`
 * (setting-level `layoutValue` / `layoutValueOff`). There is no template form
 * on purpose — an interpolated `"repeat({value}, …)"` would be a second
 * geometry DSL and a string-injection surface into an inline `style`
 * attribute, for something the option list already enumerates.
 */
export interface LayoutBoundSetting {
  /**
   * Implicit-AND visibility guard: every entry must match the section's own
   * resolved setting values (array = one-of, boolean = truthiness). Same shape
   * the admin settings panel uses, and load-bearing for the engine rather than
   * cosmetic: contract §8.8 lets two settings share one bind target when their
   * guards are disjoint, which only holds if the engine evaluates them.
   */
  showIf?: Readonly<Record<string, unknown>>
  layoutBind: readonly LayoutBinding[]
  options?: readonly LayoutBoundOption[]
  layoutValue?: Readonly<Record<string, LayoutBoundValue>>
  layoutValueOff?: Readonly<Record<string, LayoutBoundValue>>
}

/**
 * Section-type schema with schema-driven geometry.
 *
 * `type` widens to `string` because closing the section grammar at four
 * literals is exactly what this program removes. `layoutSlots` is unchanged and
 * keeps answering "what may an editor put here"; `layout` answers "where does
 * it land and how does it flow".
 */
/**
 * One `select` / `radio` option on a v2 setting: the plain option fields, plus
 * the optional layout binding.
 *
 * Stated as one type rather than left to intersect `SectionTypeSchema`'s option
 * shape with `LayoutBoundOption`. Intersecting two ARRAY types does not merge
 * their element types — TS keeps checking object literals against the first
 * member — so `layoutValues` was unwritable in TypeScript. The JSON schemas
 * never noticed; anything constructing a v2 schema in TS did.
 */
export type SectionSettingOption =
  NonNullable<SectionTypeSchema['settings'][number]['options']>[number]
  & Partial<Pick<LayoutBoundOption, 'layoutValues' | 'layoutResolver'>>

export interface SectionTypeSchemaV2 extends Omit<SectionTypeSchema, 'type' | 'settings'> {
  type: string
  layout: SectionLayoutDefinition
  /**
   * Curated arrangement variants (2026-09 composition unification, C2). A
   * preset patches the cloned layout with bind-target values BEFORE authored
   * settings are applied, so section settings always win over the preset.
   * Values use the same target grammar as `layoutBind`, plus tier-scoped grid
   * targets (`areas.full`, `columns.stack`, ...) — validated by
   * `scripts/lint-section-layouts.mjs` at generate time.
   */
  presets?: readonly SectionPresetDefinition[]
  settings: Array<
    Omit<SectionTypeSchema['settings'][number], 'options'>
    & Omit<Partial<LayoutBoundSetting>, 'options'>
    & { options?: readonly SectionSettingOption[] }
  >
}

/**
 * One curated arrangement variant of a section type. Label/description may be
 * a plain string or an i18n map, mirroring the block schema label shape.
 */
export interface SectionPresetDefinition {
  id: string
  label: string | Record<string, string>
  description?: string | Record<string, string>
  /** Bind-target values applied to the layout draft, in key order. */
  values: Readonly<Record<string, LayoutBoundValue>>
}

/**
 * Engine output for one section at one tier — flat, already-resolved CSS.
 *
 * Every string here is written into an inline `style` attribute, so each has
 * passed the validator's track/shorthand allowlist and every authored value
 * behind it matched a declared option (contract §8, rules 7 and 14).
 */
export interface ResolvedSectionLayout {
  tier: LayoutTierId
  /** `stack` when `tier` is the floor tier — preserves the SPL-131 attribute vocabulary. */
  collapse: 'stack' | 'flow'
  gridTemplateAreas: string | null
  gridTemplateColumns: string
  gridTemplateRows: string
  rowGap: string
  columnGap: string
  placeItems: string
  minHeight: string | null
  zones: Readonly<Record<string, ResolvedLayoutItem>>
  slots: readonly ResolvedLayoutSlot[]
}

/** Resolved geometry for one grid item (a zone, or a line-placed slot). */
export interface ResolvedLayoutItem {
  gridArea: string
  placeSelf: string
  position: 'static' | 'sticky'
  top: string | null
  transform: string | null
  zIndex: number | null
  rendered: boolean
}

export interface ResolvedLayoutSlot {
  role: PlaceableRole
  /** `null` for a line-placed slot, which is its own grid item. */
  zone: string | null
  flow: SlotFlowMode
  flowOptions: ResolvedFlowOptions
  rendered: boolean
  /**
   * Resolved grid-item geometry for a line-placed slot (contract §3.4), which
   * IS the grid item and therefore carries `placeSelf` / `sticky` / `offset` /
   * `zIndex` itself. `null` for a zone-placed slot, whose zone is the grid item.
   */
  item: ResolvedLayoutItem | null
}
