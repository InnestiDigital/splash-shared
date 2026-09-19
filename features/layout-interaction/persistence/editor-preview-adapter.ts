import type { PositionedItemAuthored, PositionedItemPatch } from '../types'
import type { AdapterContext, LayoutPersistenceAdapter } from './adapter'

/**
 * The substrate owns geometry, not an adopter's postMessage vocabulary.
 * Scatter and top-level canvas layers map this callback to their own message
 * types while sharing identical commit-on-release behaviour.
 */
export type CommitToEditor = (patch: PositionedItemPatch, context: AdapterContext) => void

export function createEditorPreviewAdapter<T extends PositionedItemAuthored>(
  commitToEditor: CommitToEditor,
): LayoutPersistenceAdapter<T> {
  return {
    hydrate(authored) { return [...authored] },
    // NOTE: preview() is intentionally omitted. Every preview emission would
    // round-trip through the admin store's PUT pipeline (one API call per
    // RAF-throttled frame during drag), and out-of-order responses clobber
    // each other — producing the "snap back to previous position" artifact
    // on fast gestures. Live inspector-readout sync is a nice-to-have that
    // can be added back later with a non-persistent preview channel
    // (e.g. SCATTER_ITEM_PREVIEW for in-memory-only updates).
    commit(patch, ctx) { commitToEditor(patch, ctx) },
    revert() {},
    clearOverrides() {},
  }
}
