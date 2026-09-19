import type { TipTapDocument } from './types'
import type { RichtextMode } from './richtextModes'

export interface SeedOptions {
  mode: RichtextMode
  defaultPresetKey: string | undefined | null
}

/**
 * Build a TipTap doc to seed an empty BLOCK-mode richtext field with the
 * field's default typography preset already applied. Returns null in
 * single + inline modes (and when no defaultPresetKey is set).
 *
 * Block mode: paragraph carries the presetKey attr (TypographyParagraph
 * extension consumes it → emits <p class="rt-preset-X"> on first paint).
 *
 * Single + inline modes: NO seed. Empty fields render via role cascade
 * (--rt-role-X-*) until the author explicitly picks a preset from the
 * dropdown. First-keystroke auto-apply was considered and rejected
 * (transaction-ordering ambiguity + re-entrancy risk).
 */
export function seedDefaultDoc(opts: SeedOptions): TipTapDocument | null {
  if (!opts.defaultPresetKey) return null
  if (opts.mode !== 'block') return null
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      attrs: { presetKey: opts.defaultPresetKey },
      content: [],
    }],
  }
}
