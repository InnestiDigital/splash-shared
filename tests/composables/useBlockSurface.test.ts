import { describe, expect, it } from 'vitest'
import { useBlockSurface } from '~/shared/composables/useBlockSurface'

describe('useBlockSurface', () => {
  it('paints each background role through the enclosing section layer', () => {
    const cases = {
      section: 'var(--section-bg)',
      surface: 'var(--section-surface)',
      accent: 'var(--section-accent)',
      inverse: 'var(--section-inverse-bg)',
    } as const

    for (const [role, cssVar] of Object.entries(cases)) {
      const { surfaceStyle } = useBlockSurface({ background: role as keyof typeof cases })
      expect(surfaceStyle.value.backgroundColor, role).toBe(cssVar)
    }
  })

  it('emits NO backgroundColor for the transparent role so the parent shows through', () => {
    const { surfaceStyle } = useBlockSurface({ background: 'transparent' })
    expect(surfaceStyle.value).not.toHaveProperty('backgroundColor')
  })

  it('writes each text role as its section text var', () => {
    const cases = {
      section: 'var(--section-text)',
      muted: 'var(--section-text-muted)',
      faint: 'var(--section-text-faint)',
      accent: 'var(--section-accent)',
      inverse: 'var(--section-inverse-text)',
    } as const

    for (const [role, cssVar] of Object.entries(cases)) {
      const { surfaceStyle } = useBlockSurface({ textTone: role as keyof typeof cases })
      expect(surfaceStyle.value.color, role).toBe(cssVar)
    }
  })

  it('emits NO color for a block whose schema omits textTone', () => {
    const { surfaceStyle } = useBlockSurface({ background: 'section' })
    expect(surfaceStyle.value).not.toHaveProperty('color')
  })

  it('passes a migrated custom escape through as the authored value', () => {
    const { surfaceStyle } = useBlockSurface({
      background: { custom: '#1C1C1C' },
      textTone: { custom: '#FFFFFF' },
    })
    expect(surfaceStyle.value).toEqual({ backgroundColor: '#1C1C1C', color: '#FFFFFF' })
  })

  it('falls back to the block default when no background was ever authored', () => {
    expect(useBlockSurface({}, { fallbackBackground: 'section' }).surfaceStyle.value)
      .toEqual({ backgroundColor: 'var(--section-bg)' })
    expect(useBlockSurface({}, { fallbackBackground: 'transparent' }).surfaceStyle.value)
      .toEqual({})
  })

  it('falls back to section when the caller names no default either', () => {
    expect(useBlockSurface({}).surfaceStyle.value).toEqual({ backgroundColor: 'var(--section-bg)' })
  })

  it('prefers an authored role over the fallback', () => {
    const { surfaceStyle } = useBlockSurface(
      { background: 'inverse' },
      { fallbackBackground: 'transparent' },
    )
    expect(surfaceStyle.value.backgroundColor).toBe('var(--section-inverse-bg)')
  })

  it('holds no shared state, so one component can paint two surfaces', () => {
    const props = { background: 'inverse' as const }
    const root = useBlockSurface(props, { fallbackBackground: 'section' })
    const media = useBlockSurface({}, { fallbackBackground: 'transparent' })

    expect(root.surfaceStyle.value).toEqual({ backgroundColor: 'var(--section-inverse-bg)' })
    expect(media.surfaceStyle.value).toEqual({})
  })
})
