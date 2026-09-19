import { computed, readonly, ref } from 'vue'
import { useCmsPreview } from './useCmsPreview'
import { getThemeConfig } from '~/shared/features/cms/themeData'
import type { ClientConfig, PreviewBlock } from '~/shared/types/previewMessages'
import type { ResolvedSeo } from '~/shared/types/seo'
import type { ArticleBodyResponse, MediaRecord } from '~/shared/types/articles'
import type { ArticleLayoutSource } from '~/shared/features/layout/articleLayout'

type StructuredTemplate = NonNullable<ArticleBodyResponse['template']>

/**
 * HTTP status carried by a failed config fetch, or null when the failure had none
 * (network down, CORS, a thrown non-HTTP error).
 *
 * `/` needs to tell two failures apart: a host with no site behind it (404 — the
 * platform's own domain) renders the landing page, anything else is a real fault on
 * a real tenant and belongs on /error. The message string is not a safe discriminator
 * — it is prose from ofetch — so the status is captured as a number at the boundary.
 */
function errorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  if ('statusCode' in err && typeof err.statusCode === 'number') return err.statusCode
  if ('status' in err && typeof err.status === 'number') return err.status
  return null
}

// Minimal empty config returned when config hasn't loaded yet.
// Prevents computed properties from throwing during the brief window
// between component mount and config arrival (e.g. preview iframe
// before PREVIEW_INIT message, or SSR before loadClientConfig resolves).
const EMPTY_CONFIG: ClientConfig = {
  theme: '',
  themeSettings: {},
  navigation: {},
  pages: {},
  childSites: {},
}

// Content locale for a site = the theme's declared `defaultLocale`. Drives
// content-string localization (page titles, blog content, SEO) independently of
// the vue-i18n UI/router locale — the public sites have no locale switcher and
// render in their configured language. Falls back to 'en-US' when the theme is
// unknown (config not yet loaded) or declares no default locale.
function resolveContentLocale(theme: string | undefined): string {
  if (!theme) return 'en-US'
  try {
    return getThemeConfig(theme).defaultLocale ?? 'en-US'
  } catch {
    return 'en-US'
  }
}

// Helper to find page path for URL building
function findPagePath(
  pages: Record<string, any> | undefined,
  targetId: string,
  trail: string[] = []
): string[] | null {
  if (!pages) return null

  for (const [key, page] of Object.entries(pages)) {
    if (key === targetId) {
      return [...trail, key]
    }

    const children = (page as any).pages as Record<string, any> | undefined
    if (children) {
      const found = findPagePath(children, targetId, [...trail, key])
      if (found) return found
    }
  }

  return null
}

/**
 * Load client config from API.
 * Uses useState() for SSR-safe per-request state.
 * Throws if loading fails — there is no fallback config.
 * @param force - If true, bypasses cache and reloads from server
 */
async function loadClientConfig(force = false): Promise<ClientConfig> {
  const runtimeConfig = useState<ClientConfig | null>('cms:clientConfig', () => null)
  const isConfigLoaded = useState<boolean>('cms:clientConfigLoaded', () => false)
  const configError = useState<string | null>('cms:clientConfigError', () => null)
  const configErrorStatus = useState<number | null>('cms:clientConfigErrorStatus', () => null)

  // Already loaded (unless forcing reload)
  if (runtimeConfig.value && !force) {
    return runtimeConfig.value
  }

  // Forward ?site= from the page URL so admin preview iframes resolve the correct site
  const params = new URLSearchParams()
  if (force) params.set('t', String(Date.now()))
  // Read ?site= from the current page URL (works in both SSR and CSR)
  try {
    const route = useRoute()
    const routeSiteId = route.query.site as string | undefined
    if (routeSiteId) params.set('site', routeSiteId)
  } catch {
    // useRoute() may not be available outside setup context; fall back to window.location
    if (import.meta.client) {
      const pageSiteId = new URL(window.location.href).searchParams.get('site')
      if (pageSiteId) params.set('site', pageSiteId)
    }
  }
  const qs = params.toString()
  const url = qs ? `/api/site-config?${qs}` : '/api/site-config'

  try {
    const config = await $fetch<ClientConfig>(url)
    runtimeConfig.value = config
    isConfigLoaded.value = true
    configError.value = null
    configErrorStatus.value = null
    return config
  } catch (err) {
    isConfigLoaded.value = false
    configError.value = err instanceof Error ? err.message : 'Failed to load configuration'
    configErrorStatus.value = errorStatus(err)
    throw err // Re-throw so plugin catches it
  }
}

/**
 * Force reload the client config from server.
 * Useful after CMS publish to pick up changes without app restart.
 */
async function reloadClientConfig(): Promise<ClientConfig> {
  return loadClientConfig(true)
}

// Client-side page block cache, keyed by "configVersion:pagePath".
// Automatically invalidated when configVersion changes (after publish).
const pageBlockCache = new Map<string, any[]>()

// Client-side page scene cache, keyed by "configVersion:pagePath".
const pageSceneCache = new Map<string, any[]>()
const pageSectionCache = new Map<string, any[]>()
// Resolved SEO cache, keyed by "configVersion:pagePath". Populated alongside
// blocks/sections/scenes by `loadPageBlocks` so the renderer can drive
// <PageHead> from the same fetch.
const pageSeoCache = new Map<string, ResolvedSeo | null>()
// Structured-template caches (Blog-2 V2). Populated by `loadPageBlocks` when
// the page endpoint returns `template + contentData + media` (article fall-
// through with a structured template). `template` absent means legacy /
// blocks-mode rendering; the renderer falls back to its existing path.
const pageTemplateCache = new Map<string, StructuredTemplate | null>()
const pageContentDataCache = new Map<string, Record<string, any> | null>()
const pageMediaCache = new Map<string, Record<string, MediaRecord>>()
// Sibling-article summaries for related-content carousels. Populated
// by `loadPageBlocks` from the page endpoint's `relatedArticles` field. Empty
// array when the page isn't an article or has no siblings.
const pageRelatedCache = new Map<string, any[]>()
// Page facts an ARTICLE owns: publication date, byline, parent index slug. The
// shell config's page tree carries only static and blog-index pages, so none of
// them reach the renderer through it — the page endpoint sends them alongside
// the template payload instead, and article templates read them from here.
interface PageIdentity {
  publishedAt: string | null
  author: { userId: string | null; name: string | null; displayName: string | null }
  parentSlug: string | null
}
const pageIdentityCache = new Map<string, PageIdentity | null>()
// Layout inputs an ARTICLE owns (its own layout id, its template's layout id,
// its `meta.layoutOverrides`). Same reason as authorship: articles are absent
// from the shell page tree, so the shell can only learn them from this fetch.
const pageLayoutCache = new Map<string, ArticleLayoutSource | null>()

/**
 * Load blocks for a single page from the /api/site-config/page endpoint.
 * Results are cached client-side, keyed by configVersion + pagePath.
 */
function isClientCacheDisabled(): boolean {
  try {
    const cfg = useRuntimeConfig()
    return Boolean(cfg.public?.disableCache)
  } catch {
    return false
  }
}

// Requests in flight, keyed exactly like `pageBlockCache`. Without this, the
// boot-time prefetch and DynamicPage's own `onMounted` call would issue two
// identical requests — the cache is only populated once a response lands, so a
// second caller arriving mid-flight would miss it.
const inflightPageLoads = new Map<string, Promise<any[]>>()

async function loadPageBlocks(pagePath: string, configVersion?: string): Promise<any[]> {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`

  const cached = isClientCacheDisabled() ? undefined : pageBlockCache.get(cacheKey)
  if (cached) return cached

  const inflight = inflightPageLoads.get(cacheKey)
  if (inflight) return inflight

  const request = fetchPageBlocks(pagePath, configVersion, cacheKey)
    .finally(() => { inflightPageLoads.delete(cacheKey) })
  inflightPageLoads.set(cacheKey, request)
  return request
}

/**
 * Start the page fetch without waiting for the renderer to mount.
 *
 * Measured on the deployed site: `/api/site-config` finished at 752ms but
 * `/api/site-config/page` did not start until 836ms, because DynamicPage issues
 * it from `onMounted` — after this plugin's remaining awaits and after the route
 * component mounts. The path is known from the URL at boot, so that 84ms is pure
 * queueing.
 *
 * Fire-and-forget by design: `loadPageBlocks` caches and de-duplicates, so
 * DynamicPage's later call joins this same request instead of issuing another.
 * Errors are swallowed here (which also marks the promise handled, so a failure
 * before the renderer attaches is not an unhandled rejection) — DynamicPage
 * re-requests through the same function and handles the failure itself.
 */
function prefetchPageBlocks(pagePath: string, configVersion?: string): void {
  if (!pagePath) return
  loadPageBlocks(pagePath, configVersion).catch(() => {})
}

async function fetchPageBlocks(pagePath: string, configVersion: string | undefined, cacheKey: string): Promise<any[]> {
  // Build query params, forwarding ?site= if present
  const params: Record<string, string> = { path: pagePath }
  if (configVersion) params.v = configVersion

  try {
    const routeSiteId = getSiteParam()
    if (routeSiteId) params.site = routeSiteId
  } catch {
    // ignore — site param is optional
  }

  // Forward the site's content locale so server-resolved structured content
  // (blog-index title/intro, article body) is rendered in the configured
  // language rather than the resolveLocale() 'en-US' default.
  const localeState = useState<ClientConfig | null>('cms:clientConfig')
  const contentLocale = resolveContentLocale(localeState.value?.theme)
  if (contentLocale) params.locale = contentLocale

  // Forward member auth token if present (required for requireAuth pages)
  const headers: Record<string, string> = {}
  if (import.meta.client) {
    const cfg = useState<any>('cms:clientConfig')
    const storageKey =
      cfg.value?.themeSettings?.authStorageKey ?? 'authorization'
    const token = localStorage.getItem(storageKey)
    if (token) headers['authorization'] = `Bearer ${token}`
  }

  const data = await $fetch<{
    blocks: any[]
    scenes?: any[]
    sections?: any[]
    seo?: ResolvedSeo
    template?: StructuredTemplate
    contentData?: Record<string, any>
    media?: Record<string, MediaRecord>
    relatedArticles?: any[]
    publishedAt?: string | null
    author?: PageIdentity['author']
    parentSlug?: string | null
    layout?: ArticleLayoutSource
  }>('/api/site-config/page', {
    params,
    ...(Object.keys(headers).length ? { headers } : {}),
  })
  const blocks = data.blocks ?? []
  const scenes = data.scenes ?? []
  const sections = data.sections ?? []
  const seo = data.seo ?? null
  pageBlockCache.set(cacheKey, blocks)
  pageSceneCache.set(cacheKey, scenes)
  pageSectionCache.set(cacheKey, sections)
  pageSeoCache.set(cacheKey, seo)
  // Structured-template fields: present iff the article fall-through resolved
  // a V2 template. Absence is meaningful — clear the cache entry so a stale
  // template payload from a previous fetch doesn't leak across configVersions.
  if (data.template) pageTemplateCache.set(cacheKey, data.template)
  else pageTemplateCache.delete(cacheKey)
  if (data.contentData) pageContentDataCache.set(cacheKey, data.contentData)
  else pageContentDataCache.delete(cacheKey)
  if (data.media) pageMediaCache.set(cacheKey, data.media)
  else pageMediaCache.delete(cacheKey)
  // Sibling article summaries — present iff the article fall-through resolved.
  // Default to empty array on absence to keep template render guards simple.
  pageRelatedCache.set(cacheKey, Array.isArray(data.relatedArticles) ? data.relatedArticles : [])
  // Article identity: only the article branch of the endpoint sends these.
  // Delete on absence for the same reason as the template payload above — a
  // stale byline or breadcrumb from a previously-viewed article must not leak
  // onto this page.
  if (data.author || data.publishedAt !== undefined) {
    pageIdentityCache.set(cacheKey, {
      publishedAt: data.publishedAt ?? null,
      author: data.author ?? { userId: null, name: null, displayName: null },
      parentSlug: data.parentSlug ?? null,
    })
  } else {
    pageIdentityCache.delete(cacheKey)
  }
  // Article layout inputs — same absence semantics as the template payload: a
  // static page carries none, and a stale article layout must not leak onto it.
  if (data.layout) pageLayoutCache.set(cacheKey, data.layout)
  else pageLayoutCache.delete(cacheKey)
  return blocks
}

/**
 * Load scenes for a single page. Returns cached scenes from the last
 * loadPageBlocks call (the page endpoint returns both blocks and scenes).
 * Returns empty array if blocks haven't been fetched yet.
 */
function getPageScenes(pagePath: string, configVersion?: string): any[] {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageSceneCache.get(cacheKey) ?? []
}

/**
 * Load sections for a single page. Returns cached sections from the last
 * loadPageBlocks call (the page endpoint returns blocks, scenes, and sections).
 * Returns empty array if blocks haven't been fetched yet.
 */
function getPageSections(pagePath: string, configVersion?: string): any[] {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageSectionCache.get(cacheKey) ?? []
}

/**
 * Read resolved SEO for a page from the cache populated by `loadPageBlocks`.
 * Returns null when the page hasn't been fetched yet (or the API didn't
 * include `seo` — e.g. an older server build).
 */
function getPageSeo(pagePath: string, configVersion?: string): ResolvedSeo | null {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageSeoCache.get(cacheKey) ?? null
}

/**
 * Read structured template descriptor (component path + settings) for a page
 * from the cache. Returns null when the page is rendered by blocks (legacy)
 * or when the page hasn't been fetched yet.
 */
function getPageTemplate(pagePath: string, configVersion?: string): StructuredTemplate | null {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageTemplateCache.get(cacheKey) ?? null
}

/**
 * Read render-ready contentData for a structured-template page. Returns null
 * when the page isn't using a template (blocks mode) or hasn't been fetched.
 */
function getPageContentData(pagePath: string, configVersion?: string): Record<string, any> | null {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageContentDataCache.get(cacheKey) ?? null
}

/**
 * Read media records (id -> { url, alt, caption }) for a structured-template
 * page. Returns an empty object when no template / no media references exist.
 */
function getPageMedia(pagePath: string, configVersion?: string): Record<string, MediaRecord> {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageMediaCache.get(cacheKey) ?? {}
}

/**
 * Read sibling-article summaries for related-content carousels. Returns
 * empty array when the page isn't an article or hasn't been fetched yet.
 */
function getPageRelated(pagePath: string, configVersion?: string): any[] {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageRelatedCache.get(cacheKey) ?? []
}

/**
 * Read an article's publication date, byline and parent index slug. Returns
 * null for a page that is not an article (or that hasn't been fetched), which
 * is what lets the renderer fall back to the shell config's page record.
 */
function getPageIdentity(pagePath: string, configVersion?: string): PageIdentity | null {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageIdentityCache.get(cacheKey) ?? null
}

/**
 * Read the layout inputs an article owns (its layout id, its template's layout
 * id, its page-level overrides). Returns null for a static / blog-index page,
 * or for a page that hasn't been fetched yet — both cases mean "the shell keeps
 * resolving from the page tree".
 */
function getPageLayout(pagePath: string, configVersion?: string): ArticleLayoutSource | null {
  const cacheKey = `${configVersion || 'unknown'}:${pagePath}`
  return pageLayoutCache.get(cacheKey) ?? null
}

function getSiteParam(): string | undefined {
  try {
    const route = useRoute()
    return route.query.site as string | undefined
  } catch {
    if (import.meta.client) {
      return new URL(window.location.href).searchParams.get('site') || undefined
    }
    return undefined
  }
}

export function useClientConfig() {
  const { previewConfig, isInPreviewMode } = useCmsPreview()

  // SSR-safe state via useState (per-request on server, hydrated on client)
  const runtimeConfig = useState<ClientConfig | null>('cms:clientConfig', () => null)
  const isConfigLoaded = useState<boolean>('cms:clientConfigLoaded', () => false)
  const configError = useState<string | null>('cms:clientConfigError', () => null)
  const configErrorStatus = useState<number | null>('cms:clientConfigErrorStatus', () => null)

  // The active config: preview config if in preview mode, otherwise runtime config.
  // Returns EMPTY_CONFIG instead of throwing when config isn't available yet —
  // this prevents cascading errors in computed properties and block rendering
  // during the brief window before config arrives (preview PREVIEW_INIT, SSR hydration).
  const config = computed<ClientConfig>(() => {
    // Preview mode takes priority
    if (isInPreviewMode() && previewConfig.value) {
      return previewConfig.value
    }
    if (!runtimeConfig.value) {
      // In preview mode, config arrives async via postMessage — return empty
      // config until PREVIEW_INIT arrives. The preview page guards rendering
      // with v-if="hasConfig" so blocks won't actually render yet.
      if (isInPreviewMode()) {
        return EMPTY_CONFIG
      }
      // Outside preview, this is a genuine error — config should have been loaded
      // via loadClientConfig() in app.vue or a plugin. Log warning but don't throw
      // to avoid crashing the entire render tree.
      console.warn('[ClientConfig] Config not loaded. Ensure loadClientConfig() is awaited before accessing config.')
      return EMPTY_CONFIG
    }

    return runtimeConfig.value
  })

  // Whether config is actually available (not the empty fallback)
  const hasLoadedConfig = computed(() => {
    if (isInPreviewMode()) return previewConfig.value !== null
    return runtimeConfig.value !== null
  })

  const pagesTree = computed(() => config.value.pages ?? {})

  const buildUrlFromPageId = (pageId: string | undefined): string => {
    if (!pageId) return '#'

    const path = findPagePath(pagesTree.value, pageId)
    if (!path) {
      return '#'
    }

    return '/' + path.join('/')
  }

  const locale = computed(() => resolveContentLocale(config.value.theme))

  // Navigation (header/footer settings)
  const navigation = computed(() => config.value.navigation ?? {})

  const getPage = (pageId: string) => {
    if (!pageId) return undefined
    const segments = pageId.split('/')
    let current: any = config.value.pages

    for (let i = 0; i < segments.length; i++) {
      if (!current || typeof current !== 'object') return undefined

      const segment = segments[i] as string
      const remainingPath = segments.slice(i).join('/')

      // Try the remaining path as a flat key (e.g. "home/[id]" stored as a single slug)
      if (current[remainingPath] !== undefined) {
        return current[remainingPath]
      }

      // Try the segment as a direct key
      if (current[segment] !== undefined) {
        const page = current[segment]
        if (i === segments.length - 1) return page
        // Navigate into nested child pages for next iteration
        current = page.pages ?? {}
      }
      else {
        return undefined
      }
    }

    return current
  }

  // Get theme settings
  const themeSettings = computed(() => {
    return config.value.themeSettings ?? {}
  })

  // Get typography settings
  const typography = computed(() => {
    return config.value.typography ?? {}
  })

  // Get theme name
  const themeName = computed(() => config.value.theme)

  // Child sites map (mount path → child config)
  const childSites = computed(() => config.value.childSites ?? {})

  return {
    // Config state
    config,
    hasLoadedConfig,
    isConfigLoaded: readonly(isConfigLoaded),
    configError: readonly(configError),
    configErrorStatus: readonly(configErrorStatus),

    // Async loader (call once at app init)
    loadClientConfig,
    // Force reload (after CMS publish)
    reloadClientConfig,
    // Per-page block loader (config splitting)
    loadPageBlocks,
    // Start that loader at boot instead of on renderer mount — see its comment
    prefetchPageBlocks,
    // Per-page scene accessor (cached alongside blocks)
    getPageScenes,
    // Per-page section accessor (cached alongside blocks)
    getPageSections,
    // Per-page SEO accessor (cached alongside blocks)
    getPageSeo,
    // Per-page structured-template accessors (Blog-2 V2)
    getPageTemplate,
    getPageContentData,
    getPageMedia,
    getPageRelated,
    getPageIdentity,
    // Per-article layout accessor (cached alongside blocks)
    getPageLayout,

    // Computed properties
    locale,
    themeName,
    navigation,
    getPage,
    themeSettings,
    typography,
    childSites,
    buildUrlFromPageId,
  }
}
