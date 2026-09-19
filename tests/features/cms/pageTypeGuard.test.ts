/**
 * `isPageType` / `toPageType` — the narrowing that replaced an
 * `as PageContext['pageType']` assertion in the preview route.
 *
 * `pageType` reaches the preview as untyped JSON from the preview config, so a
 * cast would let a typo'd or future-version value flow straight into
 * `resolveBlogId` and the template resolver. These pin the guard AND the
 * fallback: `'static'` is what the snapshot deserializer applies for configs
 * written before `pageType` existed, so the two must agree.
 */
import { describe, it, expect } from 'vitest'
import { PAGE_TYPES, isPageType, toPageType, resolveBlogId } from '~/shared/features/cms/page-context'

describe('isPageType', () => {
  it.each([...PAGE_TYPES])('accepts the %s variant', (variant) => {
    expect(isPageType(variant)).toBe(true)
  })

  it.each([
    ['unknown string', 'newsletter'],
    ['empty string', ''],
    ['near miss', 'blogindex'],
    ['wrong case', 'Article'],
  ])('rejects %s', (_label, value) => {
    expect(isPageType(value)).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
    ['object', { pageType: 'article' }],
    ['array', ['article']],
  ])('rejects a non-string %s', (_label, value) => {
    expect(isPageType(value)).toBe(false)
  })
})

describe('toPageType', () => {
  it('passes a known variant through untouched', () => {
    expect(toPageType('article')).toBe('article')
    expect(toPageType('blog-index')).toBe('blog-index')
    expect(toPageType('brand-canvas')).toBe('brand-canvas')
  })

  it('falls back to static for anything unrecognised', () => {
    expect(toPageType('newsletter')).toBe('static')
    expect(toPageType(undefined)).toBe('static')
    expect(toPageType(null)).toBe('static')
    expect(toPageType(42)).toBe('static')
  })

  it('produces a value resolveBlogId handles without a cast', () => {
    // The point of the narrowing: whatever comes out is safe downstream.
    expect(resolveBlogId(toPageType('article'), 'p1', 'blog-1')).toBe('blog-1')
    expect(resolveBlogId(toPageType('blog-index'), 'p1', null)).toBe('p1')
    expect(resolveBlogId(toPageType('garbage'), 'p1', 'blog-1')).toBe(null)
  })
})

describe('PAGE_TYPES', () => {
  it('lists every variant exactly once', () => {
    expect(new Set(PAGE_TYPES).size).toBe(PAGE_TYPES.length)
    expect([...PAGE_TYPES].sort()).toEqual(['article', 'blog-index', 'brand-canvas', 'static'])
  })
})
