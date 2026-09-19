<!--
  /__preview/article — realtime structured-article preview SPA route.

  Loaded inside an iframe by `ArticlePreviewPane.vue` on the article edit page.
  Communication is via postMessage:

    Parent → iframe   { source: 'article-preview', payload: { contentData?, templateSettings?, slug?, title?, excerpt?, seo? } }
    iframe → parent   { source: 'article-preview', type: 'ready' }   (once on mount)

  Render flow:
    1. On mount, post 'ready' to parent.
    2. On every payload received, POST it to the admin preview endpoint.
    3. Endpoint returns the structured render (template + contentData + media).
    4. Mount the template Vue component via templateLoader (the SAME loader
       used in production by DynamicPage's structured-template branch), inside
       the theme shell the published article renders in. The resulting surface
       carries the same header / footer / frame as the live route.

  The route is registered via `pages:extend` in `nuxt.config.ts` with
  `meta: { layout: false }`: the theme shell is mounted explicitly below
  (like /__preview does) rather than by Nuxt, because which shell hosts the
  article is only known once the endpoint has answered with its theme.
-->
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadTemplateComponent } from '~/shared/features/cms/templateLoader'
import { adminFetch } from '~/admin/utils/adminFetch'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { useCssOverridesFromConfig } from '~/shared/composables/useDesignTokens'
import { usePageShell } from '~/shared/features/layout/pageShell'
import type { PageLayoutOverrides } from '~/shared/types/layout'
import type { MediaRecord, ArticleRelatedSummary } from '~/shared/types/articles'

// Layout is disabled via pages:extend hook (`meta: { layout: false }`).

interface PreviewArticle {
  id: string
  siteId: string
  slug: string
  locale: string
  title: string | Record<string, string>
  excerpt: string | Record<string, string> | null
  featuredImageId: string | null
  parentId: string | null
  parentTitle: string | null
  pageType: 'article'
  publishedAt: string | null
  authorUserId: string | null
  authorName: string | null
}

interface PreviewTemplate {
  id: string
  label: string
  component: string
  version: string
  schemaVersion: string
  settings: Record<string, any>
}

interface PreviewPage {
  id: string
  slug: string
  title: string
  publishedAt: string | null
  author: { userId: string | null; name: string | null; displayName: string | null }
  parentId: string | null
  pageType: 'article'
  locale: string
  seo: {
    title: string
    description: string | null
    ogImageUrl: string | null
    noIndex: boolean
    canonicalUrl: string
    extra: Record<string, unknown>
  }
}

interface PreviewResponse {
  article: PreviewArticle
  template: PreviewTemplate
  contentData: Record<string, any>
  media: Record<string, MediaRecord>
  relatedArticles: ArticleRelatedSummary[]
  page: PreviewPage
  /** Shell frame the published article resolves — see resolveArticleShellLayout. */
  layout: { id: string, overrides: PageLayoutOverrides | null }
  theme: string
}

interface PreviewPayload {
  contentData?: Record<string, unknown>
  templateSettings?: Record<string, unknown>
  slug?: string
  title?: string | Record<string, string>
  excerpt?: string | Record<string, string> | null
  seo?: {
    metaTitle?: Record<string, string> | null
    metaDescription?: Record<string, string> | null
    ogImageId?: string | null
    noIndex?: boolean
  }
}

const route = useRoute()
const siteId = computed(() => String(route.query.siteId ?? ''))
const articleId = computed(() => String(route.query.articleId ?? ''))

const data = ref<PreviewResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
// A chrome failure is not a render failure: the article still shows, framed by
// whatever the theme falls back to. Surfaced so it can't pass for "this article
// has no header".
const chromeError = ref<string | null>(null)

// Cache the most recent payload so we can refetch on demand (e.g. media list
// changes triggered an alt-text refresh) without losing draft state.
let lastPayload: PreviewPayload = {}

async function refresh(payload: PreviewPayload = lastPayload) {
  if (!siteId.value || !articleId.value) {
    error.value = 'Missing siteId or articleId'
    loading.value = false
    return
  }
  lastPayload = payload
  loading.value = true
  error.value = null
  try {
    const res = await adminFetch<PreviewResponse>(
      `/api/admin/s/${siteId.value}/articles/${articleId.value}/preview`,
      {
        method: 'POST',
        body: payload,
      },
    )
    data.value = res
  } catch (err: any) {
    const msg = err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Preview failed'
    error.value = msg
  } finally {
    loading.value = false
  }
}

// Async component for the resolved template. We rebuild the loader thunk
// only when (theme, component) actually changes — defineAsyncComponent caches
// the resolved chunk after first load, so re-binding the same pair is cheap
// but unnecessary, and a different pair forces a reload.
const templateComponentKey = computed<string>(() => {
  if (!data.value) return ''
  return `${data.value.theme}::${data.value.template.component}`
})

const templateComponent = computed(() => {
  if (!data.value) return null
  const theme = data.value.theme
  const componentPath = data.value.template.component
  return defineAsyncComponent(() => loadTemplateComponent(theme, componentPath))
})

// The site config the theme shell renders from (navigation, layouts, theme
// vars). The clientConfig plugin skips every /__preview route, and this one has
// no editor postMessage channel for it, so the route loads it itself. The site
// is named by `?site=` on the iframe URL — the endpoints resolve a tenant from
// the hostname, and the admin may well be on the platform domain.
const { loadClientConfig, themeName } = useClientConfig()
useCssOverridesFromConfig()

// Theme CSS arrives with the shell's own layout chunk (CSS-01..05), as on the
// published route — no layout-less stylesheet loading here.
const nuxtLayout = usePageShell({
  theme: computed(() => data.value?.theme ?? themeName.value),
  layoutId: computed(() => data.value?.layout?.id),
  meta: computed(() => {
    const overrides = data.value?.layout?.overrides
    return overrides ? { layoutOverrides: overrides } : {}
  }),
})

// postMessage listener. We accept any origin — the iframe is mounted same-origin
// by ArticlePreviewPane, but the editor's `*` postMessage doesn't pass the
// origin filter cleanly across HMR reloads in dev. The shape check on
// `msg.source === 'article-preview'` is sufficient as a fingerprint.
function handleMessage(event: MessageEvent) {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return
  if (msg.source !== 'article-preview') return
  if (msg.type === 'update') {
    void refresh(msg.payload ?? {})
  }
}

onMounted(async () => {
  window.addEventListener('message', handleMessage)
  // Initial render uses persisted draft state (empty payload). The parent
  // pane immediately follows with an `update` message carrying any in-flight
  // unsaved edits — no race because both paths debounce-deduplicate.
  // Chrome and article load in parallel: neither blocks the other's paint.
  await Promise.all([
    refresh({}),
    loadClientConfig().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to load the site configuration'
      console.error('[article-preview] Failed to load the site config for the theme shell', err)
      chromeError.value = msg
    }),
  ])
  // Tell the parent we're ready to receive updates.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: 'article-preview', type: 'ready' }, '*')
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})

// The shell's header and footer carry real navigation now. A click on one
// would replace the preview with the live site inside the editor's own panel,
// with no way back — the same guard /__preview installs.
const removeNavGuard = useRouter().beforeEach((to) => {
  if (!to.path.startsWith('/__preview')) return false
})
onUnmounted(removeNavGuard)

// Inject typography preset CSS (live from the typography store) so richtext
// previews show the correct fonts. We can't reach the admin's editorStore from
// inside an iframe SPA route — the iframe is a separate Nuxt app instance.
// V2 deferral: LIVE (unsaved) typography fidelity inside the iframe is V3
// work. The theme shell carries data-theme/data-site-root, so persisted theme
// styles and typography presets apply as in production.

// Watch for siteId / articleId changes so the route can be reused for a
// different article without remounting.
watch([siteId, articleId], () => {
  if (siteId.value && articleId.value) void refresh({})
})
</script>

<template>
  <!-- No render yet means no theme yet: mounting a shell before the endpoint
       names one would frame the article in the wrong chrome and then swap. -->
  <div v-if="!data" class="article-preview-shell">
    <div v-if="loading" class="article-preview-shell__loading">
      <span class="material-icons-outlined" aria-hidden="true">sync</span>
      <p>Rendering preview…</p>
    </div>

    <div v-else-if="error" class="article-preview-shell__error" role="alert">
      <span class="material-icons-outlined" aria-hidden="true">error_outline</span>
      <p>{{ error }}</p>
    </div>
  </div>

  <!-- The published article's own shell: header, footer, frame and background
       come from the layout the article resolves, not from this route. -->
  <NuxtLayout v-else :name="nuxtLayout">
    <component
      v-if="templateComponent"
      :key="templateComponentKey"
      :is="templateComponent"
      :data="data.contentData"
      :settings="data.template.settings"
      :media="data.media"
      :page="data.page"
      :related="data.relatedArticles"
    />
  </NuxtLayout>

  <!-- Banner overlay: refetch error while a previous render is still on screen -->
  <div v-if="data && error" class="article-preview-shell__banner" role="status">
    <span class="material-icons-outlined" aria-hidden="true">warning</span>
    <span>Preview update failed: {{ error }}</span>
  </div>

  <div v-if="chromeError" class="article-preview-shell__banner article-preview-shell__banner--chrome" role="status">
    <span class="material-icons-outlined" aria-hidden="true">warning</span>
    <span>Header and footer unavailable: {{ chromeError }}</span>
  </div>
</template>

<style scoped>
.article-preview-shell {
  position: relative;
  min-height: 100vh;
  background: #fff;
}

.article-preview-shell__loading,
.article-preview-shell__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 100vh;
  color: #5f6368;
  font-size: 1.4rem;
}

.article-preview-shell__error {
  color: #c5221f;
}

.article-preview-shell__loading .material-icons-outlined {
  font-size: 2.4rem;
  animation: aps-spin 1s linear infinite;
}

.article-preview-shell__error .material-icons-outlined {
  font-size: 2.4rem;
}

.article-preview-shell__banner {
  position: fixed;
  top: 0.8rem;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  background: rgba(197, 34, 31, 0.95);
  color: #fff;
  border-radius: 0.4rem;
  font-size: 1.2rem;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Stacked, not overlapping: a failed refetch and a missing config are
   independent failures and can be on screen at the same time. */
.article-preview-shell__banner--chrome {
  top: 4rem;
}

@keyframes aps-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
