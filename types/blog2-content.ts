// shared/types/blog2-content.ts

export type AllowedTemplateFieldType =
  | 'text'
  | 'textarea'
  | 'richtext-single'
  | 'richtext-inline'
  | 'richtext-block'
  | 'image'
  | 'image-gallery'
  | 'select'
  | 'boolean'
  | 'number'
  | 'date'

export interface TemplateFieldSchema {
  /** V2 allowlisted field type. parseTemplates rejects anything outside the allowlist for contentSchema. */
  type: AllowedTemplateFieldType
  id: string
  label: string | Record<string, string>
  default?: any
  /** For select fields. Same shape as block-side options (array of { value, label } or { source: '...' }). */
  options?: any
  showIf?: { field: string; equals: any }
  translatable?: boolean

  // V2 additions
  /** Hint for the article-manager UI to lay out the form. The renderer also
   *  uses some roles (title/excerpt/featuredImage) to sync canonical fields. */
  role?: 'title' | 'excerpt' | 'body' | 'gallery' | 'sidebar' | 'seo' | 'meta'
  /** Required-on-save. Server validator rejects with 400 when missing. */
  required?: boolean
  /** Inline guidance shown next to / below the label in the manager UI. */
  helpText?: string | Record<string, string>
  /** Group id the field is filed under. Supplied by settings fragments. */
  group?: string
  /** Short note rendered under the control. Supplied by settings fragments. */
  note?: string
  /** Numeric bounds for `type: 'number'` fields. */
  min?: number
  max?: number
  /**
   * The stored key this field used to be spelled as, plus the value re-spelling
   * that came with the rename. Read on the way OUT of the database, so a page
   * authored before the rename keeps its value without a write migration.
   */
  migratedFrom?: { id: string, valueMap?: Record<string, unknown> }
}

/**
 * Item shape for image-gallery fields. Stored verbatim in contentData.
 * Stable `id` per item (NOT the media id) lets reorder preserve Vue keying.
 * Renderer resolves `mediaId` to a URL via the response's `media` map; templates
 * never build /api/media/<id> URLs themselves.
 */
export interface GalleryItem {
  id: string
  mediaId: string
  caption?: Record<string, string>
  alt?: Record<string, string>
  focalPoint?: { x: number; y: number }
}

/** Runtime-checked set used by parseTemplates and the content validator. */
export const ALLOWED_TEMPLATE_FIELD_TYPES: ReadonlySet<AllowedTemplateFieldType> = new Set([
  'text',
  'textarea',
  'richtext-single',
  'richtext-inline',
  'richtext-block',
  'image',
  'image-gallery',
  'select',
  'boolean',
  'number',
  'date',
])
