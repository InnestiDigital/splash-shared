import { describe, it, expect } from 'vitest'
import { deepGet, deepSet } from '~/shared/utils/deepPath'

describe('deepGet', () => {
  it('reads the value deepSet wrote, for object, array and mixed paths', () => {
    const obj: Record<string, any> = { tiles: [{ settings: {} }, { settings: {} }] }
    deepSet(obj, 'tiles[1].settings.url', '/contact')
    expect(deepGet(obj, 'tiles[1].settings.url')).toBe('/contact')

    deepSet(obj, 'title', 'Hello')
    expect(deepGet(obj, 'title')).toBe('Hello')
  })

  it('returns undefined for a path that does not exist rather than throwing', () => {
    expect(deepGet({ a: { b: 1 } }, 'a.c.d')).toBeUndefined()
    expect(deepGet({ items: [] }, 'items[3].name')).toBeUndefined()
  })

  it('reads a null the same way it reads any other written value', () => {
    const obj: Record<string, any> = {}
    deepSet(obj, 'settings.caption', null)
    expect(deepGet(obj, 'settings.caption')).toBeNull()
  })

  it('refuses prototype-polluting segments on the read path too', () => {
    expect(() => deepGet({}, '__proto__.polluted')).toThrow('Forbidden path segment')
  })
})
