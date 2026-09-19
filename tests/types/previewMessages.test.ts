import { describe, it, expect } from 'vitest'
import {
  isBrandCanvasOverridesMessage,
  isBrandCanvasPaintedMessage,
  isBrandCanvasReadyMessage,
  isCanvasBlockPlacementPatchMessage,
} from '~/shared/types/previewMessages'
import { BRAND_CANVAS_OVERRIDE_MAX_BLOCKS } from '~/shared/types/brandCanvas'

describe('isCanvasBlockPlacementPatchMessage', () => {
  it('accepts bounded canvas geometry and rejects malformed or unsafe values', () => {
    expect(isCanvasBlockPlacementPatchMessage({
      type: 'CANVAS_BLOCK_PLACEMENT_PATCH',
      source: 'nuxt-preview',
      blockId: 'block-1',
      patch: { x: 50, y: 40, width: 30, height: 20, rotation: 0, zIndex: 2, locked: false },
    })).toBe(true)
    expect(isCanvasBlockPlacementPatchMessage({
      type: 'CANVAS_BLOCK_PLACEMENT_PATCH',
      source: 'nuxt-preview',
      blockId: 'block-1',
      patch: { width: 1 },
    })).toBe(false)
    expect(isCanvasBlockPlacementPatchMessage({
      type: 'CANVAS_BLOCK_PLACEMENT_PATCH',
      source: 'splash',
      blockId: 'block-1',
      patch: { x: 50 },
    })).toBe(false)
  })
})

describe('isBrandCanvasOverridesMessage', () => {
  it('accepts a well-formed override push', () => {
    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'splash',
      revision: 1,
      overrides: { 'blk-1': { heading: 'Spring sale' } },
    })).toBe(true)
  })

  it('accepts an empty map — "this generation overrides nothing" is a real state', () => {
    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'splash',
      revision: 0,
      overrides: {},
    })).toBe(true)
  })

  it('rejects another surface\'s messages and other senders', () => {
    expect(isBrandCanvasOverridesMessage({
      type: 'CONFIG_UPDATE',
      source: 'splash',
      overrides: {},
    })).toBe(false)
    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'nuxt-preview',
      revision: 1,
      overrides: {},
    })).toBe(false)
  })

  it('rejects a payload that fails the override contract, not just the envelope', () => {
    // The map is applied to an APPROVED tree, so "it came from a window we
    // trust" is not enough — the caps have to hold too.
    const tooManyBlocks: Record<string, Record<string, unknown>> = {}
    for (let i = 0; i <= BRAND_CANVAS_OVERRIDE_MAX_BLOCKS; i++) tooManyBlocks[`blk-${i}`] = { a: 1 }

    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'splash',
      revision: 1,
      overrides: tooManyBlocks,
    })).toBe(false)
    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'splash',
      revision: 1,
      overrides: { 'blk-1': 'not-a-settings-map' },
    })).toBe(false)
    expect(isBrandCanvasOverridesMessage({
      type: 'BRAND_CANVAS_OVERRIDES',
      source: 'splash',
    })).toBe(false)
  })

  it('rejects non-objects without throwing', () => {
    expect(isBrandCanvasOverridesMessage(null)).toBe(false)
    expect(isBrandCanvasOverridesMessage('BRAND_CANVAS_OVERRIDES')).toBe(false)
    expect(isBrandCanvasOverridesMessage([])).toBe(false)
  })

  it('requires a non-negative safe integer revision', () => {
    for (const revision of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isBrandCanvasOverridesMessage({
        type: 'BRAND_CANVAS_OVERRIDES',
        source: 'splash',
        revision,
        overrides: {},
      })).toBe(false)
    }
  })
})

describe('isBrandCanvasPaintedMessage', () => {
  it('accepts settled success and failure acknowledgements', () => {
    expect(isBrandCanvasPaintedMessage({
      type: 'BRAND_CANVAS_PAINTED', source: 'nuxt-preview', revision: 3, error: null,
    })).toBe(true)
    expect(isBrandCanvasPaintedMessage({
      type: 'BRAND_CANVAS_PAINTED', source: 'nuxt-preview', revision: 4, error: 'Image failed',
    })).toBe(true)
  })

  it('rejects malformed acknowledgements', () => {
    expect(isBrandCanvasPaintedMessage({
      type: 'BRAND_CANVAS_PAINTED', source: 'splash', revision: 1, error: null,
    })).toBe(false)
    expect(isBrandCanvasPaintedMessage({
      type: 'BRAND_CANVAS_PAINTED', source: 'nuxt-preview', revision: -1, error: null,
    })).toBe(false)
    expect(isBrandCanvasPaintedMessage({
      type: 'BRAND_CANVAS_PAINTED', source: 'nuxt-preview', revision: 1, error: 42,
    })).toBe(false)
  })
})

describe('isBrandCanvasReadyMessage', () => {
  const draftRevision = 'a'.repeat(64)

  it('accepts a settled-with-error-null message', () => {
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
      contentSource: 'draft',
      fidelity: 'exact',
      draftRevision,
    })).toBe(true)
  })

  it('accepts a settled failure and the explicit approved-fallback verdict', () => {
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: 'Unknown block type',
      warnings: ['Missing media', 'Unregistered block type'],
      contentSource: 'render-payload',
      fidelity: 'exact',
      draftRevision: null,
    })).toBe(true)
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
      contentSource: 'approved',
      fidelity: 'fallback',
      draftRevision: null,
    })).toBe(true)
  })

  it('rejects impossible source/fidelity pairs and a source-less success', () => {
    for (const verdict of [
      { contentSource: 'draft', fidelity: 'fallback' },
      { contentSource: 'render-payload', fidelity: 'fallback' },
      { contentSource: 'none', fidelity: 'exact' },
      { contentSource: 'approved', fidelity: 'unavailable' },
      { contentSource: 'none', fidelity: 'unavailable' },
    ]) {
      expect(isBrandCanvasReadyMessage({
        type: 'BRAND_CANVAS_READY',
        source: 'nuxt-preview',
        error: null,
        warnings: [],
        draftRevision: null,
        ...verdict,
      })).toBe(false)
    }
  })

  it('rejects another surface\'s messages and other senders', () => {
    expect(isBrandCanvasReadyMessage({
      type: 'PREVIEW_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
    })).toBe(false)
    // Label-only check would have let this through: the source claims splash,
    // not the preview iframe.
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'splash',
      error: null,
      warnings: [],
    })).toBe(false)
  })

  it('rejects a non-string, non-null error and a non-string warning entry', () => {
    // A same-origin frame putting a non-string into `warnings` must not reach
    // the panel that renders it straight into the DOM.
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: 42,
      warnings: [],
    })).toBe(false)
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: ['fine', 7],
    })).toBe(false)
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: 'not-an-array',
    })).toBe(false)
  })

  it('rejects a message missing required settled-verdict fields', () => {
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
    })).toBe(false)
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
      contentSource: 'draft',
    })).toBe(false)
  })

  it('requires a revision only for the exact draft verdict', () => {
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
      contentSource: 'draft',
      fidelity: 'exact',
      draftRevision: null,
    })).toBe(false)
    expect(isBrandCanvasReadyMessage({
      type: 'BRAND_CANVAS_READY',
      source: 'nuxt-preview',
      error: null,
      warnings: [],
      contentSource: 'approved',
      fidelity: 'exact',
      draftRevision,
    })).toBe(false)
  })

  it('rejects non-objects without throwing', () => {
    expect(isBrandCanvasReadyMessage(null)).toBe(false)
    expect(isBrandCanvasReadyMessage('BRAND_CANVAS_READY')).toBe(false)
    expect(isBrandCanvasReadyMessage([])).toBe(false)
  })
})
