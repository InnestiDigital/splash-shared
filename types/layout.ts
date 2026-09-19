export type LocalizedString = Record<string, string>

/**
 * The two placement vocabularies, declared once, as option lists.
 *
 * VALUE AND LABEL TOGETHER on purpose. Before this, the values lived in
 * `frameTokens.ts` and again in `sectionTypes.ts`, while the labels the editor
 * shows lived in a third hand-written array inside `SectionSettings.vue` — and
 * the registry could only mark `containerMode` / `containerInsetX` /
 * `sectionSpaceY` `opaque`, because no schema on disk spelled them. Splitting
 * value from label is what let a fourth copy exist: a consumer that needs a
 * label has to restate the list. One tuple, and the panel, the registry
 * vocabulary and the layout engine cannot disagree.
 *
 * These are ENGINE vocabularies, not theme data: `containerModeWidth()` owns
 * one width formula per mode and `frameTokens.scss` ships one custom property
 * per tier, so a theme cannot add a value without a `shared/` diff. That is why
 * they are `closed-enum` in the registry rather than `theme-set` — unlike
 * `revealPreset` / `defaultBlockEntrance`, whose values really are read out of
 * `theme.json`'s `motion` block.
 */
export const LAYOUT_CONTAINER_MODE_OPTIONS = [
  { value: 'measure', label: 'Standard (1200px)' },
  { value: 'content', label: 'Narrow (720px)' },
  { value: 'wide', label: 'Wide (1400px)' },
  { value: 'full-bleed', label: 'Full Width' },
] as const

export const LAYOUT_SPACING_TIER_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
] as const

/**
 * Container widths a frame can request. Same vocabulary as a section's own
 * `containerMode` — the frame is the page-level default behind it.
 */
export type LayoutContainerMode = typeof LAYOUT_CONTAINER_MODE_OPTIONS[number]['value']

/** Spacing tiers shared by section spacing and container insets. */
export type LayoutSpacingTier = typeof LAYOUT_SPACING_TIER_OPTIONS[number]['value']

export const LAYOUT_CONTAINER_MODES: readonly LayoutContainerMode[] =
  LAYOUT_CONTAINER_MODE_OPTIONS.map(option => option.value)

export const LAYOUT_SPACING_TIERS: readonly LayoutSpacingTier[] =
  LAYOUT_SPACING_TIER_OPTIONS.map(option => option.value)

export interface LayoutFrameConfig {
  containerMode: LayoutContainerMode
  maxWidth?: string
  insetX: LayoutSpacingTier | (string & {})
  minHeight?: string
  overflowX: 'visible' | 'hidden' | 'clip'
  sectionSpacingDefault?: LayoutSpacingTier
  /**
   * Responsive strategy.
   * - 'breakpoint' (default): blocks self-collapse via useViewport()
   * - 'scale': page content is uniformly scaled to fit the viewport
   *   (Readymag-style). Authored at `designWidth`; chrome/header/footer
   *   stay at viewport scale.
   */
  responsiveMode?: 'breakpoint' | 'scale'
  /** Canvas width the author designs against, in CSS pixels. Used in scale mode only. */
  designWidth?: number
  /** Lower bound for the scale factor; below this the content stays at minScale × designWidth. */
  minScale?: number
  /** Upper bound for the scale factor; default 1 means content never upscales past design. */
  maxScale?: number
  /** Anchor point for the scale transform. */
  scaleOrigin?: 'top-left' | 'top-center'
}

export type LayoutHeaderMorphStyle = 'editorial-slide' | 'glass-pill'

/**
 * Page-override vocabulary for `morphStyle`. `'none'` is a sentinel meaning
 * "explicitly no choreography on this page", as opposed to an absent key,
 * which inherits the layout value. `mergeHeader` resolves it away, so a
 * resolved config never carries it.
 */
export type LayoutHeaderMorphOverride = LayoutHeaderMorphStyle | 'none'

export interface LayoutHeaderConfig {
  enabled: boolean
  /**
   * Scroll-morph choreography, CSS-driven off a `--morph-t` custom property
   * (continuous 0→1 scroll progress).
   * - 'editorial-slide': transparent chrome over a full-bleed hero; over the
   *   first ~400px of scroll the tagline slides right, the center wordmark
   *   fades in, and the background bar fades in. Desktop-gated; mobile keeps
   *   the standard header with a scroll-faded backdrop.
   * - 'glass-pill': the strip is a centred capsule at all scroll positions;
   *   a white pill fill + drop shadow fade in with scroll.
   * Absent = no choreography (static header, current default behavior).
   */
  morphStyle?: LayoutHeaderMorphStyle
  /**
   * Hide the header's center wordmark/logo. Use on layouts whose hero renders
   * a giant brand wordmark, so the chrome doesn't duplicate it.
   */
  hideWordmark?: boolean
  /**
   * Colors applied on top of the theme palette. An absent or empty string
   * inherits the theme value — same contract as the footer palette.
   */
  palette: {
    bgColor?: string
    textColor?: string
    navLinkColor?: string
    navLinkHoverColor?: string
    accentBarColor?: string
    /**
     * Scroll-fade: the header background alpha rides the morph progress
     * (transparent at rest → the palette bgColor once scrolled) instead of
     * painting a constant bar. Only meaningful with a morphStyle.
     */
    scrollFade?: boolean
  }
}

/**
 * Footer chrome. Shape (`horizontal-bar` | `grid`) is owned by
 * `Footer.settings.json.layout` — never duplicated here.
 */
export interface LayoutFooterConfig {
  enabled: boolean
  position: 'normal' | 'sticky-bottom'
  palette?: {
    bgColor?: string
    textColor?: string
    linkColor?: string
  }
}

export interface LayoutBackgroundConfig {
  color?: string
  image?: {
    src: string
    repeat: 'none' | 'repeat' | 'repeat-x' | 'repeat-y'
    size: 'auto' | 'cover' | 'contain' | (string & {})
    position: string
    attachment: 'scroll' | 'fixed'
    opacity?: number
  }
  overlay?: {
    color: string
    opacity: number
    blendMode?: string
  }
  texture?: {
    type: 'noise' | 'grain'
    opacity: number
  }
}

export type ChromeAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

export interface BaseChromeElement {
  id: string
  enabled: boolean
  position: 'fixed' | 'absolute'
  anchor: ChromeAnchor
  offsetX: string
  offsetY: string
  zIndex: number
  opacity?: number
  blendMode?: string
  pointerEvents?: 'none' | 'auto'
  hideBelow?: 'sm' | 'md' | 'lg' | null
  /**
   * Stacking layer.
   * - 'background' (recommended for decorative chrome): rendered inside an
   *   isolated stacking context behind page content. The element's `zIndex`
   *   only matters relative to other background-layer chrome — page sections
   *   and blocks always win.
   * - 'foreground' (default for back-compat): rendered as a sibling of page
   *   content; `zIndex` competes with whatever the page uses.
   */
  layer?: 'background' | 'foreground'
  /**
   * Coordinate space for offsets and lengths.
   * - 'viewport' (default): offsets/lengths resolve against the actual
   *   browser viewport. `vw`/`%` mean what they always do.
   * - 'design': offsets/lengths resolve against the design canvas
   *   (`frame.designWidth`). Use `%` for proportional positioning that
   *   tracks design coords; element scales with the canvas in scale mode.
   *   Only meaningful when the layout's frame.responsiveMode is 'scale'.
   *   In breakpoint mode this falls back to viewport behavior.
   */
  coordSpace?: 'viewport' | 'design'
  /**
   * Positioning substrate.
   * - 'viewport-fixed' (default): element is rendered by the shell-level
   *   chrome renderer and positioned against the viewport (or, for
   *   background/design layers, against a viewport-sized wrapper). It stays
   *   put as the page scrolls.
   * - 'flow': element renders INSIDE the layout content box (the flow-mode
   *   chrome renderer mounted as the first child of the content wrapper in
   *   LayoutShell). It scrolls with the content and naturally ends before the
   *   footer, because the footer is a sibling of the content wrapper — not a
   *   descendant of it. Use for chrome (e.g. a hairline) that must track the
   *   content column rather than the viewport.
   */
  positionMode?: 'viewport-fixed' | 'flow'
}

export interface LineChromeElement extends BaseChromeElement {
  type: 'line'
  orientation: 'vertical' | 'horizontal'
  color: string
  thickness: string
  length: string
}

export interface ShapeChromeElement extends BaseChromeElement {
  type: 'shape'
  shape: 'rectangle' | 'circle' | 'pill'
  color: string
  width: string
  height: string
  radius?: string
  rotation?: string
}

export interface ImageChromeElement extends BaseChromeElement {
  type: 'image'
  src: string
  alt?: string
  width: string
  height?: string
  objectFit?: 'contain' | 'cover'
  rotation?: string
}

export interface TextChromeElement extends BaseChromeElement {
  type: 'text'
  text: string
  typographyPresetKey?: string
  color?: string
  rotation?: string
}

/**
 * Reading / scroll-progress indicator. Tracks the document's vertical scroll
 * (window scroll, the app's single scroll source) and fills 0→1 as the reader
 * moves from the top of the page to the bottom. Two renderings:
 * - 'bar'  — a thin fill pinned to the top or bottom viewport edge, spanning
 *            full width. Ignores `anchor`/`offsetX`; uses `edge` + `offsetY`.
 * - 'ring' — a circular SVG gauge placed by the usual `anchor`/`offsetX`/
 *            `offsetY`; optionally prints the live percentage in its centre.
 *
 * The fill is driven directly off scroll (rAF-throttled), so it is not an
 * autonomous animation — it stays accurate under prefers-reduced-motion; only
 * the easing transition is dropped there.
 */
export interface ProgressChromeElement extends BaseChromeElement {
  type: 'progress'
  /** Visual form. Default 'bar'. */
  indicator?: 'bar' | 'ring'
  /** Fill colour (progress portion). Required. */
  color: string
  /** Track / unfilled colour. Default: transparent (bar), faint fill (ring). */
  trackColor?: string
  /** Bar height or ring stroke width. Default '3px'. */
  thickness?: string
  /** Which viewport edge a 'bar' pins to. Default 'top'. */
  edge?: 'top' | 'bottom'
  /** Ring diameter (CSS length). Default '44px'. Ignored for 'bar'. */
  size?: string
  /** Ring only: render the live percentage in the centre. Default false. */
  showLabel?: boolean
}

export type LayoutChromeElement =
  | LineChromeElement
  | ShapeChromeElement
  | ImageChromeElement
  | TextChromeElement
  | ProgressChromeElement

export interface LayoutChromeConfig {
  elements: LayoutChromeElement[]
}

export interface LayoutScrollConfig {
  mode: 'normal' | 'snap-y'
  snapType?: 'mandatory' | 'proximity'
  snapAlign?: 'start' | 'center'
  smoothScroll?: boolean
}

export interface LayoutOverridePolicy {
  allowPageHeaderOverride?: boolean
  allowPageFooterOverride?: boolean
  allowPageBackgroundOverride?: boolean
  allowPageChromeOverride?: boolean
  allowPageChromeAdditions?: boolean
  allowPageScrollOverride?: boolean
}

/**
 * The section values a brand canvas STARTS with under this layout.
 *
 * Authoring-time only — no renderer reads this. It is deliberately NOT inside
 * `frame`, which is a pure render input: this describes rows a create call
 * writes once, not a property of how anything paints.
 */
export interface CanvasInitialSection {
  containerMode: 'measure' | 'content' | 'wide' | 'full-bleed'
  containerInsetX: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  sectionSpaceY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
}

/**
 * Present = this layout is offered as an ART DIRECTION when a brand canvas is
 * created, AND is selectable as a canvas page's layout. Absent = neither.
 *
 * A canvas preset is an act performed once at creation, never a stored state:
 * nothing writes the chosen preset's identity anywhere. What it does is set the
 * page's `layout` and seed one section — ordinary rows that stop being
 * attributable to a preset the moment they exist, which is the point. Attaching
 * the data to the layout entry itself is what stops the marker from dangling.
 */
export interface LayoutCanvasPreset {
  /** Option name. Falls back to the layout's own `label` when omitted. */
  label?: LocalizedString
  /** One line under the option, in the author's words. Required. */
  hint: LocalizedString
  /** Ascending; ties break on layout id; absent sorts last. */
  order?: number
  /** Pre-selected on the form. First declared wins if a theme marks several. */
  default?: boolean
  /** What the seeded first section — and every later section on this canvas — starts as. */
  initialSection: CanvasInitialSection
}

export interface ThemeLayout {
  id: string
  label: LocalizedString
  allowedBlocks: string[]
  frame?: LayoutFrameConfig
  header?: LayoutHeaderConfig
  footer?: LayoutFooterConfig
  background?: LayoutBackgroundConfig
  chrome?: LayoutChromeConfig
  scroll?: LayoutScrollConfig
  overridePolicy?: LayoutOverridePolicy
  canvasPreset?: LayoutCanvasPreset
}

export type LayoutHeaderOverride = Omit<Partial<LayoutHeaderConfig>, 'palette' | 'morphStyle'> & {
  palette?: Partial<LayoutHeaderConfig['palette']>
  morphStyle?: LayoutHeaderMorphOverride
}

export type LayoutFooterOverride = Omit<Partial<LayoutFooterConfig>, 'palette'> & {
  palette?: Partial<NonNullable<LayoutFooterConfig['palette']>>
}

export type LayoutBackgroundOverride = Omit<Partial<LayoutBackgroundConfig>, 'image' | 'overlay' | 'texture'> & {
  image?: Partial<NonNullable<LayoutBackgroundConfig['image']>>
  overlay?: Partial<NonNullable<LayoutBackgroundConfig['overlay']>>
  texture?: Partial<NonNullable<LayoutBackgroundConfig['texture']>>
}

export interface PageLayoutOverrides {
  header?: LayoutHeaderOverride
  footer?: LayoutFooterOverride
  background?: LayoutBackgroundOverride
  scroll?: Partial<LayoutScrollConfig>
  chrome?: Record<string, Partial<LayoutChromeElement> & { enabled?: boolean }>
}

export interface ResolvedLayoutConfig {
  id: string
  label: LocalizedString
  allowedBlocks: string[]
  frame: LayoutFrameConfig
  header: LayoutHeaderConfig
  footer: LayoutFooterConfig
  background: LayoutBackgroundConfig
  chrome: LayoutChromeConfig
  scroll: LayoutScrollConfig
  overridePolicy: LayoutOverridePolicy
}
