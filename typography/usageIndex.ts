import { isTipTapDocument, type TipTapDocument, type TipTapNode } from '~/shared/tiptap/types'

/**
 * Typography preset usage across a site's content.
 *
 * Counts how many block-level slot overrides reference a preset key
 * (keyed by preset.key) and how many TipTap paragraph/inline marks
 * reference it. Used by fetchPresetUsage and the publish-time
 * diagnostics to flag stale references.
 */
export interface PresetUsageIndex {
  /** preset key → number of block slot references (across all blocks, all pages) */
  blockSlot: Record<string, number>
  /** preset key → number of TipTap paragraph node references (attrs.presetKey) */
  richTextParagraph: Record<string, number>
  /** preset key → number of TipTap inline mark references (inlineTypographyPreset marks) */
  richTextInline: Record<string, number>
}

/**
 * Create an empty usage index. Helpful for tests and as a starting point
 * when accumulating counts across multiple sources.
 */
export function createEmptyUsageIndex(): PresetUsageIndex {
  return {
    blockSlot: {},
    richTextParagraph: {},
    richTextInline: {},
  }
}

/**
 * Increment a counter in the index for a given preset key.
 */
function bump(map: Record<string, number>, key: string | null | undefined): void {
  if (!key || typeof key !== 'string') return
  map[key] = (map[key] ?? 0) + 1
}

/**
 * Scan a single block's settings for typography slot references.
 *
 * Block-level slot overrides follow the naming convention
 * `{slot}PresetKey` at the top of `block.settings`. We match any
 * top-level key ending in `PresetKey` whose value is a non-empty
 * string — that's the preset key the block is pinning.
 *
 * We also walk the settings recursively to catch preset references
 * inside richtext fields (TipTap JSON docs), repeater sub-blocks,
 * and nested `blocks`-type fields.
 */
export function indexBlockSettings(
  settings: Record<string, any> | null | undefined,
  index: PresetUsageIndex,
): void {
  if (!settings || typeof settings !== 'object') return

  for (const [key, value] of Object.entries(settings)) {
    // Block-level slot override: `{slot}PresetKey` → preset key string
    if (key.endsWith('PresetKey') && typeof value === 'string' && value.length > 0) {
      bump(index.blockSlot, value)
      continue
    }

    // Recurse into nested structures.
    if (value === null || value === undefined) continue

    if (isTipTapDocument(value)) {
      indexTipTapDocument(value, index)
      continue
    }

    // Object value: locale map, nested settings, or any plain sub-object.
    // Recurse once — the recursive call handles TipTap docs and slot keys
    // encountered at deeper levels correctly.
    if (typeof value === 'object' && !Array.isArray(value)) {
      indexBlockSettings(value as Record<string, any>, index)
      continue
    }

    // Arrays: walk each element. For the nested-block shape ({type, settings})
    // recurse into settings only. For plain repeater items (flat field bags),
    // recurse into the item as a whole. Don't do both — that double-counts.
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== 'object') continue
        if ('settings' in item && typeof (item as any).settings === 'object') {
          indexBlockSettings((item as any).settings, index)
        } else {
          indexBlockSettings(item as Record<string, any>, index)
        }
      }
    }
  }
}

/**
 * Walk a TipTap JSON document recording every preset key reference.
 *
 * Two reference types:
 *  - paragraph node with `attrs.presetKey` set (applied by TypographyParagraph extension)
 *  - inline text marks of type `inlineTypographyPreset` with `attrs.presetKey` set
 */
export function indexTipTapDocument(doc: TipTapDocument, index: PresetUsageIndex): void {
  walkNode(doc as unknown as TipTapNode, index)
}

function walkNode(node: TipTapNode, index: PresetUsageIndex): void {
  if (!node || typeof node !== 'object') return

  // Paragraph preset: lives in attrs.presetKey on paragraph nodes.
  if (node.type === 'paragraph' && node.attrs?.presetKey) {
    bump(index.richTextParagraph, node.attrs.presetKey)
  }

  // Inline preset marks: any text node can carry an inlineTypographyPreset mark.
  if (node.marks && Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (mark?.type === 'inlineTypographyPreset' && mark.attrs?.presetKey) {
        bump(index.richTextInline, mark.attrs.presetKey)
      }
    }
  }

  // Recurse into children.
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      walkNode(child, index)
    }
  }
}

/**
 * Build a usage index for an entire collection of blocks (from a site).
 * Typically called with all draft blocks across all pages.
 */
export function buildUsageIndex(
  blocks: Array<{ settings?: Record<string, any> | null }>,
): PresetUsageIndex {
  const index = createEmptyUsageIndex()
  for (const block of blocks) {
    indexBlockSettings(block.settings, index)
  }
  return index
}

/**
 * Look up the total reference count for a specific preset key across
 * block slots + TipTap paragraphs + TipTap inline marks.
 */
export function getKeyUsage(
  index: PresetUsageIndex,
  presetKey: string,
): { blockSlot: number; richTextParagraph: number; richTextInline: number; total: number } {
  const blockSlot = index.blockSlot[presetKey] ?? 0
  const richTextParagraph = index.richTextParagraph[presetKey] ?? 0
  const richTextInline = index.richTextInline[presetKey] ?? 0
  return {
    blockSlot,
    richTextParagraph,
    richTextInline,
    total: blockSlot + richTextParagraph + richTextInline,
  }
}
