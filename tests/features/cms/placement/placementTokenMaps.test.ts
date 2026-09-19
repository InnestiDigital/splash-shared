// tests/shared/features/cms/placement/placementTokenMaps.test.ts
import { describe, it, expect } from 'vitest'
import {
  SPACING_TOKEN_MAP,
  MAX_WIDTH_TOKEN_MAP,
  SHADOW_TOKEN_MAP,
  BORDER_RADIUS_TOKEN_MAP,
  resolveSpacing,
  resolveMaxWidth,
  resolveBorderRadius,
  resolveShadow,
  resolveSemanticColor,
} from '~/shared/features/cms/placement/placementTokenMaps'

describe('placementTokenMaps', () => {
  describe('SPACING_TOKEN_MAP', () => {
    it('maps all token values', () => {
      expect(SPACING_TOKEN_MAP.none).toBe('0')
      expect(SPACING_TOKEN_MAP.xs).toBe('0.25rem')
      expect(SPACING_TOKEN_MAP.sm).toBe('0.5rem')
      expect(SPACING_TOKEN_MAP.md).toBe('1rem')
      expect(SPACING_TOKEN_MAP.lg).toBe('2rem')
      expect(SPACING_TOKEN_MAP.xl).toBe('4rem')
    })
  })

  describe('resolveSpacing', () => {
    it('resolves token value', () => {
      expect(resolveSpacing({ mode: 'token', value: 'md' })).toBe('1rem')
    })

    it('resolves custom px value', () => {
      expect(resolveSpacing({ mode: 'custom', value: 24, unit: 'px' })).toBe('24px')
    })

    it('resolves custom rem value', () => {
      expect(resolveSpacing({ mode: 'custom', value: 2.5, unit: 'rem' })).toBe('2.5rem')
    })
  })

  describe('resolveMaxWidth', () => {
    it('resolves token value', () => {
      expect(resolveMaxWidth({ mode: 'token', value: 'sm' })).toBe('480px')
    })

    it('resolves custom value', () => {
      expect(resolveMaxWidth({ mode: 'custom', value: 600, unit: 'px' })).toBe('600px')
    })
  })

  describe('resolveShadow', () => {
    it('resolves none', () => {
      expect(resolveShadow('none')).toBe('none')
    })

    it('resolves sm', () => {
      expect(resolveShadow('sm')).toContain('0')
    })
  })

  describe('resolveSemanticColor', () => {
    it('resolves section token', () => {
      expect(resolveSemanticColor('section')).toBe('var(--section-bg)')
    })

    it('resolves transparent', () => {
      expect(resolveSemanticColor('transparent')).toBe('transparent')
    })

    it('resolves surface token', () => {
      expect(resolveSemanticColor('surface')).toBe('var(--section-surface)')
    })

    it('resolves accent token', () => {
      expect(resolveSemanticColor('accent')).toBe('var(--section-accent)')
    })

    it('resolves custom hex', () => {
      expect(resolveSemanticColor({ custom: '#ff0000' })).toBe('#ff0000')
    })
  })
})
