<script setup lang="ts">
import { computed, inject, provide, ref, shallowRef, markRaw, onMounted, watch, h, defineComponent, defineAsyncComponent, type PropType, type Ref } from 'vue'
// Explicit, like PageHead — the auto-import is not resolvable under vitest.
import { useHead } from '#imports'
import { getBlockRegistry } from './blockRegistry'
import { getRuntimeBlockSchemas } from '~/shared/features/cms/blockSchemasRuntime'
import { useViewport } from '~/shared/composables/useViewport'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'
import { resolveBlockVisibility } from '~/shared/features/cms/blockVisibility'
import { useBlockSettings, SETTINGS_RESOLUTION_LOCALE } from '~/shared/composables/useBlockSettings'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import { providePageData, type CallApiFn } from '~/shared/composables/usePageData'
import { useAuthState } from '~/shared/composables/useAuthState'
import AnimationEngineProvider from './animation/AnimationEngineProvider.vue'
import AnimatedBlock from './animation/AnimatedBlock.vue'
import PageHead from './PageHead.vue'
import { extractFaqEntries } from './faqStructuredData'
import PlacementWrapper from './placement/PlacementWrapper.vue'
import { presetRegistry } from './animation/presets'
import SectionRenderer from './SectionRenderer.vue'
import { loadTemplateComponent } from './templateLoader'
import type { BlocksByRole } from '~/shared/types/sectionTypes'
import type { ResolvedSeo } from '~/shared/types/seo'
import type { MediaRecord } from '~/shared/types/articles'
import { getSectionTypeSchema } from '~/shared/features/cms/sectionSchemas'
import {
  LAYOUT_INTERACTION_BLOCK_ID,
  LAYOUT_INTERACTION_CONFIG_VERSION,
} from '~/shared/features/layout-interaction/injection-keys'
import { PAGE_CONTEXT_KEY, resolveBlogId, type PageContext } from './page-context'
import {
  PREVIEW_INTERACTION_KEY,
  PREVIEW_REGION_BOXLESS_CLASS,
  PREVIEW_REGION_CLASS,
  type PreviewInteraction,
} from './previewInteraction'

/**
 * `{ click: fn }` → `{ onClick: fn }`.
 *
 * The template path spells its listeners with `v-on="createListeners(...)"`,
 * which the compiler normalises for us. A render function gets no such help:
 * raw event names on a vnode are inert props, so the listeners have to be
 * spelled the way Vue's prop matcher reads them.
 */
function toHandlerProps(
  listeners: Record<string, (...args: any[]) => void>,
): Record<string, (...args: any[]) => void> {
  const out: Record<string, (...args: any[]) => void> = {}
  for (const [name, handler] of Object.entries(listeners)) {
    const camel = name.replace(/-(\w)/g, (_, char: string) => char.toUpperCase())
    out[`on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`] = handler
  }
  return out
}

// Stable wrapper component for blocks rendered via blocksByRole (hero/editorial/gallery sections).
// Defined once per DynamicPage instance — NOT inside buildBlocksByRole — so component identity
// is stable across re-renders. Vue uses component definition object identity for reconciliation;
// a new defineComponent() call per block per render forces unmount+remount every cycle.
const AnimatedBlockWrapper = defineComponent({
  name: 'AnimatedBlockWrapper',
  inheritAttrs: false,
  props: {
    blockId: { type: String as PropType<string>, default: '' },
    blockType: { type: String as PropType<string>, required: true as const },
    targetsSchema: { type: Object as PropType<Record<string, { selector?: string }>>, default: () => ({}) },
    motionHints: { type: Object as PropType<Record<string, any>>, default: undefined },
    blockComponent: { type: [Object, Function] as PropType<any>, required: true as const },
    blockProps: { type: Object as PropType<Record<string, any>>, default: () => ({}) },
    // Editor-preview identity: when set AND a PreviewInteraction is provided
    // (only inside /__preview), selection chrome is spread onto AnimatedBlock's
    // root element — no extra DOM node, so section-layout CSS (grid children,
    // gaps) is byte-identical between preview and public render.
    previewId: { type: String as PropType<string>, default: '' },
    // Schema-declared block events, and the ref registration the parent needs to
    // hand a component instance back through `onBlockEvent`. Both used to exist
    // only on the stacked default-slot path in the template below; the layout
    // engine renders EVERY role — `_default` included — through this wrapper, so
    // without them a schema-driven stacked section would silently lose every
    // block event and every `componentRef` (contract §8b, cutover).
    blockListeners: {
      type: Object as PropType<Record<string, (...args: any[]) => void>>,
      default: () => ({}),
    },
    registerRef: {
      type: Function as PropType<((el: unknown) => void) | null>,
      default: null,
    },
  },
  setup(wrapperProps) {
    // Provide the per-block id under a stable injection key so blocks that
    // opt into the layout-interaction substrate (e.g. ScatterCollage) can
    // consume identity without threading an explicit prop through every
    // intermediate wrapper. Non-consuming blocks ignore it.
    provide(LAYOUT_INTERACTION_BLOCK_ID, computed(() => wrapperProps.blockId))
    const previewInteraction = inject<PreviewInteraction | null>(PREVIEW_INTERACTION_KEY, null)
    return () => {
      const chrome = previewInteraction && wrapperProps.previewId
        ? {
            // `--boxless`: this chrome lands on AnimatedBlock's `display: contents`
            // wrapper, which generates no box. See PREVIEW_REGION_BOXLESS_CLASS.
            class: [
              PREVIEW_REGION_CLASS,
              PREVIEW_REGION_BOXLESS_CLASS,
              { 'preview-region--selected': previewInteraction.selectedId.value === wrapperProps.previewId },
            ],
            'data-preview-section-id': wrapperProps.previewId,
            onClick: (e: MouseEvent) => previewInteraction.onRegionClick(wrapperProps.previewId, e),
          }
        : {}
      return h(AnimatedBlock, {
        blockId: wrapperProps.blockId,
        blockType: wrapperProps.blockType,
        targetsSchema: wrapperProps.targetsSchema,
        motionHints: wrapperProps.motionHints,
        ...chrome,
      }, {
        default: () => h(wrapperProps.blockComponent, {
          ...wrapperProps.blockProps,
          ...toHandlerProps(wrapperProps.blockListeners),
          ref: wrapperProps.registerRef ?? undefined,
        })
      })
    }
  }
})

const props = defineProps<{
  pageId: string
  theme?: string
}>()

const {
  getPage,
  themeName,
  config,
  loadPageBlocks,
  getPageScenes,
  getPageSections,
  getPageSeo,
  getPageTemplate,
  getPageContentData,
  getPageMedia,
  getPageRelated,
  getPageIdentity,
  locale,
} = useClientConfig()
const { isInPreviewMode } = useCmsPreview()

// Editor-preview selection chrome (provided only by /__preview; null on the
// public site). See previewInteraction.ts.
const previewInteraction = inject<PreviewInteraction | null>(PREVIEW_INTERACTION_KEY, null)

// Preview identity for an entity: editor blocks/sections carry _previewId;
// fall back to the persistent id.
function previewKey(entity: any): string {
  return entity?._previewId || entity?.id || ''
}

// Selection-chrome attrs for template paths (sections, stacked/flat blocks).
// Empty object outside the editor preview, so v-bind is a no-op on the
// public site.
function previewChrome(id: string): Record<string, any> {
  if (!previewInteraction || !id) return {}
  // No `--boxless` here: these paths bind onto SectionRenderer's <section> and
  // PlacementWrapper's <div>, both of which generate a real box.
  return {
    class: [
      PREVIEW_REGION_CLASS,
      { 'preview-region--selected': previewInteraction.selectedId.value === id },
    ],
    'data-preview-section-id': id,
    onClick: (e: MouseEvent) => previewInteraction.onRegionClick(id, e),
  }
}

// Inject auth state from the theme layout for auth-aware block settings resolution
const isAuthenticated = useAuthState()
const authState = computed(() => isAuthenticated.value ? 'auth' : 'guest')

// --- Page-level pre-fetch ---
// Pages can declare `prefetch: ['method-a', 'method-b']` in their config.
// Results are provided via inject so child components can consume without duplicate calls.
const { data: pageData, loading: pageLoading, executePrefetch } = providePageData()

// Inject the callApi function provided by the theme layout
const injectedCallApi = inject<CallApiFn | null>('theme:callApi', null)
const activeTheme = computed(() => props.theme || themeName.value)
const registry = computed(() => getBlockRegistry(activeTheme.value))
const pageCfg = computed(() => getPage(props.pageId))

// --- Config splitting: fetch blocks on demand ---
// In preview mode, blocks come via postMessage (full config) — use directly.
// In public mode, shell config has empty blocks — fetch per-page via API.
const fetchedBlocks = ref<any[] | null>(null)
const fetchedScenes = ref<any[] | null>(null)
const fetchedSeo = ref<ResolvedSeo | null>(null)
// Structured-template (Blog-2 V2) state. Populated by fetchBlocks from the
// /api/site-config/page response when the resolved article uses a template.
// `fetchedTemplate` doubles as the branch flag — null means render via
// blocks (legacy path); non-null means mount the template component.
const fetchedTemplate = ref<{
  id: string
  label: string
  component: string
  version: string
  schemaVersion: string
  settings: Record<string, any>
} | null>(null)
const fetchedContentData = ref<Record<string, any> | null>(null)
const fetchedMedia = ref<Record<string, MediaRecord>>({})
// Sibling article summaries — surfaced to article templates (e.g.
// article-gallery-sticky's related-content carousel) so they can
// render the related strip without a second fetch.
const fetchedRelated = ref<any[]>([])
// Article publication date, byline and parent index slug. None of it is
// available from the shell config's page tree (it holds only static and
// blog-index pages), so it arrives with the template payload from the page
// endpoint.
const fetchedIdentity = ref<{
  publishedAt: string | null
  author: { userId: string | null; name: string | null; displayName: string | null }
  parentSlug: string | null
} | null>(null)
const blocksLoading = ref(false)

const activeBlocks = computed(() => {
  // Preview mode: blocks are in the full config from postMessage
  if (isInPreviewMode()) {
    return pageCfg.value?.blocks || []
  }
  // Public mode: use fetched blocks, fall back to config blocks (for backwards compat)
  if (fetchedBlocks.value !== null) {
    return fetchedBlocks.value
  }
  // Show config blocks if any exist (backwards compat / non-split mode)
  const configBlocks = pageCfg.value?.blocks || []
  if (configBlocks.length > 0) return configBlocks
  return []
})

// Section data from page config
const fetchedSections = ref<any[] | null>(null)

// Sections live in the SHELL config (`/api/site-config`) while their blocks come
// from the page endpoint (`/api/site-config/page`) one round-trip later. Painting
// the shell's section frames first produced two layouts ~80ms apart — empty
// sections, then full ones — which measured CLS 1.39 on the reference site
// (`main` 1395px → 6698px, footer entering the viewport at y=60 and leaving
// again). Hold the block render until the page fetch settles so there is exactly
// one layout. `fetchedBlocks === null` means "not attempted yet"; the error path
// sets `[]`, so a failed fetch still releases the gate.
//
// Waiting on the fetch alone was not enough. Every block component is a
// `defineAsyncComponent` (blockRegistry is code-split), so the sections still
// painted at header height for one frame while their chunks resolved, and grew
// on the next — a residual CLS of 0.93 measured after the fetch gate shipped
// (`main` 1594px → 6698px at t=838ms → t=890ms). `blockChunksReady` closes that
// window by awaiting each block type's chunk loader before the gate opens.
const blockChunksReady = ref(false)

// Concrete components for the block types this page renders, keyed by type.
//
// Awaiting the chunk loaders was NOT enough on its own. `registry[type]
// .component` is a `defineAsyncComponent` wrapper, and such a wrapper resolves
// on a microtask even when its module is already in memory: the first render
// after the gate opens still emits placeholder nodes, and a second render
// replaces them. Whether the browser paints between those two renders is a race
// with the frame boundary. Measured on the deployed site across three loads —
// two went straight from the height reservation to the full 6698px layout
// (CLS 0), the third painted the 1594px stub at t=905ms and the full layout at
// t=917ms (CLS 0.934, the same signature as before the gate existed).
//
// Rendering the awaited module directly removes the second render, so the
// layout is correct on the first one and there is no window to lose.
const warmedComponents = shallowRef<Record<string, any>>({})

// allSettled, not all: a chunk that fails to load must still release the gate,
// or the page reserves forever. A type missing from `warmedComponents` falls
// back to the async wrapper, and an unresolvable type still renders
// DynamicPage's visible error placeholder.
async function warmBlockChunks(blocks: any[]) {
  const types = [...new Set(blocks.map((b: any) => b?.type).filter(Boolean))]
  const settled = await Promise.allSettled(
    types.map(async (type) => {
      const load = registry.value[type]?.load
      if (typeof load !== 'function') return null
      const mod = await load()
      return markRaw(mod?.default ?? mod)
    }),
  )

  const warmed: Record<string, any> = {}
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) warmed[types[i]!] = result.value
  })
  warmedComponents.value = warmed
}

const pageReady = computed(() =>
  isInPreviewMode() ||
  ((fetchedBlocks.value !== null || (pageCfg.value?.blocks?.length ?? 0) > 0) && blockChunksReady.value)
)

const pageSections = computed(() => {
  if (isInPreviewMode()) {
    return pageCfg.value?.sections || []
  }
  // Public mode: sections come alongside blocks in fetched page data
  return fetchedSections.value ?? pageCfg.value?.sections ?? []
})

const visibleSections = computed(() =>
  pageSections.value
    .filter((s: any) => !s.isHidden)
    // A section whose every block is absent (or hidden at the current
    // viewport / auth state) must contribute nothing to the page — its
    // sectionSpaceY padding would otherwise render as dead vertical space.
    // The editor preview keeps empty sections so they remain drop targets.
    .filter((s: any) => isInPreviewMode() || sectionBlocks(s.id).length > 0)
    .sort((a: any, b: any) => a.position - b.position)
)

// --- Block visibility (per-breakpoint + per-auth-state show/hide) ---
// Two axes, both resolved live and both client-side:
//   `placement.hiddenViewports` — viewports at which the block must not render
//   `placement.visibleTo`       — 'auth' | 'guest' audience restriction
// Viewport comes from the actual width, so the editor's device switcher
// (preview iframe at 375 / 768 / full) reflects the public site's decision.
// Auth state comes from `useAuthState`, declared by the theme layout.
//
// PERSONALIZATION, NOT SECURITY — both variants are present in the payload.
// The rule itself lives in blockVisibility.ts so it is unit-testable.
const { innerWidth: viewportWidth } = useViewport()
const currentViewport = computed<'desktop' | 'tablet' | 'mobile'>(() => {
  const w = viewportWidth.value
  if (w <= BREAKPOINTS.md) return 'mobile'
  if (w < BREAKPOINTS.lg) return 'tablet'
  return 'desktop'
})
function isBlockVisible(block: any): boolean {
  return resolveBlockVisibility(block?.placement, currentViewport.value, isAuthenticated.value)
}

// Group blocks by sectionId for section-aware rendering. Blocks hidden at the
// current viewport are filtered here so both the role-mapped and stacked
// section paths (and auto-entrance scene generation) skip them. `getBlockIndex`
// keys off the unfiltered `activeBlocks`, so prop lookups stay aligned.
function sectionBlocks(sectionId: string) {
  return activeBlocks.value
    .filter((b: any) => b.sectionId === sectionId && isBlockVisible(b))
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
}

// Role resolution algorithm (spec Section 2):
// 1. Blocks with recognized role for section type → that region
// 2. Multiple blocks in same role → by position order (already sorted by sectionBlocks)
// 3. Block with incompatible role → treated as unroled (_default)
// 4. Unroled blocks → _default flow at end
// 5. section-heading hard-capped at single (enforced in layout component)
function buildBlocksByRole(sectionId: string, sectionType?: string): BlocksByRole {
  const sBlocks = sectionBlocks(sectionId)
  const byRole: BlocksByRole = { _default: [] }

  // Get valid roles for this section type
  let validRoles: Set<string> | null = null
  if (sectionType) {
    try {
      const schema = getSectionTypeSchema(themeName.value, sectionType as any)
      if (schema?.layoutSlots?.length) {
        validRoles = new Set(schema.layoutSlots.map(s => s.role))
      }
    } catch { /* unknown theme — all roles fall to default */ }
  }

  for (const block of sBlocks) {
    const blockIndex = getBlockIndex(block)
    let role = block.layoutRole || '_default'
    // Incompatible role → treated as unroled (spec rule 4)
    if (role !== '_default' && validRoles && !validRoles.has(role)) {
      role = '_default'
    }
    if (!byRole[role]) byRole[role] = []

    const blockKey = getBlockRefKey(block, blockIndex)

    // Use the stable AnimatedBlockWrapper defined at component level — not a new
    // defineComponent() per block. Pass block-specific data via props so Vue can
    // reconcile without unmounting on re-renders.
    byRole[role].push({
      block,
      component: AnimatedBlockWrapper,
      props: {
        blockId: block.id || blockKey,
        blockType: block.type,
        targetsSchema: getTargetsSchema(block.type),
        motionHints: getMotionHints(block.type),
        blockComponent: resolveComponent(block.type),
        blockProps: getResolvedProps(blockIndex),
        previewId: previewInteraction ? previewKey(block) : '',
        // Same listener + ref wiring the stacked default-slot path carries in
        // the template. Threaded here rather than duplicated per layout so it
        // reaches every role of every section type, hand-written or engine.
        blockListeners: createListeners(block, blockIndex),
        registerRef: (el: unknown) => { if (el) blockRefs.value[blockKey] = el },
      },
    })
  }
  return byRole
}

// Memoized map of sectionId → BlocksByRole. Prevents buildBlocksByRole from
// running on every parent re-render; recomputes only when reactive deps change
// (visibleSections, activeBlocks via sectionBlocks, resolvedBlockProps, registry).
// Combined with wrapperCache: no unmount unless the block list or identity
// actually changes. SPL-075.
const blocksByRoleMap = computed<Record<string, BlocksByRole>>(() => {
  const map: Record<string, BlocksByRole> = {}
  for (const section of visibleSections.value) {
    map[section.id] = buildBlocksByRole(section.id, section.sectionType)
  }
  return map
})

// A brand canvas is one coordinate plane, even if legacy/imported content
// carries more than one section. Merge every visible section's resolved blocks
// into the first section host so z-order and percentage geometry remain global
// instead of resetting (or being clipped) at each section boundary.
const canvasBlocksByRole = computed<BlocksByRole>(() => ({
  _default: visibleSections.value.flatMap(section =>
    Object.values(blocksByRoleMap.value[section.id] ?? {}).flat(),
  ),
}))

// Get block index in the full activeBlocks array (for resolvedBlockProps lookup)
function getBlockIndex(block: any): number {
  return activeBlocks.value.findIndex((b: any) => b.id === block.id || b === block)
}

// Compute editorial-split section indexes for "alternate" shellSide mode.
// Only editorial-split sections are counted, so interspersed hero/gallery/stacked
// sections don't affect the alternation pattern.
const editorialSplitIndexMap = computed(() => {
  const map: Record<string, number> = {}
  let idx = 0
  for (const section of visibleSections.value) {
    if (section.sectionType === 'editorial-split') {
      map[section.id] = idx++
    }
  }
  return map
})
provide('editorialSplitIndexMap', editorialSplitIndexMap)

// Published configVersion for layout-interaction substrate: used by blocks
// (e.g. ScatterCollage) as part of the session key so saved author overrides
// invalidate on publish. Kept as a reactive computed so consumers observe
// updates when the client config is reloaded after a publish.
const layoutInteractionConfigVersion: Ref<string | number | undefined> = computed(
  () => (config.value as any)?.configVersion,
)
provide(LAYOUT_INTERACTION_CONFIG_VERSION, layoutInteractionConfigVersion)

// Page context for descendant blocks (article rendering, breadcrumbs, etc.).
// Source of truth: the active page object from getPage(props.pageId). The
// pageId in the context is the prop (used as the lookup key) since pageCfg
// itself does not always carry an explicit `id` field in older configs.
// blogId is derived: blog-index → own id, article → parentId, else null.
const pageContext = computed<PageContext>(() => {
  const p: any = pageCfg.value
  const pageType = p?.pageType ?? 'static'
  const parentId = p?.parentId ?? null
  return {
    pageId: p?.id ?? props.pageId,
    pageType,
    parentId,
    blogId: resolveBlogId(pageType, p?.id ?? props.pageId, parentId),
    templateId: p?.templateId ?? null,
    locale: locale.value,
  }
})
provide(PAGE_CONTEXT_KEY, pageContext)

const isCanvasPage = computed(() => pageContext.value.pageType === 'brand-canvas')
const renderedSections = computed(() =>
  isCanvasPage.value ? visibleSections.value.slice(0, 1) : visibleSections.value,
)

// Check if page uses sections
const hasSections = computed(() => pageSections.value.length > 0)

// Theme-level motion defaults (duration, easing, reducedMotion)
const themeMotionDefaults = computed(() => {
  return (config.value as any)?.motion ?? {}
})

// --- Animation scenes ---
// Explicit scenes from editor (preview or fetched).
const explicitScenes = computed(() => {
  if (isInPreviewMode()) {
    return pageCfg.value?.scenes ?? []
  }
  return fetchedScenes.value ?? []
})

// Auto-generate entrance scenes for blocks that lack an explicit intersection scene.
// Uses section.defaultBlockEntrance → theme motion.defaultEntrance → null (no animation).
const pageScenes = computed(() => {
  // A canvas is exported as one deterministic frame. Suppress both explicit
  // scenes and theme-generated entrances so Chromium can never capture a
  // partially faded, translated, or looping layer.
  if (isCanvasPage.value) return []

  const explicit = explicitScenes.value as any[]
  if (!explicit && !pageSections.value.length) return []

  // Build set of block IDs that have ANY explicit animation scene
  // (entrance, scroll, hover, loop — any type). Blocks with any explicit
  // scene skip auto-entrance. This means selecting "None" on entrance
  // and deleting the scene works: if the block still has scroll/loop scenes,
  // auto-entrance won't regenerate. If it has no scenes at all, auto-entrance
  // applies the theme default (which is the correct "inherit" behavior).
  const blocksWithAnimation = new Set<string>()
  for (const scene of explicit) {
    for (const entry of scene.entries ?? []) {
      if (entry.target?.entityType === 'block') {
        blocksWithAnimation.add(entry.target.entityId)
      }
    }
    // Also check trigger anchor (covers blocks targeted by trigger but not entries)
    const anchor = scene.trigger?.anchor
    if (anchor && typeof anchor === 'object' && anchor.entityType === 'block') {
      blocksWithAnimation.add(anchor.entityId)
    }
  }

  const themeDefault = themeMotionDefaults.value?.defaultEntrance as string | undefined
  const autoScenes: any[] = []

  for (const section of pageSections.value) {
    const presetId = section.defaultBlockEntrance || themeDefault
    if (!presetId) continue

    const factory = presetRegistry[presetId]
    if (!factory) {
      console.warn(
        `[DynamicPage] Unknown entrance preset "${presetId}" on section "${section.id}". ` +
        `Auto-entrance skipped. Available: ${Object.keys(presetRegistry).join(', ')}`,
      )
      continue
    }

    const blocks = sectionBlocks(section.id)
    const sectionBlockIds = blocks.map((b: any) => b.id).filter(Boolean) as string[]
    // Section choreography (SPL-117) attached to every auto-entrance scene
    // in this section so the engine can compute per-block delays from the
    // visual order. Per-section choreographyMeta wins; theme
    // motion.defaultChoreography supplies the site-wide default so EVERY
    // section staggers, not just explicitly-seeded ones. `none` fast-paths.
    const choreMeta = (section as any).choreographyMeta
      ?? themeMotionDefaults.value?.defaultChoreography
    const chore = choreMeta && choreMeta.mode !== 'none'
      ? {
          sectionId: section.id,
          meta: choreMeta,
          orderedBlockIds: sectionBlockIds,
        }
      : undefined

    // Reveal pacing (theme motion config, both optional):
    // - entranceDelay: ms of stillness before the FIRST block of a group
    //   reveals — entering the viewport should feel noticed, not instant.
    // - entranceThreshold: how much of the block must be visible before the
    //   entrance triggers (IO threshold; 0 fired at the first pixel).
    const entranceDelay = Number(themeMotionDefaults.value?.entranceDelay ?? 0) || 0
    const entranceThreshold = Number(themeMotionDefaults.value?.entranceThreshold ?? 0) || 0

    for (const block of blocks) {
      const blockIndex = getBlockIndex(block)
      const blockId = block.id || block._previewId || `${block.type}-${blockIndex}`
      if (!blockId || blocksWithAnimation.has(blockId)) continue

      const preset = factory()
      autoScenes.push({
        id: `auto-entrance-${blockId}`,
        pageId: props.pageId,
        versionId: 'auto',
        trigger: {
          type: 'intersection',
          anchor: { entityType: 'block', entityId: blockId, part: 'root' },
          once: true,
          ...(entranceThreshold > 0 ? { threshold: entranceThreshold } : {}),
        },
        entries: [{
          id: `auto-entrance-entry-${blockId}`,
          sceneId: `auto-entrance-${blockId}`,
          target: { entityType: 'block', entityId: blockId, part: 'root' },
          keyframes: preset.keyframes,
          // MUST stay 0: the choreography resolver treats a non-zero
          // position.ms as explicit authored timing and skips staggering.
          // The base reveal pause travels via defaults.entranceDelay instead.
          position: { type: 'absolute', ms: 0 },
          duration: preset.duration,
          easing: preset.easing,
          presetId: preset.presetId,
          presetVersion: preset.presetVersion,
        }],
        ...(entranceDelay > 0 ? { defaults: { entranceDelay } } : {}),
        ...(chore ? { sectionChoreography: chore } : {}),
      })
    }
  }

  return autoScenes.length ? [...explicit, ...autoScenes] : explicit
})

// Get animation targets schema for a block type from the block schemas registry.
// Returns the targets object from the block's settings.json, or {} if none declared.
function getTargetsSchema(blockType: string): Record<string, { selector?: string }> {
  try {
    const schemas = getRuntimeBlockSchemas(activeTheme.value)
    const schema = schemas[blockType]
    return schema?.targets ?? {}
  } catch {
    return {}
  }
}

// Get motionHints from the block's schema (settings.json).
// Returns undefined if no hints are declared for the block type.
function getMotionHints(blockType: string): Record<string, any> | undefined {
  try {
    const schemas = getRuntimeBlockSchemas(activeTheme.value)
    const schema = schemas[blockType]
    return schema?.motionHints ?? undefined
  } catch {
    return undefined
  }
}

async function fetchBlocks() {
  if (isInPreviewMode()) return
  if (!props.pageId) return

  blocksLoading.value = true
  try {
    const version = config.value?.configVersion
    fetchedBlocks.value = await loadPageBlocks(props.pageId, version)
    // Scenes, sections, SEO, and structured-template fields are cached by
    // loadPageBlocks — read from cache into reactive refs.
    fetchedScenes.value = getPageScenes(props.pageId, version)
    fetchedSections.value = getPageSections(props.pageId, version)
    fetchedSeo.value = getPageSeo(props.pageId, version)
    fetchedTemplate.value = getPageTemplate(props.pageId, version)
    fetchedContentData.value = getPageContentData(props.pageId, version)
    fetchedMedia.value = getPageMedia(props.pageId, version)
    fetchedRelated.value = getPageRelated(props.pageId, version)
    fetchedIdentity.value = getPageIdentity(props.pageId, version)
  } catch (err) {
    console.warn('[DynamicPage] Failed to load blocks for page:', props.pageId, err)
    fetchedBlocks.value = []
    fetchedScenes.value = []
    fetchedSections.value = []
    fetchedSeo.value = null
    fetchedTemplate.value = null
    fetchedContentData.value = null
    fetchedIdentity.value = null
    fetchedMedia.value = {}
    fetchedRelated.value = []
  } finally {
    blocksLoading.value = false
    // After the catch, so a failed fetch still opens the gate on an empty page
    // rather than leaving the height reservation up forever.
    await warmBlockChunks(fetchedBlocks.value ?? pageCfg.value?.blocks ?? [])
    blockChunksReady.value = true
  }
}

// SEO: prefer the API-resolved SEO from /api/site-config/page (full precedence
// chain via seoService.resolveSeoForPage). Fall back to a synthesized
// ResolvedSeo built from pageCfg for preview mode (where no fetch happens) and
// for graceful degradation when an older server build doesn't return `seo`.
const siteName = computed(() => (config.value as any)?.themeSettings?.siteName || '')

// Tenant favicon. The setting holds either a ready asset URL (what a blueprint
// seeds) or a media id (what the theme editor's image picker stores). Only the
// URL form is usable here — resolving an id needs the media map, which this
// surface does not carry — so an id is ignored rather than emitted as a
// nonsense href, and the platform default in nuxt.config.ts keeps applying.
const faviconUrl = computed<string | null>(() => {
  const value = (config.value as any)?.themeSettings?.favicon
  if (typeof value !== 'string' || value === '') return null
  return value.startsWith('/') || value.startsWith('http') ? value : null
})

function pickLocalized(map: any): string {
  if (!map) return ''
  if (typeof map === 'string') return map
  return map['en-US'] || Object.values(map)[0] || ''
}

// Locale-aware resolver for structured-data extraction: prefer the page's
// content locale, then en-US, then any value. Plain strings pass through.
function localizeForSeo(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const map = value as Record<string, string>
    return map[locale.value] || map['en-US'] || Object.values(map)[0] || ''
  }
  return ''
}

// Harvest Q&A pairs from any `faq-accordion` blocks on the page so PageHead can
// emit a schema.org FAQPage (Google FAQ rich result). Empty when the page has
// no FAQ block — buildStructuredData then omits the node entirely.
const faqEntries = computed(() =>
  extractFaqEntries(activeBlocks.value as any[], localizeForSeo),
)

const pageSeo = computed<ResolvedSeo | null>(() => {
  // Server-resolved SEO is the source of truth when present.
  if (fetchedSeo.value) return fetchedSeo.value

  // Fallback: synthesize from pageCfg. Used in preview mode and when the
  // server hasn't sent `seo` (older deploys, blocks-only fetches).
  const cfg = pageCfg.value
  if (!cfg) return null

  // Mirror the server resolver's brand-suffix template (" — {siteName}"), incl.
  // the "already contains brand" guard, so this preview/degraded fallback emits
  // the same <title> shape as the authoritative /api/site-config/page path.
  const baseTitle = pickLocalized(cfg.title)
  const brand = siteName.value
  const alreadyBranded = brand && baseTitle.toLowerCase().includes(brand.toLowerCase())
  const title = baseTitle
    ? (brand && !alreadyBranded ? `${baseTitle} — ${brand}` : baseTitle)
    : (brand || '')
  const description = pickLocalized(cfg.meta?.description) || null

  return {
    title,
    description,
    ogImageUrl: null,
    noIndex: !!cfg.noIndex,
    canonicalUrl: cfg.canonicalUrl ?? '',
    extra: {},
  }
})

// Layout event handler (injected from parent layout)
const onBlockEvent = inject<
    ((payload: {
      pageId: string
      block: any
      eventName: string
      args: any[]
    }) => void) | null
>('layout:onBlockEvent', null)

// Block component refs — keyed by stable previewId or type+index to handle block reordering
const blockRefs = ref<Record<string, any>>({})

// Compute resolved props for all blocks reactively
// This calls useBlockSettings once per block in setup, not on every render
const resolvedBlockProps = computed(() => {
  const blocks = activeBlocks.value
  return blocks.map((block) => {
    const { resolvedSettings } = useBlockSettings(block.type, block.settings || {}, SETTINGS_RESOLUTION_LOCALE, authState.value)
    const resolved = { ...resolvedSettings.value }

    // Thread the block's stable identity through as a prop. Blocks that adopt
    // the layout-interaction substrate (e.g. ScatterCollage) need this to key
    // preview-bridge messages. Injection is the primary path, but props are a
    // reliable fallback when the provide chain doesn't reach a given render
    // path. Kept as `blockId` (prop name) rather than `id` to avoid colliding
    // with DOM id semantics or Vue's special `id` attr behavior.
    if (block.id) {
      resolved.blockId = block.id
    }

    // Add all root-level block properties except 'type' and 'settings' (already processed)
    for (const [key, value] of Object.entries(block)) {
      if (key !== 'type' && key !== 'settings' && key !== 'id') {
        resolved[key] = value
      }
    }

    // Blocks may opt into preview-only behavior (e.g. BreadcrumbNav renders a
    // stub trail because the iframe has no real route hierarchy).
    if (isInPreviewMode()) {
      resolved.isPreview = true
    }

    return resolved
  })
})

// --- LCP image discovery ---
// The LCP element on a content page is the first section's image, and on this
// theme it is painted as a CSS `background-image` written from resolved block
// settings. The preload scanner cannot see it: measured on the deployed site,
// the hero request started at 962ms against a 268ms TTFB — 694ms of pure
// resource load delay, because the URL is not known until
// /api/site-config -> /api/site-config/page -> block render has completed.
//
// Emitting the preload from the resolved settings breaks the image out of that
// chain: it is requested the moment the page config lands, in parallel with the
// block chunks, instead of after they render. Without this, gating the render
// on the chunk loaders (see `blockChunksReady`) would push the image request
// even later.
//
// Candidates are schema-derived (`type: 'image'` settings) rather than
// hardcoded per block type, and drawn only from the FIRST visible section, so a
// theme can change its hero block without this going stale. Capped at two, so a
// mis-guess wastes at most one extra request.
const MAX_LCP_PRELOADS = 2

const lcpImageHrefs = computed<string[]>(() => {
  if (isInPreviewMode()) return []
  const firstSection = visibleSections.value[0]
  if (!firstSection) return []

  let schemas: Record<string, any>
  try {
    schemas = getRuntimeBlockSchemas(activeTheme.value)
  } catch {
    return []
  }

  const hrefs: string[] = []
  for (const block of sectionBlocks(firstSection.id)) {
    const imageSettingIds = (schemas[block.type]?.settings ?? [])
      .filter((s: any) => s?.type === 'image' && s?.id)
      .map((s: any) => s.id as string)
    if (!imageSettingIds.length) continue

    const resolved = resolvedBlockProps.value[getBlockIndex(block)] ?? {}
    for (const id of imageSettingIds) {
      const href = resolved[id]
      // Only same-origin/relative paths. A data: URI is already inline and a
      // cross-origin URL would need its own crossorigin handling to be reused
      // rather than double-fetched.
      if (typeof href === 'string' && href.startsWith('/') && !hrefs.includes(href)) {
        hrefs.push(href)
        if (hrefs.length >= MAX_LCP_PRELOADS) return hrefs
      }
    }
  }
  return hrefs
})

useHead(computed(() => ({
  link: lcpImageHrefs.value.map(href => ({
    rel: 'preload',
    as: 'image',
    href,
    fetchpriority: 'high',
  })),
})))

// Cache of placeholder components keyed by missing type, so each unknown type
// reuses the same component identity instead of remounting on every render.
const unknownBlockPlaceholders: Record<string, any> = {}

function makeUnknownBlockPlaceholder(type: string) {
  if (unknownBlockPlaceholders[type]) return unknownBlockPlaceholders[type]
  unknownBlockPlaceholders[type] = {
    name: `UnknownBlock_${type}`,
    render() {
      return h(
        'div',
        {
          class: 'dynamic-page-unknown-block',
          style: 'padding:1rem;margin:0.5rem 0;border:2px solid #d93025;background:#fff4f4;color:#9c1411;font-family:monospace;font-size:14px;border-radius:4px;',
        },
        `[DynamicPage] Unknown block type "${type}" — check block registry / *.settings.json`,
      )
    },
  }
  return unknownBlockPlaceholders[type]
}

// Resolve component from block registry by type.
// Fail loud: an unknown type almost always means the registry drifted from
// content (missing settings.json, typo, removed component). A silent null
// used to produce blank pages that were mistaken for real bugs. We now log a
// prominent error and render a visible red placeholder so the problem is seen.
function resolveComponent(type: string) {
  const entry = registry.value[type]
  if (!entry) {
    const available = Object.keys(registry.value).sort().join(', ')
    console.error(
      `[DynamicPage] Unknown block type "${type}" for theme "${activeTheme.value}". ` +
      `Available types: ${available}`,
    )
    return makeUnknownBlockPlaceholder(type)
  }
  // Prefer the already-awaited module over the async wrapper — see
  // `warmedComponents`. Preview mode never warms, so it keeps the wrapper.
  return warmedComponents.value[type] ?? entry.component
}

// Get resolved props for a block by index (from precomputed cache)
function getResolvedProps(blockIndex: number) {
  return resolvedBlockProps.value[blockIndex] || {}
}

// Generate stable ref key for a block
function getBlockRefKey(block: any, index: number): string {
  return (block._previewId || `${block.type}-${index}`)
}

// Build event listeners for all events declared in the block's schema entry
function createListeners(block: any, blockIndex: number) {
  const listeners: Record<string, (...args: any[]) => void> = {}
  const entry = registry.value[block.type]
  const rawEvents: Array<string | { name: string }> = entry?.events || []

  // Normalize: events can be strings or objects with a `name` property
  const events = rawEvents.map(e => typeof e === 'string' ? e : e.name)

  for (const eventName of events) {
    listeners[eventName] = (...args: any[]) => {
      if (onBlockEvent) {
        const refKey = getBlockRefKey(block, blockIndex)
        onBlockEvent({
          pageId: props.pageId,
          block: {
            ...block,
            componentRef: blockRefs.value[refKey],
          },
          eventName,
          args,
        })
      }
    }
  }

  return listeners
}

// --- Fetch blocks and execute prefetch on mount ---
onMounted(async () => {
  // Fetch blocks for public mode (skipped in preview)
  await fetchBlocks()

  const methods = pageCfg.value?.prefetch as string[] | undefined
  if (!methods?.length || !injectedCallApi) return
  await executePrefetch(methods, injectedCallApi)
})

// Re-fetch blocks when pageId changes (SPA navigation)
watch(() => props.pageId, () => {
  blockChunksReady.value = false
  warmedComponents.value = {}
  fetchedBlocks.value = null
  fetchedScenes.value = null
  fetchedSections.value = null
  fetchedSeo.value = null
  fetchedTemplate.value = null
  fetchedContentData.value = null
  fetchedMedia.value = {}
  fetchedRelated.value = []
  fetchBlocks()
})

// --- Structured-template branch (Blog-2 V2) ---
// When the page endpoint resolved an article using a V2 template, swap the
// block-render output for the named template component. The component is
// async-loaded via templateLoader (path-validated, theme-scoped). Falls back
// to the legacy block render whenever template/contentData are missing —
// preview mode never sets these so no behaviour change there.
const templateData = computed<{
  component: any
  data: Record<string, any>
  settings: Record<string, any>
  media: Record<string, MediaRecord>
  related: any[]
} | null>(() => {
  const t = fetchedTemplate.value
  const c = fetchedContentData.value
  if (!t || !c) return null
  const theme = activeTheme.value
  const componentPath = t.component
  return {
    component: defineAsyncComponent(() => loadTemplateComponent(theme, componentPath)),
    data: c,
    settings: t.settings ?? {},
    media: fetchedMedia.value ?? {},
    related: fetchedRelated.value ?? [],
  }
})
</script>

<template>
  <AnimationEngineProvider :scenes="pageScenes" :motion-defaults="themeMotionDefaults">
    <PageHead v-if="pageSeo" :seo="pageSeo" :locale="locale" :site-name="siteName" :favicon-url="faviconUrl" :faq="faqEntries" />

    <!-- Height reservation while the page endpoint is in flight. Keeps the
         footer below the fold so it never paints into the viewport and then
         leaves it. A page whose real content is shorter than one viewport will
         still shift the footer up once when this is removed — it shifts today
         too, and reserving the true height needs a server-side measurement we
         do not have. -->
    <div v-if="!pageReady" class="dynamic-page__reserve" aria-hidden="true" />

    <!-- Structured-template render (Blog-2 V2). Mounted when the page endpoint
         returned `template + contentData`; pageContext (provided above) lets
         the template read locale/page identity without an explicit prop. -->
    <component
      v-else-if="templateData"
      :is="templateData.component"
      :data="templateData.data"
      :settings="templateData.settings"
      :media="templateData.media"
      :related="templateData.related"
      :page="{
        id: pageCfg?.id ?? props.pageId,
        slug: pageCfg?.slug ?? '',
        title: pickLocalized(pageCfg?.title),
        publishedAt: fetchedIdentity?.publishedAt ?? pageCfg?.publishedAt ?? null,
        author: fetchedIdentity?.author ?? pageCfg?.author ?? { userId: null, name: null, displayName: null },
        seo: pageSeo,
        parentId: pageCfg?.parentId ?? null,
        parentSlug: fetchedIdentity?.parentSlug ?? null,
        pageType: pageCfg?.pageType ?? 'static',
        locale: locale,
      }"
    />
    <!-- NB: `locale` above is the content-locale string here — <script setup>
         auto-unwraps refs in template expressions, so do NOT write `locale.value`
         (that reads `.value` off the unwrapped string → undefined). -->


    <!-- Legacy block render: section-aware then flat. Skipped entirely when
         the structured-template branch above takes over. -->
    <template v-else>
      <template v-if="hasSections">
        <SectionRenderer
          v-for="section in renderedSections"
          :key="section.id"
          :section="section"
          :blocks-by-role="isCanvasPage ? canvasBlocksByRole : blocksByRoleMap[section.id]"
          :theme-name="themeName"
          v-bind="previewChrome(section.id)"
        >
          <!-- Slot is only consumed by StackedSectionLayout. Guard with v-if to avoid
               creating unused slot closures (and their reactive dependency tracking) for
               hero / editorial-split / gallery sections which render exclusively from
               blocksByRole and have no <slot> outlet. -->
          <!-- PlacementWrapper honors the Placement panel (spacing, width,
               align) for stacked blocks — the other section types wrap their
               roled blocks in it inside their layout components. -->
          <template v-if="section.sectionType === 'stacked'">
            <PlacementWrapper
              v-for="block in sectionBlocks(section.id)"
              :key="getBlockRefKey(block, getBlockIndex(block))"
              :placement="block.placement"
              v-bind="previewChrome(previewKey(block))"
            >
              <AnimatedBlock
                :block-id="block.id || getBlockRefKey(block, getBlockIndex(block))"
                :block-type="block.type"
                :targets-schema="getTargetsSchema(block.type)"
                :motion-hints="getMotionHints(block.type)"
              >
                <component
                  :ref="(el: any) => { if (el) blockRefs[getBlockRefKey(block, getBlockIndex(block))] = el }"
                  :is="resolveComponent(block.type)"
                  v-bind="getResolvedProps(getBlockIndex(block))"
                  v-on="createListeners(block, getBlockIndex(block))"
                />
              </AnimatedBlock>
            </PlacementWrapper>
          </template>
        </SectionRenderer>
      </template>

      <!-- Legacy flat rendering (no sections) -->
      <template v-else>
        <template v-for="(block, i) in activeBlocks" :key="getBlockRefKey(block, i)">
        <PlacementWrapper
            v-if="isBlockVisible(block)"
            :placement="block.placement"
            v-bind="previewChrome(previewKey(block))"
        >
          <AnimatedBlock
              :block-id="block.id || getBlockRefKey(block, i)"
              :block-type="block.type"
              :targets-schema="getTargetsSchema(block.type)"
              :motion-hints="getMotionHints(block.type)"
          >
            <component
                :ref="(el: any) => { if (el) blockRefs[getBlockRefKey(block, i)] = el }"
                :is="resolveComponent(block.type)"
                v-bind="getResolvedProps(i)"
                v-on="createListeners(block, i)"
            />
          </AnimatedBlock>
        </PlacementWrapper>
        </template>
      </template>
    </template>
  </AnimationEngineProvider>
</template>

<style scoped>
/* svh, not vh: on mobile the vh unit resolves against the largest viewport, so
   a 100vh reservation over-reserves by the toolbar height and the collapse
   shifts the footer up. */
/* Divided by the layout scale, because this element renders INSIDE
   `.layout-scale-content`, which carries `transform: scale(var(--layout-scale))`
   in scale mode. A bare `100svh` is authored in unscaled content pixels and
   then painted at `100svh × scale` — at 1350px wide against a 1440px design
   width that is 940 × 0.9375 = 881px, which is what `#main-content` actually
   measured. The reservation cleared the fold only because the unscaled header
   above it made up the last pixel; at 1280×720 it did not, the footer painted
   at y=700 inside a 720px viewport, and shifted out when content arrived.

   `min(..., 1)` guards the divisor: `maxScale` is theme-configurable, and a
   scale above 1 would otherwise make this reserve LESS than a viewport.
   Over-reserving is harmless here (the footer simply sits further below the
   fold); under-reserving is the bug. */
.dynamic-page__reserve {
  min-height: calc(100svh / min(var(--layout-scale, 1), 1));
}
</style>
