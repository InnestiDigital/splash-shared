import { KNOWN_SECTION_TYPES, SECTION_COLOR_SCHEMES, SECTION_CONTAINER_MODES } from '~/shared/types/sectionTypes'
import {
  ALIGN_SELF_OPTIONS,
  BORDER_RADIUS_TOKENS,
  MAX_WIDTH_TOKENS,
  SEMANTIC_COLOR_OPTIONS,
  SHADOW_TOKENS,
  SPACING_TOKENS,
  VIEWPORT_OPTIONS,
  VISIBLE_TO_OPTIONS,
  WIDTH_MODE_OPTIONS,
  WRAPPER_STYLE_OPTIONS,
  isCanvasBlockGeometry,
} from '~/shared/types/placement'
import { isNullableRecord, isNullableString, isRecord } from '~/shared/types/guards'
import type { SectionColorScheme, SectionContainerMode, SectionType } from '~/shared/types/sectionTypes'
import type {
  BlockPlacementConfig,
  BorderRadiusToken,
  MaxWidthValue,
  SemanticColor,
  SpacingValue,
  ViewportName,
  WrapperOverrides,
} from '~/shared/types/placement'

/**
 * Brand Content Studio — the BRAND CANVAS contract.
 *
 * A brand template is no longer authored HTML: it is a real page of type
 * `brand-canvas` on the ordinary `pages` / `sections` / `blocks` tables, edited
 * with the ordinary editor. Two artifacts come out of that:
 *
 *  1. `BrandCanvasSnapshot` — the APPROVED serialization of that page's draft
 *     tree, stored in `brand_format_templates.snapshot`. Renders and recipes
 *     read the snapshot ONLY; the live page keeps moving underneath it, and an
 *     approval is a statement about a specific tree, not about "that page".
 *  2. `BrandCanvasOverrides` — per-generation setting values applied OVER the
 *     snapshot at render time and never written back, so one approved template
 *     produces many assets without ever being edited.
 *
 * The snapshot mirrors the shape `/api/site-config/page` already returns for a
 * static page — a flat `blocks` array whose members point at a section by
 * `sectionId`, beside the `sections` array — so the canvas route can hand it to
 * the same renderer the public site uses instead of a second, parallel one.
 * "The same renderer" is a constraint on this file: `SectionRenderer` requires
 * every section field below and `PlacementWrapper` requires the block
 * `placement`, so a snapshot that carried less would force the canvas route to
 * invent values no approval ever contained.
 */

/**
 * A Chromium page is a bounded resource, and an unbounded canvas is how one
 * template wedges the render pool for every tenant. The canvas size is authored
 * (a brand asset is not pinned to one of the compiled formats), so the bound has
 * to live on the value rather than on a descriptor.
 */
export const BRAND_CANVAS_MIN_SIZE = 16
export const BRAND_CANVAS_MAX_SIZE = 4096

/**
 * More blocks than any real canvas overrides at once. Past this the request is a
 * bug or an attack, not authoring.
 */
export const BRAND_CANVAS_OVERRIDE_MAX_BLOCKS = 64

/**
 * Settings values are arbitrary JSON (richtext documents, media refs, arrays),
 * so a per-value length cap would not bound the payload. The SERIALIZED total is
 * what actually crosses the wire, lands in a recipe row and is injected into the
 * render page, so that is what is capped.
 */
export const BRAND_CANVAS_OVERRIDE_MAX_CHARS = 32_000

/**
 * The reveal preset every snapshot section carries.
 *
 * Entrance motion in this codebase is IntersectionObserver-gated:
 * `useSectionReveal` paints `opacity: 0` immediately and clears it when the
 * observer fires. A canvas is captured in ONE headless frame that never
 * scrolls, so an observer that has not fired yet is an invisible section — a
 * blank PNG that looks like a render bug rather than a motion setting.
 *
 * 'none' is the exact value `SectionRenderer` checks to skip the composable
 * altogether, so the snapshot pins it (with `revealOverrides` and
 * `defaultBlockEntrance` pinned off beside it) rather than copying the live
 * row and trusting every render surface to neutralize motion itself.
 */
export const BRAND_CANVAS_REVEAL_PRESET = 'none'

// ─── Snapshot ────────────────────────────────────────────────────────────────

/** Authoritative canvas size — the TEMPLATE row owns it, the page backlinks it. */
export interface BrandCanvasSize {
  width: number
  height: number
}

/**
 * Section vocabularies, as runtime tuples.
 *
 * The columns behind them are varchars and the snapshot is parsed back out of a
 * JSON column, so a value the renderer has no CSS class for has to fail at the
 * boundary instead of painting an unstyled section into an exported asset. The
 * element type is the shared alias where one exists, so a vocabulary that grows
 * without this list growing with it fails to compile.
 */
const CANVAS_COLOR_SCHEMES: readonly SectionColorScheme[] = SECTION_COLOR_SCHEMES
const CANVAS_CONTAINER_MODES: readonly SectionContainerMode[] = SECTION_CONTAINER_MODES

const BRAND_CANVAS_SECTION_ROLES = ['hero', 'content', 'divider', 'footer'] as const
type BrandCanvasSectionRole = (typeof BRAND_CANVAS_SECTION_ROLES)[number]

/** Shared by `sectionSpaceY` and `containerInsetX` — both index the same token scale. */
const BRAND_CANVAS_SPACING_SCALE = ['none', 'sm', 'md', 'lg', 'xl'] as const
type BrandCanvasSpacingScale = (typeof BRAND_CANVAS_SPACING_SCALE)[number]

/** Custom lengths in placement values; the editor offers no other units. */
const CANVAS_LENGTH_UNITS = ['px', 'rem'] as const

/**
 * One section of an approved canvas — every prop `SectionRenderer` declares,
 * because that is the component the canvas route renders it with. Dropping a
 * field here does not make the render simpler, it makes the route synthesize a
 * value the approval never contained (a background, a container width, a
 * padding step).
 *
 * What is deliberately absent is what the RENDERER does not read: `pageId`,
 * `tenantId`, `versionId`, timestamps, and `choreographyMeta` — choreography
 * only shapes auto-entrance scenes, which a snapshot never generates because
 * `defaultBlockEntrance` is pinned off.
 */
interface BrandCanvasSectionSnapshot {
  id: string
  name: string
  position: number
  sectionType: SectionType
  /** DOM id on the rendered `<section>`; null = no anchor. */
  anchor: string | null
  /** Honoured by the renderer's `v-show` — a hidden section is captured empty, on purpose. */
  isHidden: boolean
  /** Drives `section-renderer--{scheme}`: background, text, border and accent. */
  colorScheme: SectionColorScheme
  /** Emitted as `data-section-role`; null = unclassified. */
  sectionRole: BrandCanvasSectionRole | null
  /** Drives `section-renderer--{mode}` and the container max-width. */
  containerMode: SectionContainerMode
  /** Vertical rhythm token → `--section-space-y`. */
  sectionSpaceY: BrandCanvasSpacingScale
  /** Horizontal inset token → `--container-inset-x`. */
  containerInsetX: BrandCanvasSpacingScale
  /** Pinned — see `BRAND_CANVAS_REVEAL_PRESET`. */
  revealPreset: typeof BRAND_CANVAS_REVEAL_PRESET
  /** Pinned null: reveal is off, so per-section reveal tuning has nothing to tune. */
  revealOverrides: null
  /** Pinned null: an auto-entrance scene is the same one-shot-capture trap as reveal. */
  defaultBlockEntrance: null
  /** Type-specific layout settings, verbatim from the section row; null = defaults. */
  layoutConfig: Record<string, unknown> | null
}

/**
 * One block of an approved canvas.
 *
 * `id` is the block's uuid as it stood at approval time, and it is the OVERRIDE
 * KEY: a generation names blocks by this id, so an override survives the live
 * page being re-edited but not a block being deleted and recreated.
 */
export interface BrandCanvasBlockSnapshot {
  id: string
  type: string
  position: number
  /** Owning section, or null for a block that hangs off the page directly. */
  sectionId: string | null
  /** Slot the owning section's layout places this block in; null = the default slot. */
  layoutRole: string | null
  settings: Record<string, unknown>
  options: Record<string, unknown> | null
  /**
   * Margins, alignment, width, frame and visibility — the STRUCTURED shape, not
   * the thirteen flat `blocks` columns behind it.
   *
   * Every section layout (and both of `DynamicPage`'s block branches) wraps
   * every block in `PlacementWrapper`, which takes exactly this object, and the
   * repository already produces it from the columns. Mirroring the columns
   * instead would make the canvas route re-implement that mapping — including
   * the JSON parses and the `visibleTo: 'everyone'` normalization — and a block
   * authored with a card frame or a constrained max-width would export plain
   * and full-bleed until it did.
   *
   * `null` = the block declares no placement at all; the wrapper's prop is
   * optional, so the render surface passes `placement ?? undefined`.
   */
  placement: BlockPlacementConfig | null
}

export interface BrandCanvasSnapshot {
  canvas: BrandCanvasSize
  /**
   * The theme layout the canvas mounts — the canvas PAGE's own layout choice,
   * captured at approval like everything else. `null`/absent (every snapshot
   * approved before this field existed) means the chrome-free `blank` layout.
   * This is what lets a canvas opt INTO theme chrome (a brand accent bar, a
   * framed variant) the same way a site page picks its layout, instead of
   * `blank` being hardwired at render.
   */
  layout?: string | null
  /**
   * The canvas page's `meta.layoutOverrides`, verbatim — per-page tweaks to
   * the chosen layout (header/footer/background/chrome), resolved by the SAME
   * `useResolvedLayout` the site uses. Shape-checked as a record only: the
   * deep contract belongs to the layout system, and a snapshot must carry
   * what the author configured, not a repaired version of it.
   */
  layoutOverrides?: Record<string, unknown> | null
  sections: BrandCanvasSectionSnapshot[]
  /** Flat, section-referencing — the same shape `/api/site-config/page` returns. */
  blocks: BrandCanvasBlockSnapshot[]
}

// ─── The canvas page ─────────────────────────────────────────────────────────

/**
 * The `pages.page_type` value that makes a page a canvas.
 *
 * A canvas page is an ORDINARY page to the editor and an invisible one to every
 * public surface: it is excluded from the site-config page list, navigation and
 * the sitemap. It stays on the draft tier — publishing a canvas would put a
 * brand asset's working copy on the public site.
 */
export const BRAND_CANVAS_PAGE_TYPE = 'brand-canvas'

/** The `pages.meta` key the backlink lives under. */
export const BRAND_CANVAS_PAGE_META_KEY = 'brandCanvas'

/**
 * The page → template backlink, stored at `pages.meta.brandCanvas`.
 *
 * `width` / `height` are a MIRROR for the editor's benefit (the canvas frame is
 * drawn before any template row is fetched). The TEMPLATE row is authoritative;
 * when the two disagree the row wins, and the mirror is what gets corrected.
 */
export interface BrandCanvasPageMeta {
  templateId: string
  width: number
  height: number
}

export function isBrandCanvasPageMeta(value: unknown): value is BrandCanvasPageMeta {
  if (!isRecord(value)) return false
  if (typeof value.templateId !== 'string' || value.templateId.length === 0) return false
  return isBrandCanvasDimension(value.width) && isBrandCanvasDimension(value.height)
}

// ─── Overrides ───────────────────────────────────────────────────────────────

/**
 * Per-generation setting values: block uuid → settingId → value.
 *
 * Shallow by design. An override replaces a whole setting, never a field inside
 * one: deep-merging authored JSON (richtext documents, item arrays) produces
 * shapes no schema describes, and the block would render something neither the
 * approval nor the generation asked for.
 */
export type BrandCanvasOverrides = Record<string, Record<string, unknown>>

// ─── Guards ──────────────────────────────────────────────────────────────────

/** Membership test that narrows, so no vocabulary needs a widening cast to check. */
function isMember<T extends string>(options: readonly T[], value: unknown): value is T {
  if (typeof value !== 'string') return false
  return options.some(option => option === value)
}

export function isBrandCanvasDimension(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= BRAND_CANVAS_MIN_SIZE
    && value <= BRAND_CANVAS_MAX_SIZE
}

/** A custom length: finite number plus one of the two authored units. */
function isCustomLength(value: Record<string, unknown>): boolean {
  return typeof value.value === 'number'
    && Number.isFinite(value.value)
    && isMember(CANVAS_LENGTH_UNITS, value.unit)
}

function isSpacingValue(value: unknown): value is SpacingValue {
  if (!isRecord(value)) return false
  if (value.mode === 'token') return isMember(SPACING_TOKENS, value.value)
  if (value.mode === 'custom') return isCustomLength(value)
  return false
}

function isMaxWidthValue(value: unknown): value is MaxWidthValue {
  if (!isRecord(value)) return false
  if (value.mode === 'token') return isMember(MAX_WIDTH_TOKENS, value.value)
  if (value.mode === 'custom') return isCustomLength(value)
  return false
}

function isSemanticColor(value: unknown): value is SemanticColor {
  if (isMember(SEMANTIC_COLOR_OPTIONS, value)) return true
  return isRecord(value) && typeof value.custom === 'string'
}

function isBorderRadius(value: unknown): value is BorderRadiusToken {
  if (isMember(BORDER_RADIUS_TOKENS, value)) return true
  return isRecord(value) && typeof value.custom === 'number' && isMember(CANVAS_LENGTH_UNITS, value.unit)
}

/**
 * Frame tokens resolve straight into CSS custom properties, so an unrecognized
 * one is not a harmless extra key — it is a value the stylesheet will emit
 * verbatim into the exported document.
 */
function isWrapperOverrides(value: unknown): value is WrapperOverrides {
  if (!isRecord(value)) return false
  if (value.borderRadius !== undefined && !isBorderRadius(value.borderRadius)) return false
  if (value.shadow !== undefined && !isMember(SHADOW_TOKENS, value.shadow)) return false
  if (value.borderColor !== undefined && !isSemanticColor(value.borderColor)) return false
  if (value.backgroundColor !== undefined && !isSemanticColor(value.backgroundColor)) return false
  return true
}

function isViewportList(value: unknown): value is ViewportName[] {
  return Array.isArray(value) && value.every(entry => isMember(VIEWPORT_OPTIONS, entry))
}

function isNullablePlacement(value: unknown): value is BlockPlacementConfig | null {
  if (value === null) return true
  if (!isRecord(value)) return false
  if (value.marginTop !== undefined && !isSpacingValue(value.marginTop)) return false
  if (value.marginBottom !== undefined && !isSpacingValue(value.marginBottom)) return false
  if (value.alignSelf !== undefined && !isMember(ALIGN_SELF_OPTIONS, value.alignSelf)) return false
  if (value.widthMode !== undefined && !isMember(WIDTH_MODE_OPTIONS, value.widthMode)) return false
  if (value.maxWidth !== undefined && !isMaxWidthValue(value.maxWidth)) return false
  if (value.wrapperStyle !== undefined && !isMember(WRAPPER_STYLE_OPTIONS, value.wrapperStyle)) return false
  if (value.wrapperOverrides !== undefined && !isWrapperOverrides(value.wrapperOverrides)) return false
  if (value.hiddenViewports !== undefined && !isViewportList(value.hiddenViewports)) return false
  if (value.visibleTo !== undefined && !isMember(VISIBLE_TO_OPTIONS, value.visibleTo)) return false
  return value.canvas === undefined || isCanvasBlockGeometry(value.canvas)
}

function isCanvasSection(value: unknown): value is BrandCanvasSectionSnapshot {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (typeof value.name !== 'string') return false
  if (!Number.isInteger(value.position)) return false
  if (!isMember(KNOWN_SECTION_TYPES, value.sectionType)) return false
  if (!isNullableString(value.anchor)) return false
  if (typeof value.isHidden !== 'boolean') return false
  if (!isMember(CANVAS_COLOR_SCHEMES, value.colorScheme)) return false
  if (value.sectionRole !== null && !isMember(BRAND_CANVAS_SECTION_ROLES, value.sectionRole)) return false
  if (!isMember(CANVAS_CONTAINER_MODES, value.containerMode)) return false
  if (!isMember(BRAND_CANVAS_SPACING_SCALE, value.sectionSpaceY)) return false
  if (!isMember(BRAND_CANVAS_SPACING_SCALE, value.containerInsetX)) return false
  // Motion is pinned off, not copied: a snapshot that carries live reveal state
  // exports the pre-reveal frame, which is a blank asset, not a subtle one.
  if (value.revealPreset !== BRAND_CANVAS_REVEAL_PRESET) return false
  if (value.revealOverrides !== null) return false
  if (value.defaultBlockEntrance !== null) return false
  return isNullableRecord(value.layoutConfig)
}

function isCanvasBlock(value: unknown): value is BrandCanvasBlockSnapshot {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (typeof value.type !== 'string' || value.type.length === 0) return false
  if (!Number.isInteger(value.position)) return false
  if (!isNullableString(value.sectionId)) return false
  if (!isNullableString(value.layoutRole)) return false
  if (!isRecord(value.settings)) return false
  if (!isNullableRecord(value.options)) return false
  return isNullablePlacement(value.placement)
}

/**
 * Parses a snapshot on the way OUT of the JSON column and on the way INTO the
 * render page. Both are boundaries the type system does not cross: a row written
 * by an older serializer, or a payload that lost a field in transit, must fail
 * loudly here rather than render a plausible-looking but wrong asset.
 */
export function isBrandCanvasSnapshot(value: unknown): value is BrandCanvasSnapshot {
  if (!isRecord(value)) return false
  if (!isRecord(value.canvas)) return false
  if (!isBrandCanvasDimension(value.canvas.width) || !isBrandCanvasDimension(value.canvas.height)) return false
  // Absent (pre-layout snapshots) and null both mean "blank"; a present string
  // must be a real layout id, not "".
  if (value.layout !== undefined && value.layout !== null
    && (typeof value.layout !== 'string' || value.layout.length === 0)) return false
  if (value.layoutOverrides !== undefined && !isNullableRecord(value.layoutOverrides)) return false
  if (!Array.isArray(value.sections) || !value.sections.every(isCanvasSection)) return false
  return Array.isArray(value.blocks) && value.blocks.every(isCanvasBlock)
}

/** `undefined` when the value cannot be serialized at all (cycles, BigInt). */
function serializedLength(value: unknown): number | undefined {
  try {
    return JSON.stringify(value)?.length
  } catch {
    return undefined
  }
}

/**
 * The single parse of the override map: the HTTP body is not re-checked
 * downstream, and the render path applies whatever clears this.
 *
 * Both caps are hard rejections rather than truncations — a silently trimmed
 * override renders an asset the caller did not ask for, and the recipe would
 * then record settings the pixels never had.
 */
export function isBrandCanvasOverrides(value: unknown): value is BrandCanvasOverrides {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > BRAND_CANVAS_OVERRIDE_MAX_BLOCKS) return false
  if (!entries.every(([, settings]) => isRecord(settings))) return false
  const length = serializedLength(value)
  return length !== undefined && length <= BRAND_CANVAS_OVERRIDE_MAX_CHARS
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Returns a NEW snapshot with each named block's settings shallow-merged over
 * the approved ones. The input is never mutated: the same snapshot object is
 * rendered again for the next generation, and a mutated one would carry the
 * previous generation's copy into it.
 *
 * Detachment is UNCONDITIONAL — no overrides, an empty map and a full map all
 * return fresh section objects, fresh block objects and fresh `settings` maps.
 * A caller that cached the approved snapshot and then annotated a returned
 * block (a resolved placement, a render id) would otherwise corrupt the cache
 * for every later generation, and only on the no-overrides path.
 * One level deep, though: values INSIDE `settings` and `layoutConfig` are the
 * approved objects themselves and must be treated as read-only.
 *
 * Override keys naming blocks that are not in the snapshot are IGNORED, not an
 * error. A generation can outlive the block it targeted (a re-approval may have
 * dropped it), and failing the whole render over a stale key would break every
 * saved recipe the moment the canvas changed.
 */
export function applyCanvasOverrides(
  snapshot: BrandCanvasSnapshot,
  overrides: BrandCanvasOverrides | null | undefined,
): BrandCanvasSnapshot {
  const blocks = snapshot.blocks.map((block) => {
    // hasOwn, not a bare lookup: the map arrives from JSON, so an inherited
    // key must never be mistaken for an authored override.
    const applied = overrides && Object.hasOwn(overrides, block.id) ? overrides[block.id] : undefined
    return { ...block, settings: { ...block.settings, ...applied } }
  })

  return {
    canvas: { ...snapshot.canvas },
    // Overrides touch block settings and nothing else — the layout choice and
    // its per-page settings ride through verbatim. (Dropping them here
    // silently demoted every override repaint to the bare blank layout.)
    layout: snapshot.layout ?? null,
    layoutOverrides: snapshot.layoutOverrides ?? null,
    sections: snapshot.sections.map(section => ({ ...section })),
    blocks,
  }
}
