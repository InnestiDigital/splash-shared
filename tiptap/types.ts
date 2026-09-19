/**
 * Shared TipTap document type — used by editor, serializer, migration, and tests.
 *
 * This is a structural type matching TipTap's JSONContent shape,
 * narrowed to require `type: 'doc'` at the root.
 */

export interface TipTapNode {
  type: string
  attrs?: Record<string, any>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

export interface TipTapMark {
  type: string
  attrs?: Record<string, any>
}

export interface TipTapDocument {
  type: 'doc'
  content: TipTapNode[]
}

/**
 * Type guard: checks if a value is a TipTap JSON document.
 * Used to distinguish JSON docs from HTML strings and locale maps.
 */
export function isTipTapDocument(value: unknown): value is TipTapDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).type === 'doc' &&
    Array.isArray((value as any).content)
  )
}
