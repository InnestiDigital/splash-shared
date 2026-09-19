import { describe, it, expect } from 'vitest'
import { BRAND_RENDER_TOKENS_FALLBACK } from '~/shared/types/brandFormat'

describe('BRAND_RENDER_TOKENS_FALLBACK', () => {
  it('is a complete token set', () => {
    expect(Object.keys(BRAND_RENDER_TOKENS_FALLBACK).sort()).toEqual([
      'body', 'headline', 'onSurface', 'primary', 'secondary', 'surface',
    ])
  })

  it('falls back to the same face for both typography roles', () => {
    expect(BRAND_RENDER_TOKENS_FALLBACK.headline).toEqual(BRAND_RENDER_TOKENS_FALLBACK.body)
  })
})
