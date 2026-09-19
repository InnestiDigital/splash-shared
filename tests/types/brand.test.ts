import { describe, it, expect } from 'vitest'
import {
  BRAND_TEXT_FIELDS,
  BRAND_TEXTAREA_FIELDS,
  BRAND_LOGO_FIELDS,
  BRAND_PALETTE_FIELDS,
  BRAND_TYPOGRAPHY_FIELDS,
  BRAND_FIELD_GROUP_IDS,
  BRAND_PRESET_NAME_MAX_LENGTH,
  isBrandIdentityPutRequest,
  isBrandPresetCreateRequest,
  isBrandPresetRenameRequest,
  isBrandLogoFieldId,
  type BrandIdentityFieldId,
} from '~/shared/types/brand'

/**
 * The brand contract's field-id vocabulary and its route-ingress guards.
 * Every consumer (schema builder, validator, repository, admin form) derives
 * from these constants, so their exact contents are load-bearing.
 */

const nonRecords: Array<[string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a primitive', 'brand'],
  ['a number', 42],
  ['an array', [{ presetName: 'x' }]],
]

describe('brand field-id constants', () => {
  it('text fields are exactly brandName, tagline, toneWords', () => {
    expect(BRAND_TEXT_FIELDS).toEqual(['brandName', 'tagline', 'toneWords'])
  })

  it('textarea fields are exactly doRules, dontRules', () => {
    expect(BRAND_TEXTAREA_FIELDS).toEqual(['doRules', 'dontRules'])
  })

  it('logo fields are exactly logoPrimary, logoInverse, logoMark', () => {
    expect(BRAND_LOGO_FIELDS).toEqual(['logoPrimary', 'logoInverse', 'logoMark'])
  })

  it('palette fields are exactly the four brand palette role slots', () => {
    expect(BRAND_PALETTE_FIELDS).toEqual(['brandPrimary', 'brandSecondary', 'brandSurface', 'brandOnSurface'])
  })

  it('typography fields are exactly headlineRole, bodyRole', () => {
    expect(BRAND_TYPOGRAPHY_FIELDS).toEqual(['headlineRole', 'bodyRole'])
  })

  it('field groups are exactly identity, logos, palette, typography, voice', () => {
    expect(BRAND_FIELD_GROUP_IDS).toEqual(['identity', 'logos', 'palette', 'typography', 'voice'])
  })

  it('preset names are capped at 120 characters', () => {
    expect(BRAND_PRESET_NAME_MAX_LENGTH).toBe(120)
  })
})

describe('isBrandIdentityPutRequest', () => {
  it('accepts an object with an object identity (the empty PATCH included)', () => {
    expect(isBrandIdentityPutRequest({ identity: {} })).toBe(true)
    expect(isBrandIdentityPutRequest({ identity: { brandName: 'Acme' } })).toBe(true)
  })

  it.each(nonRecords)('rejects %s as a body', (_label, body) => {
    expect(isBrandIdentityPutRequest(body)).toBe(false)
  })

  it('rejects a body without an identity key', () => {
    expect(isBrandIdentityPutRequest({})).toBe(false)
  })

  it('rejects a null identity', () => {
    expect(isBrandIdentityPutRequest({ identity: null })).toBe(false)
  })

  it('rejects an array identity', () => {
    expect(isBrandIdentityPutRequest({ identity: [] })).toBe(false)
  })

  it('rejects a string identity', () => {
    expect(isBrandIdentityPutRequest({ identity: 'brandName' })).toBe(false)
  })
})

describe('isBrandPresetCreateRequest', () => {
  it('accepts a name alone — cloneFrom is optional', () => {
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign' })).toBe(true)
  })

  it('accepts a name plus a non-empty cloneFrom preset id', () => {
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign', cloneFrom: 'preset-1' })).toBe(true)
  })

  it('accepts an explicitly-undefined cloneFrom (JSON absence)', () => {
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign', cloneFrom: undefined })).toBe(true)
  })

  it('accepts an empty presetName — trimming and the length rule are the endpoint 400, not the guard', () => {
    expect(isBrandPresetCreateRequest({ presetName: '' })).toBe(true)
  })

  it.each(nonRecords)('rejects %s as a body', (_label, body) => {
    expect(isBrandPresetCreateRequest(body)).toBe(false)
  })

  it('rejects a missing presetName', () => {
    expect(isBrandPresetCreateRequest({})).toBe(false)
  })

  it('rejects a non-string presetName', () => {
    expect(isBrandPresetCreateRequest({ presetName: 42 })).toBe(false)
  })

  it('rejects an empty-string cloneFrom — "clone from nothing" is a shape error, not a default', () => {
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign', cloneFrom: '' })).toBe(false)
  })

  it('rejects a non-string cloneFrom', () => {
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign', cloneFrom: 7 })).toBe(false)
    expect(isBrandPresetCreateRequest({ presetName: 'Spring campaign', cloneFrom: null })).toBe(false)
  })
})

describe('isBrandPresetRenameRequest', () => {
  it('accepts an object with a string presetName', () => {
    expect(isBrandPresetRenameRequest({ presetName: 'Renamed' })).toBe(true)
    expect(isBrandPresetRenameRequest({ presetName: '' })).toBe(true)
  })

  it.each(nonRecords)('rejects %s as a body', (_label, body) => {
    expect(isBrandPresetRenameRequest(body)).toBe(false)
  })

  it('rejects a missing or non-string presetName', () => {
    expect(isBrandPresetRenameRequest({})).toBe(false)
    expect(isBrandPresetRenameRequest({ presetName: 42 })).toBe(false)
    expect(isBrandPresetRenameRequest({ presetName: null })).toBe(false)
  })
})

describe('isBrandLogoFieldId', () => {
  it.each(BRAND_LOGO_FIELDS)('%s is a logo field', (id) => {
    expect(isBrandLogoFieldId(id)).toBe(true)
  })

  const nonLogoIds: BrandIdentityFieldId[] = [
    'brandName', 'tagline', 'toneWords', 'doRules', 'dontRules',
    'brandPrimary', 'brandSecondary', 'brandSurface', 'brandOnSurface',
    'headlineRole', 'bodyRole',
  ]

  it.each(nonLogoIds)('%s is not a logo field', (id) => {
    expect(isBrandLogoFieldId(id)).toBe(false)
  })
})
