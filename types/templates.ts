// shared/types/templates.ts
import type { TemplateFieldSchema } from './blog2-content'

/**
 * `brand-canvas` is a Brand Content Studio template's content. It is a page in
 * every mechanical sense (sections, blocks, the editor's own endpoints) and a
 * page in NO public sense: the public surfaces name the types they serve
 * (`clientExportService`, `sitemap.xml`, `routeResolutionService`), so a canvas
 * is invisible to them by omission rather than by a scattered `!== 'brand-canvas'`.
 */
export type PageType = 'static' | 'blog-index' | 'article' | 'brand-canvas'

/**
 * The page types a theme template may target. A brand canvas takes its blocks
 * from the brand template row, never from a theme template, so it is excluded
 * here — `themeTemplates.parseTemplates` rejects any other `appliesTo` at load
 * time, and deriving this from `PageType` keeps the two from drifting.
 */
export type TemplatePageType = Exclude<PageType, 'brand-canvas'>

export interface PageTemplateDefaultBlock {
  type: string
  settings?: Record<string, unknown>
}

export interface PageTemplateDefaultSeo {
  metaTitle?: Record<string, string> | null
  metaDescription?: Record<string, string> | null
  ogImageId?: string | null
  noIndex?: boolean
}

export interface PageTemplate {
  id: string
  label: string
  appliesTo: TemplatePageType
  layoutId: string
  allowedBlocks: string[]
  defaultBlocks: PageTemplateDefaultBlock[]
  defaultSeo?: PageTemplateDefaultSeo

  // V2 additions — populated only for structured templates.
  /** Theme-relative path to the renderer Vue component. Validated against templates/<id>.vue regex. */
  component?: string
  /** Client-edited fields. When present, defaultBlocks must be empty (mode-exclusive). */
  contentSchema?: TemplateFieldSchema[]
  /** Admin-edited design knobs. */
  settingsSchema?: TemplateFieldSchema[]
  /**
   * Settings fragments merged into `settingsSchema` at load time
   * (`themes/<theme>/settings-fragments/<id>.json`). Resolved away before the
   * template reaches admin or render code.
   */
  $fragments?: string[]
  /** Free-form version label (recommended semver-shape). Stamped on article saves into pages.template_version. */
  version?: string
  /** Defaults applied at create + render time when fields are missing. */
  defaultContent?: Record<string, any>
  defaultSettings?: Record<string, any>
}
