import { describe, it, expect } from 'vitest'
import {
  RICHTEXT_MODES,
  isRichtextMode,
  modeFromFieldType,
} from '~/shared/tiptap/richtextModes'

describe('RICHTEXT_MODES', () => {
  it('contains exactly single | inline | block in that order', () => {
    expect(RICHTEXT_MODES).toEqual(['single', 'inline', 'block'])
  })
})

describe('isRichtextMode', () => {
  it.each([['single'], ['inline'], ['block']])('accepts %s', (m) => {
    expect(isRichtextMode(m)).toBe(true)
  })
  it.each([['rich'], ['richtext'], [''], ['BLOCK'], [null], [undefined]])(
    'rejects %s', (m) => { expect(isRichtextMode(m as any)).toBe(false) }
  )
})

describe('modeFromFieldType', () => {
  it.each([
    ['richtext-single', 'single'],
    ['richtext-inline', 'inline'],
    ['richtext-block', 'block'],
    ['richtext', 'block'],          // back-compat alias
  ])('maps %s → %s', (type, mode) => {
    expect(modeFromFieldType(type)).toBe(mode)
  })
  it('returns null for non-richtext field types', () => {
    expect(modeFromFieldType('text')).toBeNull()
    expect(modeFromFieldType('image')).toBeNull()
    expect(modeFromFieldType('')).toBeNull()
  })
})
