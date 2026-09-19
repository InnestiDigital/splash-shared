import { describe, it, expect, vi } from 'vitest'
import { normalizePositionedItems } from '../../../../shared/features/layout-interaction/normalize-positioned-items'

describe('normalizePositionedItems', () => {
  it('preserves existing ids', () => {
    const out = normalizePositionedItems([{ id: 'keep' } as any])
    expect(out[0].id).toBe('keep')
  })

  it('is idempotent', () => {
    const first = normalizePositionedItems([{} as any])
    const second = normalizePositionedItems(first)
    expect(second[0].id).toBe(first[0].id)
  })

  it('warns when a fallback id is injected (fallback path, not normal)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    normalizePositionedItems([{} as any])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[layout-interaction]'))
    warn.mockRestore()
  })

  it('fills defaults for missing numeric fields', () => {
    const out = normalizePositionedItems([{ id: 'a' } as any])
    expect(out[0]).toMatchObject({ positionX: 50, positionY: 50, width: 30, height: 30, rotation: 0, zIndex: 1 })
  })

  it('does not mutate input', () => {
    const frozen = Object.freeze([Object.freeze({ id: 'a' })]) as any
    expect(() => normalizePositionedItems(frozen)).not.toThrow()
  })
})
