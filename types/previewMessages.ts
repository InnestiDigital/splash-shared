import { isBrandCanvasOverrides } from './brandCanvas'
import { isRecord } from './guards'
import { isCanvasBlockGeometry } from './placement'
import { isCanvasSnapshotRevision } from '~/shared/features/brand-studio/canvasSnapshotRevision'
import type { AnimationScene } from './animation'

export type LabelMap = Record<string, string>

export const PREVIEW_MESSAGE_DISPATCHER_KEY = '__SPLASH_PREVIEW_DISPATCH__'

/**
 * Preview message types for communication between
 * CMS theme editor and Nuxt preview iframe.
 */

// Block definition in preview config
export interface PreviewBlock {
  type: string
  settings: Record<string, unknown>
  options?: Record<string, unknown>
  events?: string[]
  _previewId: string
}

// Page definition in preview config
export interface PreviewPage {
  title: LabelMap
  layout: string
  dynamic: boolean
  meta: Record<string, unknown>
  blocks: PreviewBlock[]
  sections?: any[]
  scenes?: AnimationScene[]
  pages?: Record<string, PreviewPage>
  requireAuth?: boolean
  pageType?: import('./templates').PageType
  templateId?: string | null
  /**
   * Authored sibling order. The tree is a slug-keyed object, and JS hoists
   * integer-like keys ("2018") to the front of `Object.keys` regardless of
   * insertion order — so key order is NOT authored order. Every consumer that
   * iterates siblings must sort by this field, not by key position.
   */
  position?: number
  /** Featured image for the page (thumbnail source for child-page lists). */
  featuredImageId?: string | null
  /** Resolved media URL for `featuredImageId`; null when unset or unresolved. */
  featuredImageUrl?: string | null
}

/**
 * One legacy-URL redirect, seeded from a blueprint's `redirects` array and
 * served on the client config. Consumed by `middleware/legacy-redirects.global.ts`.
 */
export interface SiteRedirectRule {
  /** Root-relative path to match against the requested route. */
  from: string
  /** Root-relative destination path. */
  to: string
  /** Redirect semantics; defaults to 301 (permanent). Matches the blueprint seeder's accepted set. */
  status?: 301 | 302 | 307 | 308
}

/**
 * Wire guard for a redirect rule. Runs server-side when the export hoists the
 * seeded rules and client-side at the middleware ingress — the config crosses
 * the network, so the shape is untrusted on arrival. `to` is a navigation
 * target: a protocol-relative `//host` or a backslash (browsers fold `\` into
 * `/`) would turn a page-config entry into an off-site redirect, so both fail.
 */
export function isSiteRedirectRule(value: unknown): value is SiteRedirectRule {
  if (!isRecord(value)) return false
  if (typeof value.from !== 'string' || !value.from.startsWith('/') || value.from.includes('\\')) return false
  if (typeof value.to !== 'string' || !value.to.startsWith('/') || value.to.startsWith('//') || value.to.includes('\\')) return false
  if (value.status !== undefined && value.status !== 301 && value.status !== 302 && value.status !== 307 && value.status !== 308) return false
  return true
}

// Navigation structures
export interface NavMenuItem {
  label: LabelMap
  target?: {
    pageId?: string
    isExternal?: boolean
  }
  url?: string
  type?: 'text' | 'list' | 'link'
  items?: NavMenuItem[]
}

export interface HeaderConfig {
  logo?: string | { url?: string } | null
  compactLogo?: string | { url?: string } | null
  logoAlt?: LabelMap | string
  logoText?: LabelMap | string
  logoPosition?: 'left' | 'center' | 'right'
  sticky?: boolean
  showLanguageToggle?: boolean
  showAccentBar?: boolean
  accentBarHeight?: number
  showHubReturn?: boolean
  hubReturnUrl?: string
  hubReturnText?: LabelMap | string
  menuItems?: Array<{
    id?: string
    type?: string
    settings?: {
      id?: string
      label?: LabelMap | string
      url?: string
      openInNewTab?: boolean
    }
  }>
  [key: string]: unknown
}

export interface FooterConfig {
  leftSlot?: NavMenuItem[]
  centerSlot?: NavMenuItem[]
  rightSlot?: NavMenuItem[]
  copyrightText?: LabelMap | null
  cssOverride?: Record<string, string>
  [key: string]: unknown
}

// Layout configuration
export interface LayoutDefinition {
  id: string
  label: string | LabelMap
}

export interface LayoutConfig {
  layouts?: LayoutDefinition[]
}

// Child site config embedded in parent's client config
export interface ChildSiteConfig {
  siteId: string
  mountPath: string
  theme: string
  themeSettings: Record<string, unknown>
  apiConfig: Record<string, unknown>
  envConfig: Record<string, unknown>
  navigation: {
    header?: HeaderConfig
    footer?: FooterConfig
  }
}

// Full client config (same shape as client.json)
export interface ClientConfig {
  theme: string
  configVersion?: string
  themeSettings: Record<string, unknown>
  /** Visual Brand Identity layer, present on brand-canvas preview/export. */
  brand?: import('./brandCanvasTheme').BrandCanvasBrandLayer
  typography?: Record<string, unknown>
  typographyPresets?: import('~/server/services/typography/typographyTypes').TypographySnapshotPreset[]
  typographyRoles?: import('~/server/services/typography/typographyTypes').TypographySnapshotRoles
  /** Semantic color roles (Phase F): role name → theme palette setting id. */
  colorRoles?: import('~/shared/types/colorRoles').ColorRoleBindings
  layout?: LayoutConfig
  navigation: {
    header?: HeaderConfig
    footer?: FooterConfig
  }
  pages: Record<string, PreviewPage>
  /**
   * Slug of the top-level page `/` should land on. Emitted by the client
   * export; `resolveHomeRoute` prefers it over key-order scanning (which JS
   * integer-key hoisting makes unreliable). Optional: snapshots published
   * before this field existed fall back to the legacy first-key scan.
   */
  homeSlug?: string
  /** Legacy-URL redirects, seeded per site. Absent when the site has none. */
  redirects?: SiteRedirectRule[]
  childSites?: Record<string, ChildSiteConfig>
  templates?: import('./templates').PageTemplate[]
}

// Message types sent from Nuxt preview to CMS
export interface PreviewReadyMessage {
  type: 'PREVIEW_READY'
  source: 'nuxt-preview'
}

export interface SectionClickedMessage {
  type: 'SECTION_CLICKED'
  source: 'nuxt-preview'
  sectionId: string
}

export interface LayoutClickedMessage {
  type: 'LAYOUT_CLICKED'
  source: 'nuxt-preview'
  area: 'header' | 'footer'
}

export interface RedirectRequestMessage {
  type: 'REDIRECT_REQUEST'
  source: 'nuxt-preview'
  pageId: string
}

export interface LayoutMetaUpdateMessage {
  type: 'LAYOUT_META_UPDATE'
  source: 'nuxt-preview'
  hasHeader: boolean
  hasFooter: boolean
}

// Message types sent from CMS to Nuxt preview
export interface PreviewInitMessage {
  type: 'PREVIEW_INIT'
  source: 'splash'
  config: ClientConfig
  pageSlug?: string
  query?: Record<string, string | string[]>
  routeParams?: Record<string, string>
}

export interface ConfigUpdateMessage {
  type: 'CONFIG_UPDATE'
  source: 'splash'
  config: ClientConfig
  pageSlug?: string
  query?: Record<string, string | string[]>
  routeParams?: Record<string, string>
}

export interface SectionSelectMessage {
  type: 'SECTION_SELECT'
  source: 'splash'
  sectionId: string | null
}

export interface LayoutSelectMessage {
  type: 'LAYOUT_SELECT'
  source: 'splash'
  layoutId: 'header' | 'footer' | null
}

// Scene-specific messages (editor → preview)
export interface SceneUpsertMessage {
  type: 'SCENE_UPSERT'
  source: 'splash'
  scene: AnimationScene
}

export interface PreviewSceneMessage {
  type: 'PREVIEW_SCENE'
  source: 'splash'
  scene: AnimationScene
}

export interface SceneRemoveMessage {
  type: 'SCENE_REMOVE'
  source: 'splash'
  sceneId: string
}

export interface SceneTargetsRefreshMessage {
  type: 'SCENE_TARGETS_REFRESH'
  source: 'splash'
  blockId: string
}

export interface SceneScrubMessage {
  type: 'SCENE_SCRUB'
  source: 'splash'
  sceneId: string
  progress: number
}

export type SceneCommand = 'play' | 'pause' | 'replay' | 'restart' | 'hover-in' | 'hover-out'

export interface SceneCommandMessage {
  type: 'SCENE_COMMAND'
  source: 'splash'
  sceneId: string
  command: SceneCommand
}

/**
 * "Viewing as" — overrides the preview's resolved visitor auth state so an
 * author can inspect both audiences of a `placement.visibleTo` block without
 * holding a real token. `null` clears the override and falls back to the
 * actual token (absent in the editor iframe, so effectively signed-out).
 *
 * Preview-only. This changes what the renderer mounts, nothing else — page
 * gating is `pages.requireAuth`, enforced server-side.
 */
export interface AuthStateOverrideMessage {
  type: 'AUTH_STATE_OVERRIDE'
  source: 'splash'
  isAuthenticated: boolean | null
}

/**
 * Patch payload for a single item inside a repeater block's `settings.items`
 * array. Always carries the target `id` (never mutated) plus any subset of
 * geometry fields (scatter-collage drag/nudge commits, keyboard nudges, etc).
 *
 * Keeping the field set narrow means adopter-only fields (`media`, `caption`,
 * `focal`, `scale`, …) survive merges untouched on the editor side.
 */
export interface ScatterItemPatch {
  id: string
  positionX?: number
  positionY?: number
  width?: number
  height?: number
  rotation?: number
  zIndex?: number
}

/**
 * Emitted by the scatter-collage substrate's persistence adapter whenever a
 * preview-side gesture commits (drag release, keyboard nudge, etc). The
 * editor receives this in `PreviewPanel.handleMessage` and forwards it to
 * `editorStore.patchBlockItem` for persistence.
 */
export interface ScatterItemPatchMessage {
  type: 'SCATTER_ITEM_PATCH'
  source: 'nuxt-preview'
  blockId: string
  patch: ScatterItemPatch
}

/** A committed direct-manipulation patch for one top-level canvas block. */
export interface CanvasBlockPlacementPatchMessage {
  type: 'CANVAS_BLOCK_PLACEMENT_PATCH'
  source: 'nuxt-preview'
  blockId: string
  patch: import('./placement').CanvasBlockGeometry
}

/**
 * Per-generation setting values pushed into the BRAND CANVAS preview route
 * (`/__preview/brand-canvas`) while an author fills a template's fields.
 *
 * The route repaints from the approved snapshot with these applied — the same
 * `applyCanvasOverrides` the headless export runs — so the iframe and the PNG
 * cannot disagree about what an override does. Nothing is persisted: the map
 * only becomes durable when the author saves the render, and then it lands on
 * the recipe, never on the canvas page.
 *
 * Whole-map, not a patch: `BrandCanvasOverrides` is already the complete
 * per-generation delta, so a partial message would need a second merge rule on
 * the receiving side for a payload that is bounded to 32 KB anyway.
 */
export interface BrandCanvasOverridesMessage {
  type: 'BRAND_CANVAS_OVERRIDES'
  source: 'splash'
  /** Monotonic workspace revision. Saving waits for this exact paint. */
  revision: number
  overrides: import('./brandCanvas').BrandCanvasOverrides
}

/** Acknowledges an override revision after layout, images and fonts settle. */
export interface BrandCanvasPaintedMessage {
  type: 'BRAND_CANVAS_PAINTED'
  source: 'nuxt-preview'
  revision: number
  error: string | null
}

/**
 * Which tree the canvas route actually installed. This is deliberately
 * separate from the message envelope's `source`: an admin preview can ask for
 * the live draft but receive the last approved snapshot when the draft cannot
 * be serialized.
 */
export type BrandCanvasContentSource = 'draft' | 'approved' | 'render-payload' | 'none'

/**
 * Whether the installed tree is the caller's requested tree. `fallback` is a
 * successful paint, but never proof that the live draft is safe to approve.
 */
export type BrandCanvasPreviewFidelity = 'exact' | 'fallback' | 'unavailable'

/**
 * Emitted by the canvas route once it has painted (or failed to), so the editor
 * knows when overrides will actually be honoured rather than guessing from the
 * iframe's `load` event — which fires before the snapshot fetch resolves.
 *
 * It carries the failure rather than a separate error message: "the canvas is
 * settled" and "why it is not renderable" are the same event from the parent's
 * point of view, and two messages would let a panel show a spinner forever
 * because it only subscribed to one of them.
 */
export interface BrandCanvasReadyMessage {
  type: 'BRAND_CANVAS_READY'
  source: 'nuxt-preview'
  /** null = painted. Non-null = the reason no correct canvas can be shown. */
  error: string | null
  /** Non-fatal degradations (missing media, unregistered block types). */
  warnings: string[]
  /** The tree that was actually painted, not merely the tree requested. */
  contentSource: BrandCanvasContentSource
  /** `fallback` means the paint succeeded with substitute content. */
  fidelity: BrandCanvasPreviewFidelity
  /** SHA-256 of the exact draft tree, present only for a draft/exact verdict. */
  draftRevision: string | null
}

export type PreviewMessageDispatcher = (message: EditorToNuxtMessage) => void

// Union types for type guards
export type NuxtToEditorMessage =
  | PreviewReadyMessage
  | SectionClickedMessage
  | LayoutClickedMessage
  | LayoutMetaUpdateMessage
  | RedirectRequestMessage
  | ScatterItemPatchMessage
  | CanvasBlockPlacementPatchMessage
  | BrandCanvasReadyMessage
  | BrandCanvasPaintedMessage

export type EditorToNuxtMessage =
  | PreviewInitMessage
  | ConfigUpdateMessage
  | SectionSelectMessage
  | LayoutSelectMessage
  | SceneUpsertMessage
  | PreviewSceneMessage
  | SceneRemoveMessage
  | SceneTargetsRefreshMessage
  | SceneScrubMessage
  | SceneCommandMessage
  | AuthStateOverrideMessage
  | BrandCanvasOverridesMessage

export type PreviewMessage = NuxtToEditorMessage | EditorToNuxtMessage

// Type guard helpers

export function isEditorMessage(msg: unknown): msg is EditorToNuxtMessage {
  return isRecord(msg) && msg.source === 'splash'
}

/**
 * The canvas route's ingress check, and one of two guards here that inspect a
 * payload rather than just a `source` label: the overrides map is applied to
 * an approved tree, so "it came from a window we trust" is not enough — the
 * shape has to clear `isBrandCanvasOverrides` (block count and serialized size
 * included) before a single setting is merged.
 */
export function isBrandCanvasOverridesMessage(msg: unknown): msg is BrandCanvasOverridesMessage {
  if (!isRecord(msg)) return false
  if (msg.type !== 'BRAND_CANVAS_OVERRIDES' || msg.source !== 'splash') return false
  if (!Number.isSafeInteger(msg.revision) || (msg.revision as number) < 0) return false
  return isBrandCanvasOverrides(msg.overrides)
}

export function isBrandCanvasPaintedMessage(msg: unknown): msg is BrandCanvasPaintedMessage {
  if (!isRecord(msg)) return false
  if (msg.type !== 'BRAND_CANVAS_PAINTED' || msg.source !== 'nuxt-preview') return false
  if (!Number.isSafeInteger(msg.revision) || (msg.revision as number) < 0) return false
  return msg.error === null || typeof msg.error === 'string'
}

/**
 * The parent's ingress check for the canvas route's settled signal. Deep,
 * like `isBrandCanvasOverridesMessage`: `previewWarnings` is rendered straight
 * into the workspace panel, so a same-origin frame that sends a non-string
 * warning must fail here rather than reach the DOM.
 */
export function isBrandCanvasReadyMessage(msg: unknown): msg is BrandCanvasReadyMessage {
  if (!isRecord(msg)) return false
  if (msg.type !== 'BRAND_CANVAS_READY' || msg.source !== 'nuxt-preview') return false
  if (msg.error !== null && typeof msg.error !== 'string') return false
  if (!Array.isArray(msg.warnings) || !msg.warnings.every(warning => typeof warning === 'string')) return false
  if (msg.draftRevision !== null && !isCanvasSnapshotRevision(msg.draftRevision)) return false

  // Keep impossible pairs out of the admin. In particular, only an approved
  // snapshot can be a fallback, and a successful paint can never report that
  // no source was available.
  const validRenderVerdict =
    (msg.contentSource === 'draft' && msg.fidelity === 'exact')
    || (msg.contentSource === 'approved' && (msg.fidelity === 'exact' || msg.fidelity === 'fallback'))
    || (msg.contentSource === 'render-payload' && msg.fidelity === 'exact')
    || (msg.contentSource === 'none' && msg.fidelity === 'unavailable')
  if (!validRenderVerdict) return false
  if ((msg.contentSource === 'draft' && msg.fidelity === 'exact') !== (msg.draftRevision !== null)) return false
  return msg.error !== null || msg.contentSource !== 'none'
}

export function isNuxtMessage(msg: unknown): msg is NuxtToEditorMessage {
  return isRecord(msg) && msg.source === 'nuxt-preview'
}

export function isCanvasBlockPlacementPatchMessage(
  msg: unknown,
): msg is CanvasBlockPlacementPatchMessage {
  if (!isRecord(msg)) return false
  if (msg.type !== 'CANVAS_BLOCK_PLACEMENT_PATCH' || msg.source !== 'nuxt-preview') return false
  if (typeof msg.blockId !== 'string' || msg.blockId.length === 0) return false
  return isCanvasBlockGeometry(msg.patch)
}
