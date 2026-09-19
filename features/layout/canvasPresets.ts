import { isRecord } from '~/shared/types/guards'
import type {
  CanvasInitialSection,
  LayoutCanvasPreset,
  LocalizedString,
  ThemeLayout,
} from '~/shared/types/layout'

/**
 * Canvas presets — the art directions a theme offers when a brand canvas is
 * created.
 *
 * A preset is an ACT performed once at creation, never a state stored anywhere:
 * choosing one sets the page's `layout` and seeds one section, and then the
 * choice is forgotten. Nothing reads a preset id back — not the row, not the
 * approved snapshot, not the page meta — because a stored label starts lying
 * the moment someone changes the layout in Page settings.
 *
 * The data therefore lives ON the theme layout it names (`theme.json` →
 * `layout.layouts[].canvasPreset`), which is what makes one marker do three
 * jobs at once — the creation radio list, the create-time allow-list, and the
 * canvas layout picker's filter — with no way for the three to drift.
 *
 * Everything here is pure and I/O-free: admin, the server create path and the
 * section-create resolver all read the SAME functions over the same manifest.
 */

/** The layout a canvas falls back to when a theme declares no presets at all. */
export const CANVAS_FALLBACK_LAYOUT_ID = 'blank'

/**
 * What a section on a canvas starts as when the layout declares no preset.
 * Edge-to-edge with no vertical rhythm: a canvas is a sheet, not a page.
 */
export const CANVAS_SECTION_FALLBACK: CanvasInitialSection = {
  containerMode: 'full-bleed',
  containerInsetX: 'none',
  sectionSpaceY: 'none',
}

const CONTAINER_MODES: readonly CanvasInitialSection['containerMode'][] = [
  'measure', 'content', 'wide', 'full-bleed',
]
const SPACING_STEPS: readonly CanvasInitialSection['sectionSpaceY'][] = [
  'none', 'sm', 'md', 'lg', 'xl',
]

export interface CanvasPresetOption {
  layoutId: string
  label: LocalizedString
  hint: LocalizedString
  isDefault: boolean
}

function isLocalizedString(value: unknown): value is LocalizedString {
  return isRecord(value)
    && Object.keys(value).length > 0
    && Object.values(value).every(v => typeof v === 'string')
}

export function isCanvasInitialSection(value: unknown): value is CanvasInitialSection {
  if (!isRecord(value)) return false
  return CONTAINER_MODES.includes(value.containerMode as CanvasInitialSection['containerMode'])
    && SPACING_STEPS.includes(value.containerInsetX as CanvasInitialSection['containerInsetX'])
    && SPACING_STEPS.includes(value.sectionSpaceY as CanvasInitialSection['sectionSpaceY'])
}

/**
 * A manifest entry is a preset only if it is COMPLETE. A half-declared marker
 * reads as "this layout offers no art direction" rather than as a preset with
 * holes — the alternative is seeding a section from `undefined` fields, which
 * lands back on the repository's `measure` / `md` defaults, i.e. the exact
 * margin the preset exists to remove.
 */
export function isLayoutCanvasPreset(value: unknown): value is LayoutCanvasPreset {
  if (!isRecord(value)) return false
  if (value.label !== undefined && !isLocalizedString(value.label)) return false
  if (!isLocalizedString(value.hint)) return false
  if (value.order !== undefined && typeof value.order !== 'number') return false
  if (value.default !== undefined && typeof value.default !== 'boolean') return false
  return isCanvasInitialSection(value.initialSection)
}

/**
 * Reads the preset off one manifest layout entry, or `null`.
 *
 * Takes `unknown` on purpose: `ThemeManifest.layout` is an untyped JSON blob,
 * so every caller is really holding parsed theme data, not a `ThemeLayout`.
 */
export function readCanvasPreset(layout: unknown): LayoutCanvasPreset | null {
  if (!isRecord(layout)) return null
  if (typeof layout.id !== 'string' || layout.id.length === 0) return null
  return isLayoutCanvasPreset(layout.canvasPreset) ? layout.canvasPreset : null
}

interface MarkedLayout {
  layout: ThemeLayout
  preset: LayoutCanvasPreset
}

function markedLayouts(layouts: readonly ThemeLayout[]): MarkedLayout[] {
  const marked: MarkedLayout[] = []
  for (const layout of layouts ?? []) {
    const preset = readCanvasPreset(layout)
    if (preset) marked.push({ layout, preset })
  }
  return marked
}

/**
 * Declaration order is NOT presentation order: `order` ascending, absent last,
 * ties broken on layout id so two themes with the same numbers always render
 * the same list.
 */
function byPresentationOrder(a: MarkedLayout, b: MarkedLayout): number {
  const ao = a.preset.order ?? Number.POSITIVE_INFINITY
  const bo = b.preset.order ?? Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return a.layout.id.localeCompare(b.layout.id)
}

/**
 * The layout id a create request resolves to.
 *
 * `null` means "an id was submitted and it is not an art direction this theme
 * offers" — the caller answers 400. There is deliberately NO silent fallback to
 * blank: handing someone a chrome-free canvas when they asked for a branded one
 * is the exact failure class this design exists to remove.
 */
export function resolveCanvasLayoutId(
  layouts: readonly ThemeLayout[],
  requested?: string,
): string | null {
  const marked = markedLayouts(layouts)

  if (requested !== undefined) {
    return marked.some(({ layout }) => layout.id === requested) ? requested : null
  }

  // First DECLARED default wins — a theme marking several is a theme.json bug,
  // and picking the first is the only answer that does not depend on sorting.
  const declaredDefault = marked.find(({ preset }) => preset.default === true)
  if (declaredDefault) return declaredDefault.layout.id

  const first = [...marked].sort(byPresentationOrder)[0]
  return first ? first.layout.id : CANVAS_FALLBACK_LAYOUT_ID
}

/**
 * The ordered art directions a theme offers. An empty array means the theme
 * ships none, and every canvas surface must then behave exactly as it did
 * before presets existed.
 */
export function canvasPresetOptions(layouts: readonly ThemeLayout[]): CanvasPresetOption[] {
  const marked = markedLayouts(layouts)
  if (marked.length === 0) return []

  // The pre-selected option is whatever the SERVER would resolve for a request
  // that names no layout, so the radio can never disagree with the create path.
  const defaultId = resolveCanvasLayoutId(layouts, undefined)

  return [...marked].sort(byPresentationOrder).map(({ layout, preset }) => ({
    layoutId: layout.id,
    label: preset.label ?? layout.label,
    hint: preset.hint,
    isDefault: layout.id === defaultId,
  }))
}

/**
 * Narrows a wire-shaped value into a `CanvasPresetOption` — what
 * `GET .../brand-canvas-presets` answers with, one entry at a time.
 *
 * The admin store trusts this rather than reading `unknown` JSON itself: a
 * malformed entry from that endpoint would otherwise become an unlabeled
 * radio button or a request for a `layoutId` the create endpoint rejects.
 */
export function isCanvasPresetOption(value: unknown): value is CanvasPresetOption {
  if (!isRecord(value)) return false
  if (typeof value.layoutId !== 'string' || value.layoutId.length === 0) return false
  if (!isLocalizedString(value.label)) return false
  if (!isLocalizedString(value.hint)) return false
  return typeof value.isDefault === 'boolean'
}

/**
 * What a section on this canvas starts as. Never returns `undefined`: a canvas
 * whose layout declares nothing still gets the edge-to-edge fallback.
 */
export function canvasSectionDefaults(
  layouts: readonly ThemeLayout[],
  layoutId: string | null,
): CanvasInitialSection {
  if (!layoutId) return { ...CANVAS_SECTION_FALLBACK }
  const match = markedLayouts(layouts).find(({ layout }) => layout.id === layoutId)
  return match ? { ...match.preset.initialSection } : { ...CANVAS_SECTION_FALLBACK }
}

/**
 * True when a section claims Full Width but still leaves a margin — a
 * combination that is a legitimate, common pattern on ordinary site pages
 * (edge-to-edge background, padded content) but almost always a mistake on a
 * canvas, where "Full Width" is read as "touches the sheet's edges". Callers
 * gate this on the page being a brand canvas; the check itself is page-type
 * agnostic.
 */
export function isCanvasInsetMismatch(
  containerMode: string,
  containerInsetX: string,
): boolean {
  return containerMode === 'full-bleed' && containerInsetX !== 'none'
}
