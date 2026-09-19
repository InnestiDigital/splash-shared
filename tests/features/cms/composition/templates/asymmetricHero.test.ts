import { describe, it, expect } from 'vitest'
import { asymmetricHero } from '~/shared/features/cms/composition/templates/asymmetricHero'
import { validateTemplate } from '~/shared/features/cms/composition/validation'
import { compositionSolver } from '~/shared/features/cms/composition/solver'
import { DEFAULT_KNOBS } from '~/shared/features/cms/composition/types'
import type { CompositionItem } from '~/shared/features/cms/composition/types'

describe('asymmetricHero template', () => {
  it('has correct id', () => {
    expect(asymmetricHero.id).toBe('asymmetric-hero')
  })

  it('passes template validation', () => {
    const errors = validateTemplate(asymmetricHero)
    expect(errors).toEqual([])
  })

  it('requires primary-media and headline', () => {
    expect(asymmetricHero.roles['primary-media']!.required).toBe(true)
    expect(asymmetricHero.roles['headline']!.required).toBe(true)
  })

  it('allows up to 2 ornaments', () => {
    expect(asymmetricHero.roles['ornament']!.max).toBe(2)
  })

  it('defaultHeight is viewport', () => {
    expect(asymmetricHero.defaultHeight).toBe('viewport')
  })

  it('has 2 groups: media and text-stack', () => {
    expect(asymmetricHero.groups).toHaveLength(2)
    expect(asymmetricHero.groups.map(g => g.id).sort()).toEqual(['media', 'text-stack'])
  })

  it('media group allows overflow', () => {
    const mediaGroup = asymmetricHero.groups.find(g => g.id === 'media')!
    expect(mediaGroup.overflowPolicy).toBe('allow')
  })

  it('has floaters for caption and ornament', () => {
    expect(asymmetricHero.floaters['caption']).toBeDefined()
    expect(asymmetricHero.floaters['ornament']).toBeDefined()
  })

  it('ornaments are hidden on mobile stack', () => {
    expect(asymmetricHero.responsive.hideOnStack).toContain('ornament')
  })

  it('defaultKnobs favors media dominance', () => {
    expect(asymmetricHero.defaultKnobs.dominance).toBe('media')
  })

  it('has defaultTypographySlots for text roles', () => {
    expect(asymmetricHero.defaultTypographySlots).toBeDefined()
    expect(asymmetricHero.defaultTypographySlots!.headline).toBe('display')
  })

  it('has defaultMediaAspect for primary-media', () => {
    expect(asymmetricHero.defaultMediaAspect).toBeDefined()
    expect(asymmetricHero.defaultMediaAspect!['primary-media']).toBeCloseTo(4/3, 2)
  })

  it('solver produces valid output with required items', () => {
    const items: CompositionItem[] = [
      { id: 'img', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/hero.jpg' } },
      { id: 'hdl', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
    ]
    const result = compositionSolver(asymmetricHero, items, DEFAULT_KNOBS, 1440)
    expect(result['group:media']).toBeDefined()
    expect(result['group:text-stack']).toBeDefined()
  })

  it('solver produces floater output when caption is present', () => {
    const items: CompositionItem[] = [
      { id: 'img', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/hero.jpg' } },
      { id: 'hdl', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
      { id: 'cap', role: 'caption', visible: true, emphasis: 'sm', textContent: { 'en-US': 'Caption' } },
    ]
    const result = compositionSolver(asymmetricHero, items, DEFAULT_KNOBS, 1440)
    expect(result['cap']).toBeDefined()
    expect(result['cap']!.height).toBe('auto')
  })
})
