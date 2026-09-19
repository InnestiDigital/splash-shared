import { describe, it, expect } from 'vitest'
import {
  BRAND_TEMPLATE_NAME_MAX_LENGTH,
  BRAND_TEMPLATE_STATUSES,
  isBrandTemplateCreateRequest,
  isBrandTemplateStatus,
  isBrandTemplateCuration,
  isBrandTemplateUpdateRequest,
  narrowBrandTemplateRow,
  BRAND_TEMPLATE_CURATION_MAX_SETTINGS,
} from '~/shared/types/brandTemplate'
import {
  BRAND_CANVAS_MAX_SIZE,
  BRAND_CANVAS_MIN_SIZE,
  BRAND_CANVAS_OVERRIDE_MAX_BLOCKS,
} from '~/shared/types/brandCanvas'

/**
 * The STORED tier's guards. These are the only parse of a `brand_format_templates`
 * write — the CRUD service trusts whatever clears them and goes straight to the
 * row — and they are reached ONLY from `server/api/**`, which is excluded from
 * both coverage and mutation. So nothing else in the suite exercises them, and a
 * hole here is a hole in every authoring write.
 *
 * Written as boundary pairs for the same reason the render guards above are:
 * every bound is a length or an enum, and an off-by-one in either is the failure
 * mode that reaches the database.
 */

function createRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Launch card', width: 1200, height: 630, ...overrides }
}

describe('isBrandTemplateStatus', () => {
  it('accepts exactly the two declared statuses', () => {
    expect(BRAND_TEMPLATE_STATUSES).toEqual(['draft', 'approved'])
    for (const status of BRAND_TEMPLATE_STATUSES) {
      expect(isBrandTemplateStatus(status)).toBe(true)
    }
  })

  it('rejects a plausible-but-undeclared status, and every non-string', () => {
    expect(isBrandTemplateStatus('archived')).toBe(false)
    expect(isBrandTemplateStatus('Draft')).toBe(false)
    expect(isBrandTemplateStatus('')).toBe(false)
    expect(isBrandTemplateStatus(undefined)).toBe(false)
    expect(isBrandTemplateStatus(null)).toBe(false)
    expect(isBrandTemplateStatus(0)).toBe(false)
    expect(isBrandTemplateStatus(['draft'])).toBe(false)
  })
})

describe('isBrandTemplateCreateRequest', () => {
  it('accepts a name and a canvas — the only fields a create carries', () => {
    expect(isBrandTemplateCreateRequest(createRequest())).toBe(true)
  })

  it('rejects non-records, including arrays and null', () => {
    expect(isBrandTemplateCreateRequest(null)).toBe(false)
    expect(isBrandTemplateCreateRequest(undefined)).toBe(false)
    expect(isBrandTemplateCreateRequest('Launch card')).toBe(false)
    expect(isBrandTemplateCreateRequest([createRequest()])).toBe(false)
  })

  it('requires a name with visible characters, bounded at the column width', () => {
    expect(isBrandTemplateCreateRequest(createRequest({ name: '' }))).toBe(false)
    // Whitespace-only is a name in `length` terms and not in any other — the row
    // would list in the admin UI as a blank entry nobody can identify.
    expect(isBrandTemplateCreateRequest(createRequest({ name: '   ' }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ name: '\n\t ' }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ name: 'x' }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ name: 'x'.repeat(BRAND_TEMPLATE_NAME_MAX_LENGTH) }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ name: 'x'.repeat(BRAND_TEMPLATE_NAME_MAX_LENGTH + 1) }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ name: 42 }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ name: undefined }))).toBe(false)
  })

  it('clamps each canvas dimension independently', () => {
    expect(isBrandTemplateCreateRequest(createRequest({ width: BRAND_CANVAS_MIN_SIZE - 1 }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ width: BRAND_CANVAS_MIN_SIZE }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ height: BRAND_CANVAS_MAX_SIZE }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ height: BRAND_CANVAS_MAX_SIZE + 1 }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ width: 1200.5 }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ height: '630' }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ width: undefined }))).toBe(false)
  })

  it('accepts an optional layoutId — the art direction, shape-checked only', () => {
    // Whether the id is a real art direction needs the site's theme manifest,
    // which this guard does not have. The SERVICE answers that, with a 400 and
    // never a fall back to blank; the guard's only job is to refuse a shape.
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: 'scale-canvas' }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: undefined }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: 'not-a-real-layout' }))).toBe(true)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: '' }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: null }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: 42 }))).toBe(false)
    expect(isBrandTemplateCreateRequest(createRequest({ layoutId: ['blank'] }))).toBe(false)
  })

  it('ignores markup-tier fields rather than accepting them as content', () => {
    // Content lives on the canvas page now. An html field is stale client state,
    // and accepting it would suggest the row still stores markup.
    expect(isBrandTemplateCreateRequest(createRequest({ html: '<p>hi</p>' }))).toBe(true)
  })
})

describe('isBrandTemplateUpdateRequest', () => {
  /** Both fields are optional, so each one has to be able to travel ALONE. */
  const singleFieldWrites: Array<[string, Record<string, unknown>]> = [
    ['name', { name: 'Renamed' }],
    ['status', { status: 'approved', expectedDraftRevision: 'a'.repeat(64) }],
    ['customerSettings', { customerSettings: { 'blk-1': ['title'] } }],
    // `null` is the "clear the allow-list" instruction, not an omission, so it
    // has to travel alone too.
    ['customerSettings:null', { customerSettings: null }],
  ]

  it('accepts a write that carries only one field, for every field', () => {
    // Asserted as a LIST rather than one expect per field so a failure names the
    // field that stopped travelling alone instead of just the first one.
    const accepted = singleFieldWrites
      .filter(([, body]) => isBrandTemplateUpdateRequest(body))
      .map(([field]) => field)

    expect(accepted).toEqual(singleFieldWrites.map(([field]) => field))
  })

  it('accepts a write that carries every field at once', () => {
    expect(isBrandTemplateUpdateRequest({
      name: 'Renamed',
      status: 'draft',
      customerSettings: { 'blk-1': ['title'] },
    })).toBe(true)
  })

  it('binds approval to an exact reviewed draft revision', () => {
    expect(isBrandTemplateUpdateRequest({ status: 'approved' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({
      status: 'approved', expectedDraftRevision: 'not-a-revision',
    })).toBe(false)
    expect(isBrandTemplateUpdateRequest({
      status: 'draft', expectedDraftRevision: 'a'.repeat(64),
    })).toBe(false)
  })

  it('rejects a malformed allow-list rather than storing one that reads back as null', () => {
    // A stored value that fails `isBrandTemplateCuration` reads as `null` on the
    // way out — i.e. it silently UN-curates the template. Refusing it at the
    // boundary is what keeps the admin's intent and the row in agreement.
    expect(isBrandTemplateUpdateRequest({ customerSettings: { 'blk-1': 'title' } })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ customerSettings: { 'blk-1': [1] } })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ customerSettings: [] })).toBe(false)
  })

  it('rejects an empty write rather than treating it as a no-op', () => {
    // A PUT that names no field is a 400, not a silent success: the caller
    // believes it changed something.
    expect(isBrandTemplateUpdateRequest({})).toBe(false)
    expect(isBrandTemplateUpdateRequest({ name: undefined, status: undefined, customerSettings: undefined })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ unrelated: 'ignored' })).toBe(false)
  })

  it('rejects a write that only names fields the canvas tier does not own', () => {
    // Content and canvas size are not editable through this endpoint: markup is
    // gone, and width/height are fixed at creation.
    expect(isBrandTemplateUpdateRequest({ html: '<p>edited</p>' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ skillMd: '# Brief' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ width: 800, height: 600 })).toBe(false)
  })

  it('rejects non-records', () => {
    expect(isBrandTemplateUpdateRequest(null)).toBe(false)
    expect(isBrandTemplateUpdateRequest(undefined)).toBe(false)
    expect(isBrandTemplateUpdateRequest([{ name: 'Renamed' }])).toBe(false)
    expect(isBrandTemplateUpdateRequest('Renamed')).toBe(false)
  })

  it('applies each field the same bounds a create does, when the field is present', () => {
    expect(isBrandTemplateUpdateRequest({ name: '' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ name: '   ' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ name: 'x'.repeat(BRAND_TEMPLATE_NAME_MAX_LENGTH + 1) })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ status: 'archived' })).toBe(false)
    expect(isBrandTemplateUpdateRequest({ status: 1 })).toBe(false)
  })

  it('accepts each bound at its inclusive edge', () => {
    expect(isBrandTemplateUpdateRequest({ name: 'x'.repeat(BRAND_TEMPLATE_NAME_MAX_LENGTH) })).toBe(true)
    expect(isBrandTemplateUpdateRequest({ status: 'draft' })).toBe(true)
  })
})

/**
 * `narrowBrandTemplateRow` is the single parse of a `BrandTemplateRecord` off
 * the wire — every field it accepts drives an irreversible admin control, so
 * a malformed row must be rejected outright and a merely-unreadable snapshot
 * must be downgraded to `null` rather than taking the whole row with it.
 */
describe('narrowBrandTemplateRow', () => {
  function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'tpl-1',
      name: 'Launch card',
      pageId: 'page-1',
      snapshot: null,
      customerSettings: null,
      status: 'draft',
      version: 1,
      width: 1200,
      height: 630,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('accepts a well-formed row and rebuilds it as a clean literal', () => {
    const result = narrowBrandTemplateRow(row())
    expect(result).toEqual(row())
  })

  it('drops unknown wire keys rather than passing them through', () => {
    const result = narrowBrandTemplateRow(row({ html: '<p>stale</p>', secret: 'nope' }))
    expect(result).toEqual(row())
    expect(result).not.toHaveProperty('html')
    expect(result).not.toHaveProperty('secret')
  })

  it('rejects non-records, including arrays and null', () => {
    expect(narrowBrandTemplateRow(null)).toBeNull()
    expect(narrowBrandTemplateRow(undefined)).toBeNull()
    expect(narrowBrandTemplateRow('tpl-1')).toBeNull()
    expect(narrowBrandTemplateRow([row()])).toBeNull()
  })

  it('rejects a row missing or mistyping any required field', () => {
    expect(narrowBrandTemplateRow(row({ id: '' }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ id: undefined }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ name: undefined }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ pageId: '' }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ status: 'archived' }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ version: '1' }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ width: '1200' }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ height: undefined }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ createdAt: undefined }))).toBeNull()
    expect(narrowBrandTemplateRow(row({ updatedAt: 0 }))).toBeNull()
  })

  it('keeps a row whose snapshot fails the shared guard, reading it as null', () => {
    // An unparseable snapshot is "nothing this build can generate from", not a
    // reason to hide the row — the admin must still be able to rename,
    // re-approve or delete it.
    const result = narrowBrandTemplateRow(row({ status: 'approved', snapshot: { not: 'a snapshot' } }))
    expect(result).not.toBeNull()
    expect(result?.snapshot).toBeNull()
  })

  it('keeps a valid, parseable snapshot verbatim', () => {
    const snapshot = { canvas: { width: 1200, height: 630 }, sections: [], blocks: [] }
    const result = narrowBrandTemplateRow(row({ status: 'approved', snapshot }))
    expect(result?.snapshot).toEqual(snapshot)
  })

  it('carries a well-formed curation allow-list through', () => {
    const result = narrowBrandTemplateRow(row({ customerSettings: { 'blk-1': ['title', 'body'] } }))
    expect(result?.customerSettings).toEqual({ 'blk-1': ['title', 'body'] })
  })

  it('reads an unparseable allow-list as null — closed, never permissive', () => {
    // The failure direction matters: an allow-list this build cannot read must
    // mean "nothing is customer-editable", not "everything is".
    const result = narrowBrandTemplateRow(row({ customerSettings: { 'blk-1': 'title' } }))
    expect(result).not.toBeNull()
    expect(result?.customerSettings).toBeNull()
  })
})

/**
 * The curation allow-list's own guard. It parses an admin-authored map on the
 * way in AND a JSON column on the way out, and its failure direction is the
 * whole point: anything it rejects is read as "nothing is customer-editable".
 */
describe('isBrandTemplateCuration', () => {
  it('accepts an empty map and a populated one', () => {
    expect(isBrandTemplateCuration({})).toBe(true)
    expect(isBrandTemplateCuration({ 'blk-1': [], 'blk-2': ['title', 'body'] })).toBe(true)
  })

  it('rejects non-records, including arrays and null', () => {
    expect(isBrandTemplateCuration(null)).toBe(false)
    expect(isBrandTemplateCuration(undefined)).toBe(false)
    expect(isBrandTemplateCuration([])).toBe(false)
    expect(isBrandTemplateCuration('blk-1')).toBe(false)
  })

  it('rejects a value that is not an array of non-empty strings', () => {
    expect(isBrandTemplateCuration({ 'blk-1': 'title' })).toBe(false)
    expect(isBrandTemplateCuration({ 'blk-1': [1] })).toBe(false)
    expect(isBrandTemplateCuration({ 'blk-1': [''] })).toBe(false)
    expect(isBrandTemplateCuration({ 'blk-1': [null] })).toBe(false)
  })

  it('rejects an empty block id', () => {
    expect(isBrandTemplateCuration({ '': ['title'] })).toBe(false)
  })

  it('reuses the override map\'s block cap, at its inclusive edge', () => {
    const at = Object.fromEntries(
      Array.from({ length: BRAND_CANVAS_OVERRIDE_MAX_BLOCKS }, (_, i) => [`blk-${i}`, ['title']]),
    )
    expect(isBrandTemplateCuration(at)).toBe(true)
    expect(isBrandTemplateCuration({ ...at, 'blk-over': ['title'] })).toBe(false)
  })

  it('caps the setting ids per block, at its inclusive edge', () => {
    const at = Array.from({ length: BRAND_TEMPLATE_CURATION_MAX_SETTINGS }, (_, i) => `f-${i}`)
    expect(isBrandTemplateCuration({ 'blk-1': at })).toBe(true)
    expect(isBrandTemplateCuration({ 'blk-1': [...at, 'f-over'] })).toBe(false)
  })
})
