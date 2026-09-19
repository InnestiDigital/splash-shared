import { describe, it, expect } from 'vitest'
import {
  SPACING_TOKENS,
  MAX_WIDTH_TOKENS,
  SHADOW_TOKENS,
  BORDER_RADIUS_TOKENS,
  ALIGN_SELF_OPTIONS,
  WIDTH_MODE_OPTIONS,
  WRAPPER_STYLE_OPTIONS,
  SEMANTIC_COLOR_OPTIONS,
} from '~/shared/types/placement'

describe('placement token arrays', () => {
  it('SPACING_TOKENS has all 6 values', () => {
    expect(SPACING_TOKENS).toHaveLength(6)
    expect(SPACING_TOKENS).toContain('none')
    expect(SPACING_TOKENS).toContain('xl')
  })

  it('MAX_WIDTH_TOKENS has all 4 values', () => {
    expect(MAX_WIDTH_TOKENS).toHaveLength(4)
    expect(MAX_WIDTH_TOKENS).toContain('sm')
    expect(MAX_WIDTH_TOKENS).toContain('xl')
  })

  it('SHADOW_TOKENS has all 4 values', () => {
    expect(SHADOW_TOKENS).toHaveLength(4)
    expect(SHADOW_TOKENS).toContain('none')
    expect(SHADOW_TOKENS).toContain('lg')
  })

  it('BORDER_RADIUS_TOKENS has all 5 string tokens', () => {
    expect(BORDER_RADIUS_TOKENS).toHaveLength(5)
    expect(BORDER_RADIUS_TOKENS).toContain('none')
    expect(BORDER_RADIUS_TOKENS).toContain('pill')
  })

  it('SEMANTIC_COLOR_OPTIONS has all 4 string tokens', () => {
    expect(SEMANTIC_COLOR_OPTIONS).toHaveLength(4)
    expect(SEMANTIC_COLOR_OPTIONS).toContain('section')
    expect(SEMANTIC_COLOR_OPTIONS).toContain('accent')
  })

  it('ALIGN_SELF_OPTIONS has all 4 values', () => {
    expect(ALIGN_SELF_OPTIONS).toHaveLength(4)
  })

  it('WIDTH_MODE_OPTIONS has all 3 values', () => {
    expect(WIDTH_MODE_OPTIONS).toHaveLength(3)
  })

  it('WRAPPER_STYLE_OPTIONS has all 4 values', () => {
    expect(WRAPPER_STYLE_OPTIONS).toHaveLength(4)
  })
})
