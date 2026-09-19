import { ref, readonly, computed, getCurrentInstance } from 'vue'
import { useRoute } from 'vue-router'
import { setAuthStateOverride } from '~/shared/composables/useAuthToken'
import { resolveRegionBox } from '~/shared/features/cms/previewInteraction'
import type {
  ClientConfig,
  EditorToNuxtMessage,
  PreviewReadyMessage,
  SectionClickedMessage,
  LayoutClickedMessage,
  RedirectRequestMessage,
  LayoutMetaUpdateMessage,
  SceneUpsertMessage,
  PreviewSceneMessage,
  SceneRemoveMessage,
  SceneTargetsRefreshMessage,
  SceneScrubMessage,
  SceneCommand,
  SceneCommandMessage,
  ScatterItemPatch,
  ScatterItemPatchMessage,
  CanvasBlockPlacementPatchMessage,
  PreviewMessageDispatcher,
} from '~/shared/types/previewMessages'
import type { CanvasBlockGeometry } from '~/shared/types/placement'
import { PREVIEW_MESSAGE_DISPATCHER_KEY } from '~/shared/types/previewMessages'
import type { AnimationScene, AnimationEngine } from '~/shared/types/animation'

// Module-level refs are safe here: /__preview routes have ssr: false,
// so this code only runs in the browser (no cross-request state leaks).
const previewConfig = ref<ClientConfig | null>(null)
const selectedSectionId = ref<string | null>(null)
const selectedLayoutId = ref<'header' | 'footer' | null>(null)
const isPreviewReady = ref(false)
const currentPageSlug = ref<string>('home')
const previewQuery = ref<Record<string, string | string[]>>({})
const previewRouteParams = ref<Record<string, string>>({})

/**
 * Controls a click must be allowed to operate rather than being swallowed into
 * a selection. Two deliberate exclusions:
 *
 * - `[tabindex]` is NOT here. It used to be, and it disabled click-to-select on
 *   the entire preview: theme layouts give their skip-link target
 *   `<main tabindex="-1">`, an ancestor of every block, so `closest()` matched
 *   for every click anywhere on the page. `tabindex="-1"` means
 *   "programmatically focusable", not "interactive"; only a tabbable value is a
 *   control the author might want to exercise.
 * - `a` is NOT here. Links are real in the preview, and following one navigates
 *   the iframe away from the page the editor is synchronised to. In the editor
 *   a link is chrome to select, not a link to follow — Cmd/Ctrl-click remains
 *   the escape hatch for authors who genuinely want to visit the target.
 */
const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, label, [role="button"], [role="link"],'
  + ' [tabindex]:not([tabindex="-1"]), [data-interactive="true"]'

// Helper to check if click target is an interactive element
function isInteractiveElement(target: HTMLElement): boolean {
  return !!target.closest(INTERACTIVE_SELECTOR)
}

// Resolve the base domain the CMS is served under. Preview trust is scoped
// to this suffix — any sibling subdomain (admin host, tenant host) is
// considered part of the same deployment.
function getBaseDomain(): string {
  // Client-side: prefer window.__CMS_BASE_DOMAIN__ if the Nuxt app publishes
  // it (via NUXT_PUBLIC_CMS_BASE_DOMAIN → useRuntimeConfig().public). Fall
  // back to deriving from the last two labels of window.location.hostname so
  // the check still works when the runtime config isn't injected (e.g. very
  // early during boot, before useRuntimeConfig resolves).
  if (typeof window === 'undefined') return ''
  const injected = (window as any).__CMS_BASE_DOMAIN__
  if (typeof injected === 'string' && injected.length > 0) return injected
  const host = window.location.hostname
  const parts = host.split('.')
  if (parts.length < 2) return host
  return parts.slice(-2).join('.')
}

// Same-origin OR sibling subdomain of the configured base domain.
// Prevents rogue hosts (e.g. attacker.com loading our site in an iframe)
// from driving the preview via postMessage, while still letting the admin
// host edit tenant previews across subdomain boundaries.
function isTrustedOrigin(origin: string): boolean {
  if (typeof window === 'undefined') return false
  if (origin === window.location.origin) return true
  try {
    const u = new URL(origin)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const base = getBaseDomain()
    if (!base) return false
    // Exact base (apex) or any subdomain of base.
    return u.hostname === base || u.hostname.endsWith('.' + base)
  } catch {
    return false
  }
}

// Captured origin of the parent editor window, set during PREVIEW_INIT handshake.
// Used as the targetOrigin for postMessage calls instead of '*'.
const editorOrigin = ref<string | null>(null)

// Optional animation engine reference for scene message handling.
// Set via setAnimationEngine() — keeps the composable decoupled from the engine provider.
let animationEngine: AnimationEngine | null = null

type PreviewWindow = Window & {
  [PREVIEW_MESSAGE_DISPATCHER_KEY]?: PreviewMessageDispatcher
}

function dispatchSceneCommand(sceneId: string, command: SceneCommand) {
  if (!animationEngine) {
    return
  }

  switch (command) {
    case 'play':
    case 'hover-in':
      animationEngine.play(sceneId)
      break

    case 'pause':
      animationEngine.pause(sceneId)
      break

    case 'replay':
    case 'restart':
      animationEngine.pause(sceneId)
      animationEngine.scrub(sceneId, 0)
      animationEngine.play(sceneId)
      break

    case 'hover-out':
      animationEngine.pause(sceneId)
      animationEngine.scrub(sceneId, 0)
      break
  }
}

export function useCmsPreview() {
  // useRoute() uses inject() internally, which only works in setup context.
  // When useCmsPreview is called indirectly from async callbacks (e.g. via
  // useClientConfig in onMounted), skip the call to avoid Vue warnings.
  const instance = getCurrentInstance()
  const route = instance ? useRoute() : null

  // Check if we're in preview mode (only active on /__preview route)
  const isInPreviewMode = () => route?.path?.startsWith('/__preview') ?? false

  // Computed ref for use in other composables
  const inPreviewMode = computed(() => route?.path?.startsWith('/__preview') ?? false)

  // Send message to parent CMS editor.
  // Uses the captured editorOrigin (set during PREVIEW_INIT handshake) as
  // the targetOrigin, preventing data leakage to unintended parents.
  // PREVIEW_READY is the only message sent before the handshake completes;
  // it contains no sensitive data so uses '*' to bootstrap communication.
  function sendToEditor(
    message:
      | PreviewReadyMessage
      | SectionClickedMessage
      | LayoutClickedMessage
      | RedirectRequestMessage
      | LayoutMetaUpdateMessage
      | ScatterItemPatchMessage
      | CanvasBlockPlacementPatchMessage
  ) {
    if (!window.parent || window.parent === window) {
      return
    }

    const targetOrigin = editorOrigin.value || '*'
    window.parent.postMessage(message, targetOrigin)
  }

  // Request CMS to navigate to a different page (for editor-driven redirects in preview)
  function sendRedirectRequest(pageId: string) {
    const message: RedirectRequestMessage = {
      type: 'REDIRECT_REQUEST',
      source: 'nuxt-preview',
      pageId,
    }
    sendToEditor(message)
  }

  // Notify CMS that a section was clicked
  function notifySectionClick(sectionId: string) {
    const message: SectionClickedMessage = {
      type: 'SECTION_CLICKED',
      source: 'nuxt-preview',
      sectionId,
    }
    sendToEditor(message)
  }

  // Notify CMS that header or footer was clicked
  function notifyLayoutClick(area: 'header' | 'footer') {
    const message: LayoutClickedMessage = {
      type: 'LAYOUT_CLICKED',
      source: 'nuxt-preview',
      area,
    }
    sendToEditor(message)
  }

  // Notify CMS that a scatter-collage item-patch gesture committed on the
  // preview side. Substrate adapters (Chunk C.3) call this on pointer-up /
  // keyboard-nudge so the editor store can persist via `patchBlockItem`.
  function notifyScatterItemPatch(blockId: string, patch: ScatterItemPatch) {
    const message: ScatterItemPatchMessage = {
      type: 'SCATTER_ITEM_PATCH',
      source: 'nuxt-preview',
      blockId,
      patch,
    }
    sendToEditor(message)
  }

  function notifyCanvasBlockPlacementPatch(blockId: string, patch: CanvasBlockGeometry) {
    const message: CanvasBlockPlacementPatchMessage = {
      type: 'CANVAS_BLOCK_PLACEMENT_PATCH',
      source: 'nuxt-preview',
      blockId,
      patch,
    }
    sendToEditor(message)
  }

  // Handle incoming messages from CMS
  function handleMessage(event: MessageEvent) {
    // Accept messages from the same origin OR any sibling subdomain under the
    // configured base domain. Same-origin matches dev (everything on
    // localhost:3000). Sibling-subdomain matches prod, where admin runs at
    // app.<base> or <base> but tenant previews live at {site}--{program}.<base>.
    if (typeof window !== 'undefined' && !isTrustedOrigin(event.origin)) {
      return
    }

    const data = event.data as EditorToNuxtMessage

    // Validate source
    if (!data || data.source !== 'splash') {
      return
    }

    switch (data.type) {
      case 'PREVIEW_INIT':
        // Capture the editor's origin for secure postMessage targeting
        editorOrigin.value = event.origin
        previewConfig.value = data.config
        if (data.pageSlug) {
          currentPageSlug.value = data.pageSlug
        }
        if (data.query) {
          previewQuery.value = data.query
        }
        previewRouteParams.value = data.routeParams ?? {}
        break

      case 'CONFIG_UPDATE':
        if (data.config?.pages && previewConfig.value) {
          // Deep-merge pages so child-page updates don't clobber sibling children
          for (const [slug, pageData] of Object.entries(data.config.pages) as [string, any][]) {
            const existingPages = (previewConfig.value as any).pages ?? {}
            if (!(previewConfig.value as any).pages) {
              (previewConfig.value as any).pages = {}
            }
            if (pageData.pages) {
              // Parent page with nested children — merge children shallowly
              existingPages[slug] = {
                ...(existingPages[slug] ?? {}),
                ...pageData,
                pages: {
                  ...(existingPages[slug]?.pages ?? {}),
                  ...pageData.pages,
                },
              }
            } else {
              existingPages[slug] = {
                ...(existingPages[slug] ?? {}),
                ...pageData,
              }
            }
            ;(previewConfig.value as any).pages = existingPages
          }
          // Apply all non-pages keys shallowly
          const { pages: _pages, ...restConfig } = data.config as any
          Object.assign(previewConfig.value, restConfig)
        } else {
          previewConfig.value = data.config
        }
        if (data.pageSlug) {
          currentPageSlug.value = data.pageSlug
        }
        if (data.query) {
          previewQuery.value = data.query
        }
        if (data.routeParams !== undefined) {
          previewRouteParams.value = data.routeParams ?? {}
        }
        break

      case 'SECTION_SELECT':
        selectedSectionId.value = data.sectionId
        selectedLayoutId.value = null

        // Scroll the selection into view. Deferred one frame: the same message
        // that changes the selection can arrive with a config update that
        // reshapes the page, and scrolling against the pre-update layout lands
        // on the wrong offset.
        if (data.sectionId) {
          const targetId = data.sectionId
          requestAnimationFrame(() => {
            const region = document.querySelector(
              `[data-preview-section-id="${CSS.escape(targetId)}"]`,
            )
            // A block region is boxless, so scrolling it directly lands at the
            // document origin. resolveRegionBox finds the element with a box.
            if (region) {
              resolveRegionBox(region).scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          })
        }
        break

      case 'LAYOUT_SELECT':
        selectedLayoutId.value = data.layoutId
        selectedSectionId.value = null
        break

      case 'SCENE_UPSERT':
      case 'PREVIEW_SCENE':
        if (animationEngine) {
          animationEngine.upsertScene(data.scene)
        }
        break

      case 'SCENE_REMOVE':
        if (animationEngine) {
          animationEngine.removeScene(data.sceneId)
        }
        break

      case 'SCENE_TARGETS_REFRESH':
        if (animationEngine) {
          animationEngine.refreshTargets(data.blockId)
        }
        break

      case 'SCENE_SCRUB':
        if (animationEngine) {
          animationEngine.scrub(data.sceneId, data.progress)
        }
        break

      case 'SCENE_COMMAND':
        dispatchSceneCommand(data.sceneId, data.command)
        break

      case 'AUTH_STATE_OVERRIDE':
        // "Viewing as" — flips block-level visibleTo and the _auth/_guest
        // setting overrides. Reactive, so no reload: resolution is client-side.
        setAuthStateOverride(data.isAuthenticated)
        break
    }
  }

  /**
   * Install a preview config WITHOUT the postMessage handshake.
   *
   * The tenant preview receives its config from the editor, so `PREVIEW_INIT`
   * is the only writer there. The brand-canvas route (`/__preview/brand-canvas`)
   * has no editor to handshake with on the export path — headless Chromium
   * injects a snapshot into the document — yet it renders through the same
   * `DynamicPage`, which reads its tree from exactly this config. Without a
   * setter that route would have to postMessage to itself to render at all.
   *
   * A document is one preview surface or the other, never both, so the two
   * writers cannot race over this module-level ref.
   */
  function setPreviewConfig(config: ClientConfig) {
    previewConfig.value = config
  }

  // Initialize preview mode (called on mount in preview page)
  function initPreviewMode() {
    if (!isInPreviewMode()) {
      return
    }

    // Add message listener
    window.addEventListener('message', handleMessage)

    // Send PREVIEW_READY to CMS
    const readyMessage: PreviewReadyMessage = {
      type: 'PREVIEW_READY',
      source: 'nuxt-preview',
    }

    sendToEditor(readyMessage)
    isPreviewReady.value = true
  }

  // Cleanup (called on unmount)
  function cleanupPreviewMode() {
    window.removeEventListener('message', handleMessage)
    isPreviewReady.value = false
  }

  // Register the animation engine for scene message handling (preview side).
  function setAnimationEngine(engine: AnimationEngine | null) {
    animationEngine = engine
  }

  // Editor-side: send scene upsert to preview iframe
  function sendSceneUpsert(scene: AnimationScene) {
    const message: SceneUpsertMessage = {
      type: 'SCENE_UPSERT',
      source: 'splash',
      scene,
    }
    sendToPreview(message)
  }

  // Editor-side: send transient preview scene to preview iframe
  function sendPreviewScene(scene: AnimationScene) {
    const message: PreviewSceneMessage = {
      type: 'PREVIEW_SCENE',
      source: 'splash',
      scene,
    }
    sendToPreview(message)
  }

  // Editor-side: send scene remove to preview iframe
  function sendSceneRemove(sceneId: string) {
    const message: SceneRemoveMessage = {
      type: 'SCENE_REMOVE',
      source: 'splash',
      sceneId,
    }
    sendToPreview(message)
  }

  // Editor-side: send scene targets refresh to preview iframe
  function sendSceneTargetsRefresh(blockId: string) {
    const message: SceneTargetsRefreshMessage = {
      type: 'SCENE_TARGETS_REFRESH',
      source: 'splash',
      blockId,
    }
    sendToPreview(message)
  }

  // Editor-side: send per-scene scrub progress to preview iframe.
  // Seeks the selected scene's WAAPI animations only — same code path as prod.
  function sendSceneScrub(sceneId: string, progress: number) {
    const message: SceneScrubMessage = {
      type: 'SCENE_SCRUB',
      source: 'splash',
      sceneId,
      progress,
    }
    sendToPreview(message)
  }

  // Editor-side: send transport-like preview commands to preview iframe.
  function sendSceneCommand(sceneId: string, command: SceneCommand) {
    const message: SceneCommandMessage = {
      type: 'SCENE_COMMAND',
      source: 'splash',
      sceneId,
      command,
    }
    sendToPreview(message)
  }

  // Editor-side: post message to the preview iframe
  function sendToPreview(message: EditorToNuxtMessage) {
    const previewWindow = window as PreviewWindow
    const dispatcher = previewWindow[PREVIEW_MESSAGE_DISPATCHER_KEY]
    if (dispatcher) {
      dispatcher(message)
      return
    }

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-preview]')
    iframe?.contentWindow?.postMessage(message, window.location.origin)
  }

  return {
    // State (readonly to prevent external mutations)
    previewConfig: readonly(previewConfig),
    selectedSectionId: readonly(selectedSectionId),
    selectedLayoutId: readonly(selectedLayoutId),
    currentPageSlug: readonly(currentPageSlug),
    isPreviewReady: readonly(isPreviewReady),
    previewQuery: readonly(previewQuery),
    previewRouteParams: readonly(previewRouteParams),
    inPreviewMode, // Computed ref for use in other composables

    // Methods
    isInPreviewMode,
    setPreviewConfig,
    initPreviewMode,
    cleanupPreviewMode,
    notifySectionClick,
    notifyLayoutClick,
    notifyScatterItemPatch,
    notifyCanvasBlockPlacementPatch,
    sendRedirectRequest,
    sendToEditor,
    isInteractiveElement,
    setAnimationEngine,
    sendSceneUpsert,
    sendPreviewScene,
    sendSceneRemove,
    sendSceneTargetsRefresh,
    sendSceneScrub,
    sendSceneCommand,
    sendToPreview,
  }
}
