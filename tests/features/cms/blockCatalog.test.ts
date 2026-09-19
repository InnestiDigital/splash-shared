import { describe, expect, it } from 'vitest'
import {
  explicitlySupportsBlockSurface,
  isBlockSchemaInsertable,
  isBlockSchemaPreferredOnSurface,
} from '~/shared/features/cms/blockCatalog'

describe('blockCatalog', () => {
  it('keeps every active schema insertable on both authoring surfaces', () => {
    expect(isBlockSchemaInsertable({})).toBe(true)
    expect(isBlockSchemaInsertable({ surfaces: ['canvas'] })).toBe(true)
  })

  it('uses explicit surfaces for ranking rather than availability', () => {
    const schema = { surfaces: ['canvas'] as const }
    expect(isBlockSchemaPreferredOnSurface(schema, 'canvas')).toBe(true)
    expect(isBlockSchemaPreferredOnSurface(schema, 'site')).toBe(false)
    expect(isBlockSchemaPreferredOnSurface({}, 'site')).toBe(true)
    expect(isBlockSchemaPreferredOnSurface({}, 'canvas')).toBe(false)
    expect(explicitlySupportsBlockSurface(schema, 'canvas')).toBe(true)
    expect(explicitlySupportsBlockSurface({}, 'canvas')).toBe(false)
  })

  it('never offers deprecated schemas for new insertion', () => {
    expect(isBlockSchemaInsertable({ status: 'deprecated' })).toBe(false)
    expect(isBlockSchemaInsertable({ status: 'deprecated', surfaces: ['canvas'] })).toBe(false)
  })
})
