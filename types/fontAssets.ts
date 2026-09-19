/**
 * Shared types for custom font upload pipeline (SPL-115).
 *
 * `FontAsset` — editor-facing record describing a single uploaded font file
 * stored in the site's asset storage. Persisted in the `font_assets` table.
 *
 * `FontFaceDeclaration` — snapshot-ready payload included in the published
 * client config. Consumed by `shared/composables/useFontFaces.ts` to generate
 * `@font-face` CSS rules at runtime. URLs are frozen at publish time so
 * snapshots stay valid even if the source asset is later deleted.
 */

export type FontStyle = 'normal' | 'italic'

export interface FontAsset {
  id: string
  siteId: string
  name: string
  familyKey: string
  fileName: string
  mimeType: string
  fileSize: number
  url: string
  weight: number
  style: FontStyle
  fallbackStack?: string | null
  isVariableFont: boolean
  axesJson?: Record<string, [number, number]> | null
  refCount: number
  createdAt: string
  updatedAt: string
  createdBy?: string | null
}

export interface FontFaceDeclaration {
  /** CSS font-family name surfaced to editors */
  name: string
  /** URL or data: src for the font file */
  src: string
  /** CSS font-weight (numeric, per @font-face spec) */
  weight: number
  /** CSS font-style */
  style: FontStyle
  /** font-display hint, default 'swap' */
  display?: 'swap' | 'block' | 'fallback' | 'optional'
  /** Optional CSS fallback stack (e.g. "Georgia, serif") */
  fallback?: string | null
  /** True when declaration represents an editor-uploaded font (vs theme-bundled) */
  uploaded?: boolean
}

export interface FontUploadMetadata {
  name: string
  weight?: number
  style?: FontStyle
  fallbackStack?: string | null
}
