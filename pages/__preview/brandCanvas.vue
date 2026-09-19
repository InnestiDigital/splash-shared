<template>
  <div id="brand-stage" :style="stageStyle">
    <!-- The theme layout is what loads the theme's stylesheet (nothing is
         global), and `blank` is the chrome-free one. `snapshotReady` gates the
         mount so DynamicPage never renders against a half-installed config. -->
    <NuxtLayout v-if="snapshotReady && layoutName" :name="layoutName">
      <DynamicPage :page-id="BRAND_CANVAS_PREVIEW_PAGE_ID" :theme="themeName" />
    </NuxtLayout>
    <DynamicPage
      v-else-if="snapshotReady"
      :page-id="BRAND_CANVAS_PREVIEW_PAGE_ID"
      :theme="themeName"
    />
    <p v-if="failure" class="brand-stage__error">{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, nextTick, onMounted, onUnmounted } from 'vue'
import type { LayoutKey } from 'nuxt/app'
import { useRoute, useRouter } from 'vue-router'
import DynamicPage from '~/shared/features/cms/DynamicPage.vue'
import { getBlockRegistry } from '~/shared/features/cms/blockRegistry'
import { AVAILABLE_THEMES } from '~/shared/features/cms/themeData'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import {
  BRAND_CANVAS_PREVIEW_PAGE_ID,
  buildCanvasPreviewConfig,
  canvasFontPreloadTokens,
  orphanedBlockCount,
  pickCanvasLayoutName,
  unregisteredBlockTypes,
} from '~/shared/features/brand-studio/canvasPreviewConfig'
import { resolveBrandCanvasMode } from '~/shared/features/brand-studio/canvasRenderMode'
import { computeCanvasSnapshotRevision } from '~/shared/features/brand-studio/canvasSnapshotRevision'
import {
  canvasSnapshotFromDraftPage,
  narrowCanvasTemplate,
  unwrapAdminPage,
} from '~/shared/features/brand-studio/canvasRenderSource'
import { installStageBaseStyle, useRenderStage } from '~/shared/features/brand-studio/useRenderStage'
import { applyCanvasOverrides } from '~/shared/types/brandCanvas'
import { BRAND_RENDER_WINDOW_KEY } from '~/shared/types/brandRender'
import { isBrandCanvasOverridesMessage } from '~/shared/types/previewMessages'
import type { BrandCanvasAdminSource } from '~/shared/features/brand-studio/canvasRenderMode'
import type { RenderStageOutcome } from '~/shared/features/brand-studio/useRenderStage'
import type { BrandCanvasOverrides, BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasThemeLayer } from '~/shared/types/brandCanvasTheme'
import type {
  BrandCanvasContentSource,
  BrandCanvasPaintedMessage,
  BrandCanvasPreviewFidelity,
  BrandCanvasReadyMessage,
} from '~/shared/types/previewMessages'

/**
 * Brand Content Studio — the BRAND CANVAS render route.
 *
 * ONE route serves two callers, so the preview cannot drift from the export:
 *
 *   headless Chromium  → payload on `window.__BRAND_RENDER__`, screenshots
 *                        `#brand-stage` (`brandTemplateRenderService.ts`)
 *   admin iframe       → `?siteId=&templateId=[&draft=1]`, fetched back over
 *                        the admin session, repainted live from
 *                        `BRAND_CANVAS_OVERRIDES` messages
 *
 * The tree is painted by `DynamicPage` — the SAME renderer as the public site,
 * fed the same flat `{ sections, blocks }` shape `/api/site-config/page`
 * returns. That is the entire point of the snapshot contract: a brand template
 * is ordinary CMS content, so it must not acquire a second renderer that can
 * disagree with the first about settings resolution, placement or layouts.
 *
 * `/__preview` is load-bearing: the site-resolver middleware, the client-config
 * plugin and the web-vitals plugin all skip that prefix, so this document boots
 * with no tenant and no API traffic of its own. It is also what puts
 * `DynamicPage` in preview mode, which is how it reads its page from the
 * preview config this route installs instead of fetching one.
 *
 * The SITE THEME arrives with the input on both arms — in the payload for
 * Chromium, on the template read for the iframe — and both come from the one
 * server resolver. Nothing here derives a theme from the build, and nothing
 * here fetches `/api/site-config`: either would let the preview paint an asset
 * the export cannot reproduce. Supplying the theme layer to the preview config
 * is all the wiring type, tokens and presets need — `app.vue` already mounts
 * the three composables that turn those keys into `<head>` styles.
 *
 * Layout suppression is `meta: { layout: false }` in `nuxt.config.ts`'s
 * `pages:extend` hook — `definePageMeta` does not work for pages registered
 * that way. The theme layout is then mounted INSIDE the stage, on purpose: it
 * is what imports the theme's stylesheet.
 *
 * Fail-loud contract, the four constants `brandTemplateRenderService.ts` pins.
 * Exactly one of these lands on `<html>` and the render service waits for
 * either:
 *   data-brand-canvas-ready="true"   the canvas painted, fonts + images settled
 *   data-brand-canvas-error="…"      why no correct PNG can exist
 * plus an optional `data-brand-canvas-warnings` JSON array of degradations.
 */

installStageBaseStyle()

const route = useRoute()
const router = useRouter()
const { setPreviewConfig } = useCmsPreview()

/**
 * The site's LIVE shell — theme name, theme settings, type, tokens, motion.
 *
 * DERIVED STATE, not a setup-time constant, because it arrives with the input:
 * the payload carries it on the Chromium arm and the template read carries it
 * on the admin arm, both from the one server resolver
 * (`server/services/brand/brandCanvasTheme.ts`). Neither surface resolves a
 * theme for itself, which is what stops the preview from painting an asset the
 * export cannot reproduce. This replaces the build's `defaultTheme`, which
 * could only ever be right for a single-theme deployment.
 */
const themeLayer = ref<BrandCanvasThemeLayer | null>(null)
const themeName = computed(() => themeLayer.value?.theme ?? '')

// Keys only — the layout components themselves are registered by the
// `theme-layouts` module and mounted through <NuxtLayout>. This glob just
// answers "does this theme ship a blank layout?" without hard-coding a theme.
const themeLayoutFiles = import.meta.glob('/themes/*/layouts/*.vue')
const availableLayouts = Object.keys(themeLayoutFiles)
  .map(path => path.split('/').pop()?.replace(/\.vue$/, '') ?? '')
  .filter(name => name.length > 0)

const snapshotReady = ref(false)

// A clean render is not automatically the requested render. The admin arm can
// deliberately keep the last approved snapshot visible when a draft page is
// malformed; this verdict travels with BRAND_CANVAS_READY so the manager can
// show the useful fallback without treating it as approval evidence.
const contentSource = ref<BrandCanvasContentSource>('none')
const previewFidelity = ref<BrandCanvasPreviewFidelity>('unavailable')
const draftRevision = ref<string | null>(null)

function notifyParent(outcome: RenderStageOutcome): void {
  if (window.parent === window) return
  const message: BrandCanvasReadyMessage = {
    type: 'BRAND_CANVAS_READY',
    source: 'nuxt-preview',
    error: outcome.error,
    warnings: outcome.warnings,
    contentSource: contentSource.value,
    fidelity: previewFidelity.value,
    draftRevision: draftRevision.value,
  }
  // Same-origin, never '*': this route is only ever framed by the admin, which
  // shares its origin (it has to, or the fetch below would have no session).
  window.parent.postMessage(message, window.location.origin)
}

const { stageStyle, failure, setStageSize, warn, fail, succeed, settleStage } = useRenderStage({
  stagePrefix: 'canvas',
  onSettled: notifyParent,
})

// Derived, because the theme is not known until the input lands.
// `pickCanvasLayoutName` returns null for an empty theme, so the pre-mount
// frame renders the layout-less branch rather than a wrong layout. The matching
// warning moved into `paint()` (see there) — it has to be collected before the
// document is flagged ready, and `warn()` dedupes across repaints.
// Set by `paint()` rather than derived from `baseSnapshot`: the Chromium
// payload arm deliberately keeps `baseSnapshot` null (its overrides are
// pre-applied server-side), but its snapshot still carries a layout choice.
const snapshotLayout = ref<string | null>(null)
const snapshotLayoutOverrides = ref<Record<string, unknown> | null>(null)
const layoutName = computed<LayoutKey | null>(() =>
  pickCanvasLayoutName(availableLayouts, themeName.value, snapshotLayout.value) as LayoutKey | null)

// The theme layouts resolve their chrome through `useResolvedLayout`, which
// reads these two injections — the same pair the site preview provides. The
// snapshot's captured layout id + per-page layout settings go in verbatim, so
// a canvas's chrome resolves exactly like the page it was authored as.
provide('currentPageLayoutId', computed(() => snapshotLayout.value ?? 'blank'))
provide('currentPageMeta', computed<Record<string, unknown>>(() =>
  snapshotLayoutOverrides.value ? { layoutOverrides: snapshotLayoutOverrides.value } : {}))

/**
 * The tree BEFORE per-generation overrides, plus the live override map.
 * Kept apart so a message can repaint without refetching, and so a message that
 * arrives while the fetch is still in flight is simply applied when it lands.
 */
const baseSnapshot = ref<BrandCanvasSnapshot | null>(null)
const liveOverrides = ref<BrandCanvasOverrides | null>(null)
const liveOverrideRevision = ref(0)

/**
 * Installs the tree the renderer reads. Called again on every override message,
 * so the whole config is rebuilt rather than mutated — `DynamicPage` derives
 * its blocks from it, and a half-updated config would render a frame that is
 * neither the old content nor the new.
 *
 * Returns false when it refused to paint, so the caller stops rather than
 * settling a document that has no content.
 */
function paint(theme: BrandCanvasThemeLayer, snapshot: BrandCanvasSnapshot): boolean {
  // Fail loud BEFORE the first paint. `getThemeConfig()` THROWS for an unknown
  // theme and is reached from `useBlockSettings()` on every block, so without
  // this the page dies inside a render function — no reason on the document,
  // and the render service waits out its timeout instead of reporting why.
  if (!AVAILABLE_THEMES.includes(theme.theme)) {
    fail(
      `This build has no theme "${theme.theme}" (it ships: ${AVAILABLE_THEMES.join(', ')}), `
      + 'so the canvas cannot be painted the way the site looks.',
    )
    return false
  }

  // The live theme means a live block registry: a snapshot approved under one
  // theme, rendered by a site since switched to another, legitimately reaches
  // here with types this theme has no component for. Loud, not fatal.
  for (const type of unregisteredBlockTypes(snapshot, Object.keys(getBlockRegistry(theme.theme)))) {
    warn(`Block type "${type}" is not registered in theme "${theme.theme}" and rendered as a placeholder.`)
  }

  snapshotLayout.value = snapshot.layout ?? null
  snapshotLayoutOverrides.value = snapshot.layoutOverrides ?? null
  if (!pickCanvasLayoutName(availableLayouts, theme.theme, snapshot.layout ?? null)) {
    warn(
      `Theme "${theme.theme}" ships no "${snapshot.layout ?? 'blank'}" layout, so the canvas painted without the theme stylesheet.`,
    )
  }

  // The only SILENT failure in the whole canvas-preset chain: see
  // `orphanedBlockCount` for why this is `0` until a section exists.
  const orphanCount = orphanedBlockCount(snapshot)
  if (orphanCount > 0) {
    warn(
      `${orphanCount} block(s) sit outside any section and will not render. `
      + 'Open the canvas in the editor and move them into a section.',
    )
  }

  setPreviewConfig(buildCanvasPreviewConfig(theme, snapshot))
  snapshotReady.value = true
  return true
}

/** False when there was nothing to paint, or `paint()` refused. */
function repaintWithOverrides(): boolean {
  const base = baseSnapshot.value
  const theme = themeLayer.value
  // Both are installed by the same `loadFromAdmin` return, so neither can be
  // set without the other; the check is what lets an override message that
  // arrives before the fetch lands simply do nothing.
  if (!base || !theme) return false
  return paint(theme, applyCanvasOverrides(base, liveOverrides.value))
}

function notifyOverridePainted(revision: number, error: string | null): void {
  if (window.parent === window) return
  const message: BrandCanvasPaintedMessage = {
    type: 'BRAND_CANVAS_PAINTED',
    source: 'nuxt-preview',
    revision,
    error,
  }
  window.parent.postMessage(message, window.location.origin)
}

async function settleOverridePaint(revision: number): Promise<void> {
  if (!repaintWithOverrides()) {
    notifyOverridePainted(revision, 'The canvas was not ready to apply these edits.')
    return
  }
  const stage = document.getElementById('brand-stage')
  if (!stage) {
    notifyOverridePainted(revision, 'The canvas stage disappeared before these edits could be painted.')
    return
  }
  const layer = themeLayer.value
  await settleStage(stage, layer ? canvasFontPreloadTokens(layer) : [])
  // A newer update replaced this tree while assets were settling. Only the
  // revision that still owns the visible pixels may be acknowledged.
  if (liveOverrideRevision.value === revision) notifyOverridePainted(revision, null)
}

function handleMessage(event: MessageEvent): void {
  // Same-origin only. The tenant preview accepts sibling subdomains because the
  // admin edits it across a domain boundary; this route is framed by the admin
  // itself, on the admin's own origin, so anything else is not the editor.
  if (event.origin !== window.location.origin) return
  if (!isBrandCanvasOverridesMessage(event.data)) return
  liveOverrides.value = event.data.overrides
  liveOverrideRevision.value = event.data.revision
  const revision = event.data.revision
  void settleOverridePaint(revision).catch((error: unknown) => {
    if (liveOverrideRevision.value !== revision) return
    notifyOverridePainted(revision, error instanceof Error ? error.message : String(error))
  })
}

/**
 * The admin arm. Two reads at most, both over the caller's own admin session:
 * the template row (authoritative canvas size + approved snapshot) and, for
 * `?draft=1`, the canvas page's live tree.
 *
 * A draft that cannot be serialized falls back to the approval and SAYS SO in
 * the settled verdict. Silently reporting that substitute tree as ready-to-
 * approve would let the author snapshot content they never actually reviewed.
 */
interface AdminSnapshotResult {
  snapshot: BrandCanvasSnapshot
  contentSource: 'draft' | 'approved'
  fidelity: 'exact' | 'fallback'
  draftRevision: string | null
}

async function loadFromAdmin(source: BrandCanvasAdminSource): Promise<AdminSnapshotResult | null> {
  const query = source.presetId ? `?presetId=${encodeURIComponent(source.presetId)}` : ''
  const raw: unknown = await $fetch(
    `/api/admin/s/${source.siteId}/brand-templates/${source.templateId}${query}`,
  )
  const template = narrowCanvasTemplate(raw)
  if (!template) {
    fail('The template could not be read — the API answered something this build does not recognize.')
    return null
  }

  setStageSize(template.canvas.width, template.canvas.height)
  // The server resolved this with the SAME function the export uses, so the
  // iframe and the PNG agree by construction. A missing or malformed theme
  // already failed `narrowCanvasTemplate` above — there is no fallback shell.
  themeLayer.value = template.theme
  // The resolver's own degradations (e.g. a never-published site's draft-shell
  // fallback) — the export arm merges the same list into its render result,
  // so the iframe must say it too, not just paint over it.
  for (const warning of template.warnings) warn(warning)

  if (source.draft) {
    const page: unknown = await $fetch(`/api/admin/s/${source.siteId}/pages/${template.pageId}`)
    const draft = canvasSnapshotFromDraftPage(template.canvas, unwrapAdminPage(page))
    if (draft) {
      return {
        snapshot: draft,
        contentSource: 'draft',
        fidelity: 'exact',
        draftRevision: await computeCanvasSnapshotRevision(draft),
      }
    }
  }

  if (!template.snapshot) {
    fail('This template has no approved canvas yet, so there is nothing to render.')
    return null
  }

  if (
    template.snapshot.canvas.width !== template.canvas.width
    || template.snapshot.canvas.height !== template.canvas.height
  ) {
    warn(
      `The approved canvas is ${template.snapshot.canvas.width}×${template.snapshot.canvas.height} but the `
      + `template is ${template.canvas.width}×${template.canvas.height} — approve it again to match.`,
    )
  }

  return {
    snapshot: template.snapshot,
    contentSource: 'approved',
    fidelity: source.draft ? 'fallback' : 'exact',
    draftRevision: null,
  }
}

onMounted(async () => {
  window.addEventListener('message', handleMessage)

  // Links inside blocks must not navigate the stage away from itself — in the
  // admin iframe that would replace the canvas with a 404, and the render
  // service would time out waiting for a document that no longer exists.
  const removeGuard = router.beforeEach((to) => {
    if (!to.path.startsWith('/__preview')) return false
  })
  onUnmounted(removeGuard)

  try {
    const mode = resolveBrandCanvasMode(window[BRAND_RENDER_WINDOW_KEY], route.query)

    if (mode.kind === 'unresolvable') {
      fail(mode.reason)
      return
    }

    if (mode.kind === 'payload') {
      // Overrides are ALREADY applied server-side (`buildPayload`), so the
      // snapshot in hand is the tree to paint. Re-applying `payload.overrides`
      // here would be a second chance for the two sides to disagree — which is
      // also why `baseSnapshot` stays null on this arm: there is no
      // pre-override tree here, so nothing can ask for a repaint.
      setStageSize(mode.payload.width, mode.payload.height)
      contentSource.value = 'render-payload'
      previewFidelity.value = 'exact'
      // `isBrandCanvasRenderPayload` already validated the theme layer, so this
      // is the parsed value, not a re-guess.
      themeLayer.value = mode.payload.theme
      if (!paint(mode.payload.theme, mode.payload.snapshot)) return
    } else {
      const result = await loadFromAdmin(mode.source)
      if (!result) return
      contentSource.value = result.contentSource
      previewFidelity.value = result.fidelity
      draftRevision.value = result.draftRevision
      baseSnapshot.value = result.snapshot
      // Any override message that arrived during the fetch is applied here —
      // which is why the listener is installed before the first await.
      if (!repaintWithOverrides()) return
    }

    await nextTick()
    const stage = document.getElementById('brand-stage')
    if (!stage) {
      fail('The stage element disappeared before the canvas could settle.')
      return
    }

    // The theme's own faces, force-loaded before `fonts.ready` decides. Without
    // this the ready signal can beat a face the layout only just requested and
    // the PNG ships in the fallback stack — the exact failure the format arm
    // was already guarding against and the canvas arm was not.
    const layer = themeLayer.value
    await settleStage(stage, layer ? canvasFontPreloadTokens(layer) : [])
    succeed()
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error))
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})
</script>

<!-- Base stage styling is injected by `installStageBaseStyle()`
     (`useRenderStage.ts`), the single source for the element-screenshot
     geometry (origin, no chrome, no scrollbar) both the Chromium payload arm
     and the admin iframe arm of this route render against. -->
