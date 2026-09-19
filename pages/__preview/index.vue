<script setup lang="ts">
import { computed, watch, reactive, provide, ref, onMounted, onUnmounted } from 'vue'
import { getBlockRegistry } from '~/shared/features/cms/blockRegistry'
import DynamicPage from '~/shared/features/cms/DynamicPage.vue'
import { PREVIEW_INTERACTION_KEY, type PreviewInteraction } from '~/shared/features/cms/previewInteraction'
import { PAGE_CONTEXT_KEY, resolveBlogId, toPageType, type PageContext } from '~/shared/features/cms/page-context'
import type { PageType } from '~/shared/types/templates'
import { useCmsPreview } from '~/shared/composables/useCmsPreview'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { useCssOverridesFromConfig } from '~/shared/composables/useDesignTokens'
import { usePageShell } from '~/shared/features/layout/pageShell'
import type { LayoutMetaUpdateMessage, ChildSiteConfig } from '~/shared/types/previewMessages'
import {
  buildPageEndpointParams,
  buildTemplatePageProp,
  describeFetchError,
  isTemplatedPageType,
  mergeTemplateSettings,
  pickPageTitle,
  resolveTemplateComponent,
  toPreviewState,
  type TemplatedPageResponse,
  type TemplatedPagePreviewState,
} from './templatedPagePreview'

// Layout is set to false via pages:extend hook in nuxt.config.ts
// (definePageMeta cannot be used in pages registered via pages:extend)

// Enable reactive CSS variable updates from config
useCssOverridesFromConfig()

const {
  previewConfig,
  currentPageSlug,
  selectedSectionId,
  selectedLayoutId,
  isInteractiveElement,
  initPreviewMode,
  cleanupPreviewMode,
  notifySectionClick,
  notifyLayoutClick,
  sendToEditor,
} = useCmsPreview()

const { getPage, themeName, childSites, navigation, locale } = useClientConfig()

const headerIsSticky = computed(() => (navigation.value as any)?.header?.sticky ?? true)

// Resolve active child site context based on current page slug
const activeChildSite = computed<ChildSiteConfig | null>(() => {
  const slug = currentPageSlug.value
  if (!slug) return null
  for (const [mountPath, childSite] of Object.entries(childSites.value)) {
    if (slug === mountPath || slug.startsWith(mountPath + '/')) {
      return childSite as ChildSiteConfig
    }
  }
  return null
})

// Provide child site context so layout components (MegaMenu, BrandFooter)
// use the child's navigation and theme settings instead of the parent's
provide('childSiteContext', activeChildSite)

// Registry only resolves the layout chrome (header/footer) — the page body
// renders through DynamicPage, exactly like the public site.
const registry = computed(() => getBlockRegistry(themeName.value))
const HeaderComponent = computed(() => registry.value['header']?.component ?? null)
const FooterComponent = computed(() => registry.value['footer']?.component ?? null)

// Layout meta — synced from slot props passed by each layout on its default slot.
const layoutMeta = reactive({ hasHeader: true, hasFooter: true })

// Called inside the default slot template to sync slot props into layoutMeta.
// Returns null so <component :is="syncLayoutMeta(...)"> renders nothing.
function syncLayoutMeta(hasHeader: boolean, hasFooter: boolean): null {
  layoutMeta.hasHeader = hasHeader
  layoutMeta.hasFooter = hasFooter
  return null
}

// Communicate layout meta changes to CMS
watch(
  () => ({ hasHeader: layoutMeta.hasHeader, hasFooter: layoutMeta.hasFooter }),
  (meta) => {
    const message: LayoutMetaUpdateMessage = {
      type: 'LAYOUT_META_UPDATE',
      source: 'nuxt-preview',
      hasHeader: meta.hasHeader,
      hasFooter: meta.hasFooter,
    }
    sendToEditor(message)
  },
  { immediate: true }
)

const router = useRouter()

// Initialize preview mode on mount
onMounted(() => {
  initPreviewMode()

  // Block all navigation away from /__preview — page switching is done via
  // CONFIG_UPDATE postMessages from the editor, never by URL navigation.
  // Without this guard, clicking links (e.g. header nav) inside the iframe
  // would navigate away, losing the preview postMessage config.
  const removeGuard = router.beforeEach((to) => {
    if (!to.path.startsWith('/__preview')) return false
  })
  onUnmounted(removeGuard)
})

// Cleanup on unmount
onUnmounted(() => {
  cleanupPreviewMode()
})

// Check if we have a valid config
const hasConfig = computed(() => previewConfig.value !== null)

// Get current page data — getPage() traverses nested pages (e.g. "home/[id]")
const currentPage = computed(() => {
  if (!currentPageSlug.value || !previewConfig.value) return null
  return getPage(currentPageSlug.value) ?? null
})

// --- Templated pages (articles / blog-index) ------------------------------
// These carry no blocks: their surface is a structured template component.
// DynamicPage's template branch is driven by its own fetch, which it skips in
// preview mode, so the preview has to resolve the template itself — otherwise
// selecting an article paints header + footer around nothing.
const route = useRoute()
const previewSiteId = computed(() => {
  const q = route.query.site
  return typeof q === 'string' ? q : ''
})

// Narrowed, not asserted: the value arrives from preview-config JSON, so an
// `as PageType` cast would let an unknown variant reach resolveBlogId and the
// template resolver. `toPageType` falls back to 'static', matching the snapshot
// deserializer's default for configs written before `pageType` existed.
const currentPageType = computed<PageType>(() => {
  const p = currentPage.value as Record<string, unknown> | null
  return toPageType(p?.pageType)
})

// The editor mirrors unsaved Template Settings edits onto the page it sends in
// the preview config, so they can be layered over the server-resolved settings
// without a refetch.
const draftTemplateSettings = computed<unknown>(
  () => (currentPage.value as Record<string, unknown> | null)?.templateSettings ?? null,
)

const templatedState = ref<TemplatedPagePreviewState>({ status: 'blocks' })

async function loadTemplatedPage(slug: string, pageType: string): Promise<void> {
  if (!isTemplatedPageType(pageType) || !slug) {
    templatedState.value = { status: 'blocks' }
    return
  }
  templatedState.value = { status: 'loading' }
  try {
    const res = await $fetch<TemplatedPageResponse>('/api/site-config/page', {
      params: buildPageEndpointParams({
        path: slug,
        siteId: previewSiteId.value,
        locale: locale.value,
      }),
    })
    // A page switch that landed while this request was in flight owns the state.
    if (currentPageSlug.value !== slug) return
    templatedState.value = toPreviewState(pageType, res)
  }
  catch (err) {
    if (currentPageSlug.value !== slug) return
    console.error('[preview] Failed to load templated page', slug, err)
    templatedState.value = { status: 'error', message: describeFetchError(err) }
  }
}

watch(
  [currentPageSlug, currentPageType],
  ([slug, pageType]) => { void loadTemplatedPage(slug ?? '', pageType) },
  { immediate: true },
)

const templateComponent = computed(() => {
  const state = templatedState.value
  if (state.status !== 'template') return null
  return resolveTemplateComponent(themeName.value, state.render.template.component)
})

// Remount on template identity change only — not on every settings keystroke.
const templateComponentKey = computed(() => {
  const state = templatedState.value
  if (state.status !== 'template') return ''
  return `${themeName.value}::${state.render.template.component}`
})

const templateProps = computed(() => {
  const state = templatedState.value
  if (state.status !== 'template') return null
  const render = state.render
  return {
    data: render.contentData,
    settings: mergeTemplateSettings(render.template.settings, draftTemplateSettings.value),
    media: render.media,
    related: render.related,
    page: buildTemplatePageProp({
      pageSlug: currentPageSlug.value ?? '',
      pageCfg: (currentPage.value as Record<string, unknown> | null) ?? null,
      render,
      locale: locale.value,
      title: pickPageTitle(
        (currentPage.value as Record<string, unknown> | null)?.title,
        locale.value,
      ),
    }),
  }
})

// Blocks nested INSIDE a template (e.g. the blog-index grid's ArticleList)
// resolve their blog from the page context. DynamicPage provides this for the
// block path; the template path has no DynamicPage, so provide it here or the
// grid renders "Select a blog..." instead of the articles.
const templatedPageContext = computed<PageContext>(() => {
  const cfg = (currentPage.value as Record<string, unknown> | null) ?? {}
  const pageId = typeof cfg.id === 'string' ? cfg.id : (currentPageSlug.value ?? '')
  const pageType = currentPageType.value
  const parentId = typeof cfg.parentId === 'string' ? cfg.parentId : null
  const state = templatedState.value
  return {
    pageId,
    pageType,
    parentId,
    blogId: resolveBlogId(pageType, pageId, parentId),
    templateId: state.status === 'template' ? state.render.template.id : null,
    locale: locale.value,
  }
})
provide(PAGE_CONTEXT_KEY, templatedPageContext)

// The shell contract: publish the page's theme-layout id + meta so the Nuxt
// shell's useResolvedLayout() picks the matching ThemeLayout from the manifest,
// and read back which Nuxt layout hosts it. Same call the published route
// makes, so the preview cannot frame a page differently.
const currentLayout = usePageShell({
  theme: themeName,
  layoutId: computed(() => currentPage.value?.layout),
  meta: computed(() => currentPage.value?.meta as Record<string, any> | undefined),
})

// --- Selection chrome contract -------------------------------------------
// The page body renders through DynamicPage (the SAME renderer as the public
// site — settings resolution, hiddenViewports, sections, animation). This
// provide is the only preview-specific layer: DynamicPage decorates sections
// and blocks with .preview-region chrome and reports clicks back here.
function handleRegionClick(event: MouseEvent, action: () => void) {
  const target = event.target as HTMLElement | null
  if (!target) return

  // Only left-click
  if (event.button !== 0) return

  // Cmd/Ctrl bypass - user can still use the site
  if (event.metaKey || event.ctrlKey) return

  // Let interactive elements behave normally
  if (isInteractiveElement(target)) return

  event.preventDefault()
  event.stopPropagation()

  action()
}

const previewInteraction: PreviewInteraction = {
  selectedId: computed(() => selectedSectionId.value),
  onRegionClick: (previewId, event) =>
    handleRegionClick(event, () => notifySectionClick(previewId)),
}
provide(PREVIEW_INTERACTION_KEY, previewInteraction)
</script>

<template>
  <div class="preview-container">
    <!-- Loading state: show skeleton until config received -->
    <div v-if="!hasConfig" class="preview-loading">
      <div class="preview-loading__skeleton">
        <div class="preview-loading__header" />
        <div class="preview-loading__content">
          <div class="preview-loading__block" />
          <div class="preview-loading__block preview-loading__block--short" />
          <div class="preview-loading__block" />
        </div>
        <div class="preview-loading__footer" />
      </div>
      <p class="preview-loading__text">Waiting for editor...</p>
    </div>

    <!-- Preview content: render using actual layout -->
    <NuxtLayout v-else :name="currentLayout">
      <!-- Override header slot with wrapped version for selection -->
      <template v-if="layoutMeta.hasHeader" #header>
        <div
          class="preview-region"
          :class="{ 'preview-region--selected': selectedLayoutId === 'header', 'preview-region--header-sticky': headerIsSticky }"
          @click="handleRegionClick($event, () => notifyLayoutClick('header'))"
        >
          <component :is="HeaderComponent" v-if="HeaderComponent" />
        </div>
      </template>

      <!-- Page body: the SAME renderer as the public site. Slot props from the
           layout carry hasHeader/hasFooter — sync them into layoutMeta.
           Layouts that call `<slot />` without props pass undefined, so
           normalize here. -->
      <template #default="slotProps">
        <component :is="syncLayoutMeta(slotProps?.hasHeader ?? true, slotProps?.hasFooter ?? true)" />
        <main class="preview-main">
          <!-- Templated page (article / blog-index): mount the structured
               template component. Never falls through to a blank frame —
               every non-render outcome has a visible state below. -->
          <div v-if="templatedState.status === 'loading'" class="preview-template-status">
            Loading page content…
          </div>

          <div
            v-else-if="templatedState.status === 'error'"
            class="preview-template-error"
            role="alert"
          >
            {{ templatedState.message }}
          </div>

          <component
            v-else-if="templateComponent && templateProps"
            :is="templateComponent"
            :key="templateComponentKey"
            v-bind="templateProps"
          />

          <!-- Block-rendered page: unchanged path. -->
          <DynamicPage v-else-if="currentPage" :page-id="currentPageSlug" />

          <!-- Nothing resolved for this slug in the config the editor sent.
               Say so: an empty frame reads as "this page is empty" and hides a
               real resolution failure. -->
          <div v-else class="preview-template-status" role="status">
            No content resolved for “{{ currentPageSlug || '(no page selected)' }}” in this preview.
          </div>
        </main>
      </template>

      <!-- Override footer slot with wrapped version for selection -->
      <template v-if="layoutMeta.hasFooter" #footer>
        <div
          class="preview-region"
          :class="{ 'preview-region--selected': selectedLayoutId === 'footer' }"
          @click="handleRegionClick($event, () => notifyLayoutClick('footer'))"
        >
          <component :is="FooterComponent" v-if="FooterComponent" />
        </div>
      </template>
    </NuxtLayout>
  </div>
</template>

<!-- Selection chrome is applied INSIDE DynamicPage/SectionRenderer render
     trees, so these rules must be unscoped (document-level). The preview
     route is its own document (iframe) — nothing leaks to admin/public. -->
<style>
.preview-region {
  position: relative;
  transition: outline 0.15s ease;
}

.preview-region--header-sticky {
  position: sticky;
  top: 0;
  z-index: 100;
}

/* Two rules per state, because a block region is `AnimatedBlock`'s
   `display: contents` wrapper — a boxless element. An outline on it is painted
   from the union of its descendants' fragments, which in a multi-column section
   is one rectangle spanning every column, offset from the block it marks. The
   region declares itself `--boxless` (see PREVIEW_REGION_BOXLESS_CLASS) and we
   decorate the child that does generate a box.

   Nothing here needs re-measuring on resize or late image load: an outline is
   painted by the layout engine against the live border box, unlike an
   absolutely-positioned overlay driven by cached client rects. */
.preview-region:not(.preview-region--boxless):hover,
.preview-region--boxless:hover > * {
  outline: 2px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -2px;
}

.preview-region--selected:not(.preview-region--boxless),
.preview-region--selected.preview-region--boxless > * {
  outline: 2px solid #3b82f6 !important;
  outline-offset: -2px;
}
</style>

<style scoped>
.preview-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.preview-main {
  flex: 1;
}

.preview-template-status {
  padding: 3rem 1rem;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.preview-template-error {
  padding: 1rem;
  margin: 0.5rem;
  border: 2px solid #d93025;
  border-radius: 4px;
  background: #fff4f4;
  color: #9c1411;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
}

/* Loading skeleton styles */
.preview-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.preview-loading__skeleton {
  width: 100%;
  max-width: 800px;
  padding: 1rem;
}

.preview-loading__header {
  height: 60px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 2rem;
}

.preview-loading__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-loading__block {
  height: 200px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.preview-loading__block--short {
  height: 100px;
}

.preview-loading__footer {
  height: 80px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-top: 2rem;
}

.preview-loading__text {
  margin-top: 1rem;
  color: #666;
  font-size: 14px;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
