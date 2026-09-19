import { describe, it, expect } from 'vitest'
import { captionedEditorialSpread } from '~/shared/features/cms/composition/templates/captionedEditorialSpread'
import { validateTemplate } from '~/shared/features/cms/composition/validation'
import { compositionSolver } from '~/shared/features/cms/composition/solver'
import { DEFAULT_KNOBS } from '~/shared/features/cms/composition/types'
import type { CompositionItem } from '~/shared/features/cms/composition/types'

describe('captionedEditorialSpread template', () => {
  it('has correct id', () => {
    expect(captionedEditorialSpread.id).toBe('captioned-editorial-spread')
  })

  it('passes template validation', () => {
    expect(validateTemplate(captionedEditorialSpread)).toEqual([])
  })

  it('requires headline, body, and primary-media', () => {
    expect(captionedEditorialSpread.roles['headline']!.required).toBe(true)
    expect(captionedEditorialSpread.roles['body']!.required).toBe(true)
    expect(captionedEditorialSpread.roles['primary-media']!.required).toBe(true)
  })

  it('headline is text with lg default emphasis', () => {
    expect(captionedEditorialSpread.roles['headline']!.contentType).toBe('text')
    expect(captionedEditorialSpread.roles['headline']!.defaultEmphasis).toBe('lg')
  })

  it('text-column is wider than media-accent', () => {
    const textW = captionedEditorialSpread.groups.find(g => g.id === 'text-column')!.baseSize.w
    const mediaW = captionedEditorialSpread.groups.find(g => g.id === 'media-accent')!.baseSize.w
    expect(textW).toBeGreaterThan(mediaW)
  })

  it('defaultKnobs favors text dominance', () => {
    expect(captionedEditorialSpread.defaultKnobs.dominance).toBe('text')
  })

  it('media-accent allows overflow', () => {
    const ma = captionedEditorialSpread.groups.find(g => g.id === 'media-accent')!
    expect(ma.overflowPolicy).toBe('allow')
  })

  it('caption floater anchors to media-accent', () => {
    expect(captionedEditorialSpread.floaters['caption']!.anchor).toBe('media-accent')
  })

  it('defaultHeight is large', () => {
    expect(captionedEditorialSpread.defaultHeight).toBe('large')
  })

  it('solver produces output for all required items', () => {
    const items: CompositionItem[] = [
      { id: 'h', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
      { id: 'b', role: 'body', visible: true, emphasis: 'md', textContent: { 'en-US': '<p>Text</p>' } },
      { id: 'img', role: 'primary-media', visible: true, emphasis: 'md', media: { src: '/photo.jpg' } },
    ]
    const result = compositionSolver(captionedEditorialSpread, items, DEFAULT_KNOBS, 1200)
    expect(result['group:text-column']).toBeDefined()
    expect(result['group:media-accent']).toBeDefined()
  })
})
