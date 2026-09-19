import { isRecord } from '~/shared/types/guards'
import { getRuntimeBlockSchemas } from '~/shared/features/cms/blockSchemasRuntime'
import { transformRichtextFields } from '~/shared/tiptap/transformRichtextFields'
import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import type { RenderStageFontToken } from '~/shared/features/brand-studio/useRenderStage'
import type { ClientConfig, PreviewPage } from '~/shared/types/previewMessages'

/**
 * Brand Content Studio — feeding an approved canvas to the SITE's renderer.
 *
 * `DynamicPage` is the only block renderer in this codebase, and it takes no
 * tree: it reads one from the client config, by page id. On a `/__preview/**`
 * route that config is the preview config, which is why a canvas is expressed
 * as a one-page `ClientConfig` here instead of being handed to a second,
 * canvas-only renderer. Settings resolution, placement wrappers, section
 * layouts, viewport visibility and the block registry then behave exactly as
 * they do on the public site — because they ARE the public site's.
 *
 * ── Why the theme layer is spread in whole ───────────────────────────────────
 * `app.vue` mounts on EVERY route, this one included, and unconditionally calls
 * `useCssOverridesFromConfig()`, `useFontFaces()` and `useTypographyPresets()`.
 * All three are `computed` over `useClientConfig().config`, which prefers the
 * preview config on any `/__preview` path — the ref `setPreviewConfig()` writes.
 * So supplying the site's real theme keys IS the whole wiring: token custom
 * properties, `@font-face` rules and preset CSS are injected into `<head>` by
 * machinery that already exists, with no canvas-specific injection anywhere.
 *
 * Both surfaces get the identical layer from the identical server resolver (the
 * render payload for Chromium, the template read for the admin iframe), which
 * is what keeps the preview and the exported PNG from drifting.
 */

/**
 * The page id the canvas is registered under. No slash: `getPage()` splits on
 * `/` to walk nested pages, so a segmented id would send it looking for a child
 * tree that does not exist.
 */
export const BRAND_CANVAS_PREVIEW_PAGE_ID = 'brand-canvas'

/**
 * The DEFAULT layout: a brand asset is the blocks and nothing else unless the
 * author says otherwise. A canvas page may pick a different theme layout (the
 * same choice any site page has — that is how theme chrome like an accent bar
 * reaches an asset), and the snapshot carries that choice; absent/null falls
 * back here, which is what keeps a site header out of an exported PNG by
 * default.
 */
const BRAND_CANVAS_LAYOUT_ID = 'blank'

/**
 * The intersection return type is not decoration. `ClientConfig` declares no
 * `themeVars`, `spacingTokens` or `motion` — `useDesignTokens` reads all three
 * off it anyway — so an object literal typed as bare `ClientConfig` would fail
 * the excess-property check on exactly the keys this feature exists to deliver.
 * The intersection stays assignable to `setPreviewConfig(config: ClientConfig)`
 * and needs no edit outside this feature. Declaring the three on `ClientConfig`
 * is the tidier fix and belongs to whoever owns `previewMessages.ts`.
 */
export function buildCanvasPreviewConfig(
  theme: BrandCanvasThemeLayer,
  snapshot: BrandCanvasSnapshot,
): ClientConfig & BrandCanvasThemeLayer {
  // Richtext values arrive as TipTap JSON — the snapshot copies the draft tree
  // verbatim, and an override form emits what its editor holds. Theme blocks
  // bind richtext through `v-html="asHtml(...)"`, which drops any non-string,
  // and a localization helper handed a bare doc falls through to the literal
  // string "doc". The site pipeline solves this at publish/preview with
  // `transformRichtextFields`; this is the canvas pipeline's ONE equivalent
  // point — every paint (first mount and each override repaint) passes through
  // here, so snapshots approved before this transform existed are fixed at
  // read time, not by re-approval.
  const schemaByType = getRuntimeBlockSchemas(theme.theme)
  const resolveSchema = (type: string) => schemaByType[type] ?? null
  const validPresetKeys = new Set<string>(
    Array.isArray(theme.typographyPresets)
      ? theme.typographyPresets
          .map(preset => preset?.key)
          .filter((key): key is string => typeof key === 'string')
      : [],
  )

  // `_previewId` is the editor's transient block identity, which the renderer
  // prefers for keys and selection. A snapshot block already has its durable
  // uuid, so the two are the same value — and stable across an override
  // repaint, which is what stops Vue from remounting every block on each
  // keystroke in the admin's override form.
  const blocks = snapshot.blocks.map(block => ({
    ...block,
    settings: transformRichtextFields(
      block.settings ?? {},
      resolveSchema(block.type),
      validPresetKeys,
      resolveSchema,
    ),
    // The snapshot spells "no options" as an explicit null; a preview block
    // spells it as an absent key. Same meaning, and normalizing here is what
    // keeps this config assignable to the shape the renderer already declares.
    options: block.options ?? undefined,
    _previewId: block.id,
  }))

  const page: PreviewPage = {
    title: {},
    layout: snapshot.layout ?? BRAND_CANVAS_LAYOUT_ID,
    dynamic: false,
    pageType: 'brand-canvas',
    // `useResolvedLayout` reads per-page layout settings at
    // `meta.layoutOverrides` — the snapshot's captured copy goes exactly
    // where the site renderer already looks for it.
    meta: snapshot.layoutOverrides ? { layoutOverrides: snapshot.layoutOverrides } : {},
    blocks,
    sections: snapshot.sections.map(section => ({ ...section })),
    // Explicitly empty rather than omitted: the renderer reads `scenes ?? []`,
    // but motion is pinned off on every snapshot section and saying so here
    // keeps "this canvas animates nothing" a property of the config, not an
    // accident of a default.
    scenes: [],
  }

  return {
    // theme, themeSettings, themeVars, typography, presets, roles,
    // spacingTokens, layout, motion — the site's real shell, spread whole so a
    // key added to the layer reaches the renderer without a second edit here.
    ...theme,
    // Explicitly empty rather than inherited: the blank layout renders no
    // chrome, and site navigation is not part of the theme layer precisely so
    // it can never end up in an exported asset.
    navigation: {},
    pages: { [BRAND_CANVAS_PREVIEW_PAGE_ID]: page },
    childSites: {},
  }
}

/** A `typography.variants[]` entry, as far as font preloading needs to know. */
function variantToken(entry: unknown): RenderStageFontToken | null {
  if (!isRecord(entry)) return null

  const family = typeof entry.family === 'string' && entry.family.length > 0
    ? entry.family
    : (typeof entry.name === 'string' ? entry.name : null)
  if (!family) return null

  // A variable font declares no `weight`; its wght axis default is the instance
  // the browser will actually render at, so that is what must be force-loaded.
  const axes = isRecord(entry.axes) ? entry.axes : null
  const wght = axes && isRecord(axes.wght) ? axes.wght : null
  const weight = typeof entry.weight === 'number'
    ? entry.weight
    : (wght && typeof wght.default === 'number' ? wght.default : 400)

  return { fontFamily: family, fontWeight: String(weight) }
}

/** An uploaded `typography.fontFaces[]` entry. */
function faceToken(entry: unknown): RenderStageFontToken | null {
  if (!isRecord(entry)) return null
  if (typeof entry.name !== 'string' || entry.name.length === 0) return null
  const weight = typeof entry.weight === 'number' ? entry.weight : 400
  return { fontFamily: entry.name, fontWeight: String(weight) }
}

/**
 * The font families this canvas DECLARES `@font-face` rules for — what
 * `settleStage` must force-load before waiting on `document.fonts.ready`,
 * or the PNG can ship in the fallback stack.
 *
 * Derived from exactly the two arrays `useFontFaces()` turns into `@font-face`
 * rules, so the preload list can never name a family the document did not
 * declare. A `typographyPresets` family with no declared face is deliberately
 * excluded: it resolves to a system font, which `document.fonts.load()` cannot
 * help with and which would only add a spurious warning.
 */
export function canvasFontPreloadTokens(theme: BrandCanvasThemeLayer): RenderStageFontToken[] {
  const typography = theme.typography
  if (!typography) return []

  const variants = Array.isArray(typography.variants) ? typography.variants : []
  const fontFaces = Array.isArray(typography.fontFaces) ? typography.fontFaces : []

  const seen = new Set<string>()
  const tokens: RenderStageFontToken[] = []
  for (const token of [...variants.map(variantToken), ...fontFaces.map(faceToken)]) {
    if (!token) continue
    const key = `${token.fontWeight} ${token.fontFamily}`
    if (seen.has(key)) continue
    seen.add(key)
    tokens.push(token)
  }
  return tokens
}

/**
 * The Nuxt layout FILE to mount the canvas inside — the ONLY way theme CSS
 * reaches this document (nothing is loaded through Nuxt's global `css` array;
 * each surface's root component imports its own sheets).
 *
 * A theme declares more layout IDS in its manifest than it ships FILES for
 * (`scale-canvas`, `editorial`, …): the id's real behavior — frame scaling,
 * chrome elements, background — is resolved by `LayoutShell` from the
 * manifest, reading the id off the page provides, whatever file hosts it.
 * The site preview hosts such ids in the theme's default shell; the canvas
 * hosts them in the chrome-free `blank` file instead, so a manifest-only
 * layout gains its configured frame and chrome elements without inheriting a
 * site header nobody chose. `null` (paint unstyled, and warn) only when the
 * theme ships no blank file at all — the loud kind of wrong.
 */
export function pickCanvasLayoutName(
  available: readonly string[],
  theme: string,
  layout?: string | null,
): string | null {
  if (theme.length === 0) return null
  const id = typeof layout === 'string' && layout.length > 0 ? layout : BRAND_CANVAS_LAYOUT_ID
  const exact = `${theme}-${id}`
  if (available.includes(exact)) return exact
  const blank = `${theme}-${BRAND_CANVAS_LAYOUT_ID}`
  return available.includes(blank) ? blank : null
}

/**
 * Block types the snapshot references that this build has no component for.
 *
 * The renderer already fails loud on one (a red placeholder plus a console
 * error), but a console error is invisible to headless Chromium and to an
 * author looking at an iframe. Surfacing the list as a warning is how "the
 * export is missing a block" reaches a human.
 */
export function unregisteredBlockTypes(
  snapshot: BrandCanvasSnapshot,
  registeredTypes: readonly string[],
): string[] {
  const known = new Set(registeredTypes)
  const missing = new Set<string>()
  for (const block of snapshot.blocks) {
    if (!known.has(block.type)) missing.add(block.type)
  }
  return [...missing].sort()
}

/**
 * How many blocks sit outside any section — the only SILENT failure in the
 * canvas-preset chain. `DynamicPage`'s `hasSections` computed switches off
 * the flat-render branch the moment a snapshot has ≥1 section, and a block
 * with `sectionId === null` then simply stops rendering: no error, no
 * placeholder. `0` sections means every block is still flat-rendered, so
 * there is nothing to warn about regardless of `sectionId`.
 */
export function orphanedBlockCount(snapshot: BrandCanvasSnapshot): number {
  if (snapshot.sections.length === 0) return 0
  return snapshot.blocks.filter(block => block.sectionId === null).length
}
