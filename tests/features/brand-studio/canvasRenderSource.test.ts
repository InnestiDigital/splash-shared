import { describe, it, expect } from 'vitest'
import {
  canvasSnapshotFromDraftPage,
  narrowCanvasTemplate,
  unwrapAdminPage,
} from '~/shared/features/brand-studio/canvasRenderSource'
import { isBrandCanvasSnapshot } from '~/shared/types/brandCanvas'

const CANVAS = { width: 1080, height: 1350 }

/** The theme layer the server attaches to the single-template read. */
const THEME = { theme: 'standalone', themeSettings: { siteName: 'Studio' } }

/** A section row as the admin page endpoint returns it — live motion included. */
function draftSection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sec-1',
    name: 'Poster',
    position: 0,
    sectionType: 'stacked',
    anchor: null,
    isHidden: false,
    colorScheme: 'light',
    sectionRole: null,
    containerMode: 'content',
    sectionSpaceY: 'md',
    containerInsetX: 'md',
    revealPreset: 'fade-up',
    revealOverrides: { duration: 400 },
    defaultBlockEntrance: 'rise',
    layoutConfig: null,
    // Columns the renderer never reads; they must not travel into the snapshot.
    pageId: 'page-1',
    versionId: '_draft',
    ...overrides,
  }
}

function draftBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'blk-1',
    type: 'hero-block',
    position: 0,
    sectionId: 'sec-1',
    layoutRole: null,
    settings: { title: 'Hello' },
    ...overrides,
  }
}

function approvedSnapshot(): unknown {
  return {
    canvas: { ...CANVAS },
    sections: [{ ...draftSection(), revealPreset: 'none', revealOverrides: null, defaultBlockEntrance: null }],
    blocks: [{ ...draftBlock(), options: null, placement: null }],
  }
}

describe('narrowCanvasTemplate', () => {
  it('keeps the page id, the canvas size and the approved snapshot', () => {
    const source = narrowCanvasTemplate({
      id: 'tpl-1',
      name: 'Poster',
      pageId: 'page-1',
      snapshot: approvedSnapshot(),
      status: 'approved',
      version: 3,
      width: 1080,
      height: 1350,
      createdAt: 'now',
      updatedAt: 'now',
      theme: THEME,
    })

    expect(source?.pageId).toBe('page-1')
    expect(source?.canvas).toEqual(CANVAS)
    expect(source?.snapshot?.blocks).toHaveLength(1)
    expect(source?.theme).toEqual(THEME)
  })

  it('reads an unparseable snapshot as null rather than dropping the row', () => {
    // The draft arm can still paint, and an author must keep the ability to act
    // on the very template that is broken.
    const source = narrowCanvasTemplate({
      pageId: 'page-1',
      snapshot: { canvas: { width: 1, height: 1 }, sections: [], blocks: [] },
      width: 1080,
      height: 1350,
      theme: THEME,
    })

    expect(source).not.toBeNull()
    expect(source?.snapshot).toBeNull()
  })

  it('rejects a row with no page id or no size', () => {
    expect(narrowCanvasTemplate({ snapshot: null, width: 1080, height: 1350, theme: THEME })).toBeNull()
    expect(narrowCanvasTemplate({ pageId: 'page-1', snapshot: null, width: 1080, theme: THEME })).toBeNull()
    expect(narrowCanvasTemplate('page-1')).toBeNull()
    expect(narrowCanvasTemplate(null)).toBeNull()
  })

  it('rejects the WHOLE row when the theme layer is missing or malformed', () => {
    // The opposite call to the snapshot's: a bad snapshot degrades to null
    // because the draft arm can still paint, but there is no second source for
    // the shell — painting on would ship a plausible asset in fallback type.
    const row = { pageId: 'page-1', snapshot: null, width: 1080, height: 1350 }

    expect(narrowCanvasTemplate(row)).toBeNull()
    expect(narrowCanvasTemplate({ ...row, theme: { themeSettings: {} } })).toBeNull()
    expect(narrowCanvasTemplate({ ...row, theme: 'standalone' })).toBeNull()
  })
})

describe('canvasSnapshotFromDraftPage', () => {
  it('serializes a draft tree into the snapshot contract', () => {
    const snapshot = canvasSnapshotFromDraftPage(CANVAS, {
      sections: [draftSection()],
      blocks: [draftBlock()],
    })

    expect(snapshot).not.toBeNull()
    expect(isBrandCanvasSnapshot(snapshot)).toBe(true)
    expect(snapshot?.canvas).toEqual(CANVAS)
    expect(snapshot?.blocks[0]).toMatchObject({ id: 'blk-1', sectionId: 'sec-1', options: null, placement: null })
  })

  it('pins motion off, whatever the live section says', () => {
    // A canvas is captured in one unscrolled frame: a live reveal preset paints
    // the section at opacity 0 and exports a blank asset.
    const snapshot = canvasSnapshotFromDraftPage(CANVAS, {
      sections: [draftSection()],
      blocks: [],
    })

    expect(snapshot?.sections[0]).toMatchObject({
      revealPreset: 'none',
      revealOverrides: null,
      defaultBlockEntrance: null,
    })
  })

  it('takes the canvas size from the template row, not from the page', () => {
    const snapshot = canvasSnapshotFromDraftPage(CANVAS, {
      canvas: { width: 100, height: 100 },
      meta: { brandCanvas: { templateId: 'tpl-1', width: 100, height: 100 } },
      sections: [],
      blocks: [],
    })

    expect(snapshot?.canvas).toEqual(CANVAS)
  })

  it('drops the columns the renderer does not read', () => {
    const snapshot = canvasSnapshotFromDraftPage(CANVAS, { sections: [draftSection()], blocks: [] })

    expect(snapshot?.sections[0]).not.toHaveProperty('pageId')
    expect(snapshot?.sections[0]).not.toHaveProperty('versionId')
  })

  it('returns null when a section carries a type this build has no layout for', () => {
    const snapshot = canvasSnapshotFromDraftPage(CANVAS, {
      sections: [draftSection({ sectionType: 'carousel' })],
      blocks: [],
    })

    expect(snapshot).toBeNull()
  })

  it('returns null for a canvas size outside the renderable range', () => {
    const snapshot = canvasSnapshotFromDraftPage({ width: 8, height: 8 }, { sections: [], blocks: [] })

    expect(snapshot).toBeNull()
  })

  it('treats a missing or non-array tree as empty rather than failing', () => {
    expect(canvasSnapshotFromDraftPage(CANVAS, {})).toEqual({ canvas: CANVAS, layout: null, layoutOverrides: null, sections: [], blocks: [] })
    expect(canvasSnapshotFromDraftPage(CANVAS, null)).toBeNull()
  })
})

describe('unwrapAdminPage', () => {
  it('unwraps the endpoint envelope', () => {
    expect(unwrapAdminPage({ page: { id: 'page-1' } })).toEqual({ id: 'page-1' })
    expect(unwrapAdminPage({})).toBeUndefined()
    expect(unwrapAdminPage(null)).toBeNull()
  })
})
