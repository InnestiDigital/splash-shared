/**
 * Three richtext authoring surfaces. Order is intentional (single ⊂ inline ⊂ block).
 * - single: one line, inline marks only, no <p>/<br>/<ul>
 * - inline: inline marks + hard breaks (<br>), no paragraphs/lists
 * - block:  paragraphs, lists, links, all inline marks (= legacy `richtext`)
 */
export const RICHTEXT_MODES = ['single', 'inline', 'block'] as const
export type RichtextMode = typeof RICHTEXT_MODES[number]

export function isRichtextMode(value: unknown): value is RichtextMode {
  return typeof value === 'string' && (RICHTEXT_MODES as readonly string[]).includes(value)
}

/**
 * Map a schema field `type` to its richtext mode. Returns null for non-richtext
 * fields. The legacy `"richtext"` value aliases to `"block"` for backwards
 * compatibility — every existing richtext field continues to behave as
 * richtext-block until explicitly migrated to a narrower variant.
 */
export function modeFromFieldType(type: string): RichtextMode | null {
  if (type === 'richtext-single') return 'single'
  if (type === 'richtext-inline') return 'inline'
  if (type === 'richtext-block' || type === 'richtext') return 'block'
  return null
}
