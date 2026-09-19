import { describe, it, expect } from 'vitest'
import { isTipTapDocument } from '~/shared/tiptap/types'

describe('isTipTapDocument', () => {
  it('returns true for valid TipTap document', () => {
    expect(isTipTapDocument({ type: 'doc', content: [] })).toBe(true)
  })

  it('returns true for doc with content', () => {
    expect(isTipTapDocument({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    })).toBe(true)
  })

  it('returns false for HTML string', () => {
    expect(isTipTapDocument('<p>hello</p>')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isTipTapDocument(null)).toBe(false)
  })

  it('returns false for locale map of strings', () => {
    expect(isTipTapDocument({ 'en-US': '<p>hi</p>' })).toBe(false)
  })

  it('returns false for object without type:doc', () => {
    expect(isTipTapDocument({ type: 'paragraph', content: [] })).toBe(false)
  })
})
