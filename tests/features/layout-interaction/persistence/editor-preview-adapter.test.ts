import { describe, it, expect } from 'vitest'
import type { PositionedItemAuthored } from '../../../../../shared/features/layout-interaction/types'
import { createEditorPreviewAdapter } from '../../../../../shared/features/layout-interaction/persistence/editor-preview-adapter'

describe('EditorPreviewPersistenceAdapter', () => {
  it('hydrate returns authored unchanged (geometry only)', () => {
    const sent: any[] = []
    const a = createEditorPreviewAdapter<PositionedItemAuthored>(m => sent.push(m))
    const items: PositionedItemAuthored[] = [{ id: 'a', positionX: 0, positionY: 0, width: 10, height: 10, rotation: 0, zIndex: 1 }]
    expect(a.hydrate(items, { blockId: 'b', configVersion: 'v', authoredItems: items, layoutFingerprint: 'fp' })).toEqual(items)
  })

  it('preview is intentionally omitted to avoid per-frame PUT storms', () => {
    // See editor-preview-adapter.ts: preview() would otherwise trigger the
    // admin's whole-settings PUT on every RAF-throttled frame, and
    // out-of-order server responses clobber each other. Drag is persisted
    // on commit (pointer-up) only; live inspector sync can come back via a
    // dedicated non-persistent preview channel later.
    const a = createEditorPreviewAdapter(() => {})
    expect(a.preview).toBeUndefined()
  })

  it('commit forwards the geometry patch and adapter context unchanged', () => {
    const sent: any[] = []
    const a = createEditorPreviewAdapter((patch, context) => sent.push({ patch, context }))
    a.commit({ id: 'x', positionX: 1, positionY: 2, width: 3, height: 4, rotation: 5, zIndex: 6 },
      { blockId: 'b', configVersion: 'v', authoredItems: [], layoutFingerprint: 'fp' })
    expect(sent[0].patch).toEqual({ id: 'x', positionX: 1, positionY: 2, width: 3, height: 4, rotation: 5, zIndex: 6 })
    expect(sent[0].context.blockId).toBe('b')
  })
})
