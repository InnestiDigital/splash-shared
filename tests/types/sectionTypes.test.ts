import { describe, it, expect } from 'vitest'
import {
  SECTION_COLOR_SCHEMES,
  SECTION_CONTAINER_MODES,
} from '~/shared/types/sectionTypes'
import { BRAND_CANVAS_REVEAL_PRESET, isBrandCanvasSnapshot } from '~/shared/types/brandCanvas'

/**
 * The arrays exist so the digest vocabulary, the editor-op enum and the type
 * union cannot drift apart (spec §10 conflict D). The assertion that matters is
 * therefore not "the array has these five strings" — it is that every value the
 * array publishes is a value the repository's own section validator accepts.
 * `isBrandCanvasSnapshot` is the only exported guard that parses both fields.
 */
function snapshotWith(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    canvas: { width: 1200, height: 630 },
    sections: [{
      id: 'section-1',
      name: 'Stage',
      position: 0,
      sectionType: 'stacked',
      anchor: null,
      isHidden: false,
      colorScheme: 'light',
      sectionRole: null,
      containerMode: 'measure',
      sectionSpaceY: 'md',
      containerInsetX: 'md',
      revealPreset: BRAND_CANVAS_REVEAL_PRESET,
      revealOverrides: null,
      defaultBlockEntrance: null,
      layoutConfig: null,
      ...patch,
    }],
    blocks: [],
  }
}

describe('section presentation vocabulary', () => {
  it('publishes only colour schemes the canvas section guard accepts', () => {
    for (const colorScheme of SECTION_COLOR_SCHEMES) {
      expect(isBrandCanvasSnapshot(snapshotWith({ colorScheme })), colorScheme).toBe(true)
    }
    expect(isBrandCanvasSnapshot(snapshotWith({ colorScheme: 'neon' }))).toBe(false)
  })

  it('publishes only container modes the canvas section guard accepts', () => {
    for (const containerMode of SECTION_CONTAINER_MODES) {
      expect(isBrandCanvasSnapshot(snapshotWith({ containerMode })), containerMode).toBe(true)
    }
    expect(isBrandCanvasSnapshot(snapshotWith({ containerMode: 'edge' }))).toBe(false)
  })
})
