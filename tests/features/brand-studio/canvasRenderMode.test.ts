import { describe, it, expect } from 'vitest'
import {
  BRAND_CANVAS_ROUTE,
  resolveBrandCanvasMode,
} from '~/shared/features/brand-studio/canvasRenderMode'
import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'
import type { BrandCanvasRenderPayload } from '~/shared/types/brandRender'

function snapshot(): BrandCanvasSnapshot {
  return { canvas: { width: 1080, height: 1080 }, sections: [], blocks: [] }
}

/** The live site shell the render service resolves per generation. */
function theme() {
  return { theme: 'standalone', themeSettings: { siteName: 'Studio' } }
}

function payload(overrides: Partial<BrandCanvasRenderPayload> = {}): BrandCanvasRenderPayload {
  return {
    kind: 'canvas',
    snapshot: snapshot(),
    overrides: null,
    width: 1080,
    height: 1080,
    theme: theme(),
    ...overrides,
  }
}

describe('resolveBrandCanvasMode', () => {
  it('is the route the render service navigates to', () => {
    // Changing this constant without changing `RENDER_ROUTE` in
    // brandTemplateRenderService.ts means Chromium screenshots a 404.
    expect(BRAND_CANVAS_ROUTE).toBe('/__preview/brand-canvas')
  })

  it('takes the injected payload when Chromium wrote one', () => {
    const injected = payload()
    const mode = resolveBrandCanvasMode(injected, {})

    expect(mode).toEqual({ kind: 'payload', payload: injected })
  })

  it('refuses a malformed injected payload instead of falling back to the admin fetch', () => {
    // The render browser carries no admin session, so a fallback here is either
    // a 401 or a screenshot of a template nobody asked for.
    const mode = resolveBrandCanvasMode(
      { kind: 'canvas', snapshot: snapshot(), overrides: null, width: 0, height: 1080, theme: theme() },
      { siteId: 'site-1', templateId: 'tpl-1' },
    )

    expect(mode.kind).toBe('unresolvable')
  })

  it('reads the admin iframe query when nothing was injected', () => {
    const mode = resolveBrandCanvasMode(undefined, { siteId: 'site-1', templateId: 'tpl-1' })

    expect(mode).toEqual({
      kind: 'admin',
      source: { siteId: 'site-1', templateId: 'tpl-1', draft: false },
    })
  })

  it('takes the first value of a repeated query key', () => {
    const mode = resolveBrandCanvasMode(undefined, {
      siteId: ['site-1', 'site-2'],
      templateId: ['tpl-1'],
    })

    expect(mode).toEqual({
      kind: 'admin',
      source: { siteId: 'site-1', templateId: 'tpl-1', draft: false },
    })
  })

  it('threads an optional Brand Identity preset through the admin preview source', () => {
    const mode = resolveBrandCanvasMode(undefined, {
      siteId: 'site-1',
      templateId: 'tpl-1',
      presetId: 'preset-blue',
    })

    expect(mode).toEqual({
      kind: 'admin',
      source: { siteId: 'site-1', templateId: 'tpl-1', presetId: 'preset-blue', draft: false },
    })
  })

  it.each([
    ['1', true],
    ['true', true],
    ['0', false],
    ['yes', false],
    [null, false],
  ])('reads ?draft=%s as %s', (raw, expected) => {
    const mode = resolveBrandCanvasMode(undefined, { siteId: 's', templateId: 't', draft: raw })

    expect(mode).toEqual({ kind: 'admin', source: { siteId: 's', templateId: 't', draft: expected } })
  })

  it('is unresolvable with neither a payload nor both query keys', () => {
    expect(resolveBrandCanvasMode(undefined, {}).kind).toBe('unresolvable')
    expect(resolveBrandCanvasMode(undefined, { siteId: 'site-1' }).kind).toBe('unresolvable')
    expect(resolveBrandCanvasMode(undefined, { templateId: 'tpl-1' }).kind).toBe('unresolvable')
    expect(resolveBrandCanvasMode(undefined, { siteId: '', templateId: 'tpl-1' }).kind).toBe('unresolvable')
  })

  it('explains both ways in, so the failure names the fix', () => {
    const mode = resolveBrandCanvasMode(undefined, {})

    expect(mode.kind === 'unresolvable' && mode.reason).toMatch(/siteId/)
    expect(mode.kind === 'unresolvable' && mode.reason).toMatch(/templateId/)
  })
})
