import { describe, expect, it } from 'vitest'
import {
  computeCanvasSnapshotRevision,
  isCanvasSnapshotRevision,
} from '~/shared/features/brand-studio/canvasSnapshotRevision'
import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'

function snapshot(settings: Record<string, unknown>): BrandCanvasSnapshot {
  return {
    canvas: { width: 1080, height: 1080 },
    sections: [],
    blocks: [{
      id: 'block-1',
      type: 'TextSection',
      position: 0,
      sectionId: null,
      layoutRole: null,
      settings,
      options: null,
      placement: null,
    }],
  }
}

describe('canvas snapshot revision', () => {
  it('is stable across nested object insertion order', async () => {
    const left = snapshot({ heading: 'Hello', nested: { b: 2, a: 1 } })
    const right = snapshot({ nested: { a: 1, b: 2 }, heading: 'Hello' })
    expect(await computeCanvasSnapshotRevision(left)).toBe(await computeCanvasSnapshotRevision(right))
  })

  it('changes when visible content changes', async () => {
    expect(await computeCanvasSnapshotRevision(snapshot({ heading: 'Before' })))
      .not.toBe(await computeCanvasSnapshotRevision(snapshot({ heading: 'After' })))
  })

  it('validates the full lowercase SHA-256 wire shape', async () => {
    const revision = await computeCanvasSnapshotRevision(snapshot({ heading: 'Hello' }))
    expect(isCanvasSnapshotRevision(revision)).toBe(true)
    expect(isCanvasSnapshotRevision(revision.slice(1))).toBe(false)
    expect(isCanvasSnapshotRevision(revision.toUpperCase())).toBe(false)
  })
})
