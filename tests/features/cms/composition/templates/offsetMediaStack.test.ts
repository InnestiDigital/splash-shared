import { describe, it, expect } from 'vitest'
import { offsetMediaStack } from '~/shared/features/cms/composition/templates/offsetMediaStack'
import { validateTemplate } from '~/shared/features/cms/composition/validation'
import { compositionSolver } from '~/shared/features/cms/composition/solver'
import { DEFAULT_KNOBS } from '~/shared/features/cms/composition/types'
import type { CompositionItem } from '~/shared/features/cms/composition/types'

describe('offsetMediaStack template', () => {
  it('has correct id', () => {
    expect(offsetMediaStack.id).toBe('offset-media-stack')
  })

  it('passes template validation', () => {
    expect(validateTemplate(offsetMediaStack)).toEqual([])
  })

  it('requires primary-media and secondary-media', () => {
    expect(offsetMediaStack.roles['primary-media']!.required).toBe(true)
    expect(offsetMediaStack.roles['secondary-media']!.required).toBe(true)
  })

  it('headline is optional', () => {
    expect(offsetMediaStack.roles['headline']!.required).toBe(false)
  })

  it('has 2 groups: media-cluster and text-stack', () => {
    expect(offsetMediaStack.groups).toHaveLength(2)
    expect(offsetMediaStack.groups.map(g => g.id).sort()).toEqual(['media-cluster', 'text-stack'])
  })

  it('media-cluster contains both media roles', () => {
    const mc = offsetMediaStack.groups.find(g => g.id === 'media-cluster')!
    expect(mc.roles).toContain('primary-media')
    expect(mc.roles).toContain('secondary-media')
  })

  it('defaultHeight is large', () => {
    expect(offsetMediaStack.defaultHeight).toBe('large')
  })

  it('defaultKnobs is balanced', () => {
    expect(offsetMediaStack.defaultKnobs.dominance).toBe('balanced')
  })

  it('defaultMediaAspect has portrait primary and square secondary', () => {
    expect(offsetMediaStack.defaultMediaAspect!['primary-media']).toBeCloseTo(0.75, 2)
    expect(offsetMediaStack.defaultMediaAspect!['secondary-media']).toBe(1)
  })

  it('solver produces output for required items', () => {
    const items: CompositionItem[] = [
      { id: 'p', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: 's', role: 'secondary-media', visible: true, emphasis: 'md', media: { src: '/b.jpg' } },
    ]
    const result = compositionSolver(offsetMediaStack, items, DEFAULT_KNOBS, 1200)
    expect(result['group:media-cluster']).toBeDefined()
    // text-stack should be skipped since no text items
    expect(result['group:text-stack']).toBeUndefined()
  })

  it('solver includes text-stack when headline present', () => {
    const items: CompositionItem[] = [
      { id: 'p', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: 's', role: 'secondary-media', visible: true, emphasis: 'md', media: { src: '/b.jpg' } },
      { id: 'h', role: 'headline', visible: true, emphasis: 'md', textContent: { 'en-US': 'Title' } },
    ]
    const result = compositionSolver(offsetMediaStack, items, DEFAULT_KNOBS, 1200)
    expect(result['group:media-cluster']).toBeDefined()
    expect(result['group:text-stack']).toBeDefined()
  })
})
