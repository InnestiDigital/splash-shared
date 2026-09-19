import { computed, ref } from 'vue'
import { useHead } from '#imports'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import { useEnvConfig } from '~/shared/composables/useEnvConfig'
import { applySiteLocale } from '~/shared/i18n/applySiteLocale'
import { resolveBrowserLocale } from '~/shared/i18n/preConfigLocale'

function isPublicRoute(path: string): boolean {
  return !path.startsWith('/admin') && !path.startsWith('/__preview')
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const route = useRoute()
  const router = useRouter()

  const { loadClientConfig, locale, hasLoadedConfig, config, prefetchPageBlocks } = useClientConfig()

  // The page id DynamicPage will ask for, derived exactly as `[...slug].vue`
  // derives it, so the prefetch and the render share a cache key.
  function currentPageId(): string {
    // `params` is optional-chained: this runs before the route component and
    // must never be the thing that takes boot down.
    const slug = route.params?.slug
    if (Array.isArray(slug)) return slug.join('/')
    if (typeof slug === 'string') return slug
    return (route.path ?? '').replace(/^\/+|\/+$/g, '')
  }
  const { loadEnvConfig } = useEnvConfig()

  // The document language for the PRE-CONFIG surfaces (index.vue's loading + error
  // branches, error.vue). Until the config lands there is no site locale to read —
  // `locale` reports the `'en-US'` fallback, which is indistinguishable from a genuinely
  // English site — so the visitor's own browser preference is the only honest answer.
  // Empty until resolved, and superseded by the site locale the moment the config lands.
  const preConfigLocale = ref('')

  // Declare the document language for every page (WCAG 3.1.1, Level A).
  //
  // This used to live ONLY in `PageHead`, which `DynamicPage` renders `v-if="pageSeo"` —
  // so the four pages that resolve no SEO declared no language at all while rendering
  // Italian content. `<html lang>` is a DOCUMENT-level fact about the site's content
  // locale, not a per-page SEO tag, so it belongs at the same seam that resolves that
  // locale rather than inside the SEO component. PageHead still emits its own identical
  // `lang` from the same `locale` value, which unhead merges to the same result.
  //
  // Registered SYNCHRONOUSLY, before the awaits below: after an await the Nuxt instance
  // context is gone and `useHead` cannot resolve the head instance. `locale` is empty
  // until the config lands, so the computed — not a one-shot object — is what makes the
  // attribute appear when it resolves; an empty locale emits no attribute rather than
  // asserting a wrong language.
  //
  // Before the config resolves, the same attribute follows `preConfigLocale` instead: the
  // pre-config surfaces render their copy in the visitor's language, and the declared
  // language has to be the language actually on screen or the WCAG 3.1.1 failure simply
  // moves. `hasLoadedConfig` — not a non-empty `locale` — is what discriminates: the site
  // locale falls back to `'en-US'`, so it is never empty in practice.
  useHead(computed(() => {
    const lang = hasLoadedConfig.value ? locale.value : (preConfigLocale.value || locale.value)
    return { htmlAttrs: lang ? { lang } : {} }
  }))

  // The site's content locale must also drive the vue-i18n UI locale, or every `t()` string
  // in the theme renders English on an Italian page. This is done HERE, inline after the
  // config await, rather than in a plugin of its own watching `locale`: the config is what
  // resolves the locale, so a separate plugin either runs before it (reads the 'en-US'
  // fallback and its watch may never fire) or duplicates this ordering anyway.
  // See `shared/i18n/applySiteLocale.ts` for why the module's public `setLocale` is banned.
  const syncUiLocale = async () => {
    try {
      await applySiteLocale(nuxtApp.$i18n, locale.value)
    } catch (err) {
      // A failed message load must not take the page down — the theme falls back to the
      // default locale's strings, which is degraded but rendering.
      console.error('[ClientConfig] Failed to apply the site locale to vue-i18n:', err)
    }
  }

  // Point BOTH the UI locale and `<html lang>` at the visitor's browser preference for as
  // long as there is no config to read a site locale from. Runs before the config await —
  // that await is exactly the window the loading spinner and the config-error branch are
  // on screen for — and never once the config has landed, or a public→public navigation
  // would flash the browser's language over the site's own.
  const syncPreConfigLocale = async () => {
    if (hasLoadedConfig.value) return
    // `globalThis.navigator` rather than a build-time client flag: it is simply absent in
    // any environment that has no browser preference to read, and the resolver already
    // answers with the composer's current locale when handed nothing.
    const code = resolveBrowserLocale(nuxtApp.$i18n, globalThis.navigator ?? null)
    if (!code) return
    try {
      // The bundle load comes FIRST and `<html lang>` follows it, never the reverse: the
      // locale files are lazy-loaded, so announcing the language before the strings exist
      // renders English copy under `lang="it"` for as long as the chunk takes — measured,
      // not theorised. If the load fails, the attribute stays on whatever is really on
      // screen (the default locale) rather than claiming a language that never arrived.
      await applySiteLocale(nuxtApp.$i18n, code)
      preConfigLocale.value = code
    } catch (err) {
      // Same contract as the site-locale sync: a failed bundle load leaves the default
      // locale's strings rendering rather than taking the page down.
      console.error('[ClientConfig] Failed to apply the pre-config locale to vue-i18n:', err)
    }
  }

  // Initial load: skip admin and preview routes.
  // Admin has its own data flow; preview receives config via postMessage from the editor.
  if (isPublicRoute(route.path)) {
    await syncPreConfigLocale()
    // Load both configs in parallel for faster boot.
    // Wrap in try-catch to prevent uncaught exceptions from crashing the app.
    // If config fails to load, pages/index.vue detects the error via configError
    // state and renders appropriate error UI instead of a blank page.
    try {
      await Promise.all([
        loadClientConfig(),
        loadEnvConfig()
      ])
    } catch (err) {
      console.error('[ClientConfig] Failed to load config:', err)
      // Don't re-throw — allow app to bootstrap with EMPTY_CONFIG
    }
    // Before `syncUiLocale`, deliberately: that awaits a lazy locale bundle, and
    // the route component only mounts after this plugin returns. Firing here
    // takes the page fetch off the end of that chain — measured as an 84ms gap
    // between /api/site-config finishing and /api/site-config/page starting.
    // Not awaited: the render must not block on it, and DynamicPage joins the
    // same in-flight request when it mounts.
    prefetchPageBlocks(currentPageId(), config.value?.configVersion)
    await syncUiLocale()
  }

  // SPA navigation: load config when transitioning into a public route.
  // Covers the admin→public case: app.vue setup runs once, so the composables
  // were never given a loaded config on sessions that started on an admin route.
  // loadClientConfig has an internal "already loaded" guard, so this is a no-op
  // on subsequent navigations once config is in place.
  router.afterEach(async (to) => {
    if (!isPublicRoute(to.path)) return
    // The admin→public transition is where the loading spinner is actually reachable (the
    // app is already mounted), so the pre-config locale has to be in place before this
    // await too. A no-op once the config has loaded.
    await syncPreConfigLocale()
    try {
      await Promise.all([
        loadClientConfig(),
        loadEnvConfig()
      ])
    } catch (err) {
      console.error('[ClientConfig] Failed to load config on navigation:', err)
      // Don't re-throw — reactive composables will render with EMPTY_CONFIG
    }
    // Mirrors the boot path: the admin→public transition is the one case where the config
    // (and therefore the locale) is resolved after the plugin's own await already ran.
    await syncUiLocale()
  })
})
