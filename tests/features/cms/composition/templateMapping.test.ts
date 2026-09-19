import { describe, it, expect } from 'vitest'
import { mapItemsToTemplate } from '~/shared/features/cms/composition/templateMapping'
import { asymmetricHero } from '~/shared/features/cms/composition/templates/asymmetricHero'
import { offsetMediaStack } from '~/shared/features/cms/composition/templates/offsetMediaStack'
import { captionedEditorialSpread } from '~/shared/features/cms/composition/templates/captionedEditorialSpread'
import type { CompositionItem } from '~/shared/features/cms/composition/types'

describe('mapItemsToTemplate', () => {
  it('preserves shared roles (hero → offset): headline kept', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
    ]
    const { items: mapped } = mapItemsToTemplate(items, asymmetricHero, offsetMediaStack)
    expect(mapped.find(i => i.id === '1')?.media?.src).toBe('/a.jpg')
    expect(mapped.find(i => i.id === '2')?.textContent?.['en-US']).toBe('Title')
  })

  it('warns on lost roles (hero → offset): ornament lost', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
      { id: '3', role: 'ornament', visible: true, emphasis: 'sm', media: { src: '/orn.png' } },
    ]
    const { warnings } = mapItemsToTemplate(items, asymmetricHero, offsetMediaStack)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('ornament')
  })

  it('creates missing required roles (hero → offset): secondary-media created', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
    ]
    const { items: mapped } = mapItemsToTemplate(items, asymmetricHero, offsetMediaStack)
    const newSecondary = mapped.find(i => i.role === 'secondary-media')
    expect(newSecondary).toBeDefined()
    expect(newSecondary!.emphasis).toBe('md') // offsetMediaStack defaultEmphasis
    expect(newSecondary!.visible).toBe(true)
  })

  it('preserves focalPoint data across mapping', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg', focalPoint: { x: 0.3, y: 0.7 } } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
    ]
    const { items: mapped } = mapItemsToTemplate(items, asymmetricHero, captionedEditorialSpread)
    expect(mapped.find(i => i.id === '1')?.media?.focalPoint).toEqual({ x: 0.3, y: 0.7 })
  })

  it('offset → spread: headline preserved, secondary-media lost, body preserved', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'secondary-media', visible: true, emphasis: 'md', media: { src: '/b.jpg' } },
      { id: '3', role: 'headline', visible: true, emphasis: 'md', textContent: { 'en-US': 'Title' } },
      { id: '4', role: 'body', visible: true, emphasis: 'md', textContent: { 'en-US': 'Body' } },
    ]
    const { items: mapped, warnings } = mapItemsToTemplate(items, offsetMediaStack, captionedEditorialSpread)
    expect(mapped.find(i => i.id === '3')).toBeDefined() // headline
    expect(mapped.find(i => i.id === '4')).toBeDefined() // body
    expect(warnings.some(w => w.includes('secondary-media'))).toBe(true)
  })

  it('spread → hero: headline + primary-media preserved, body lost', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
      { id: '2', role: 'body', visible: true, emphasis: 'md', textContent: { 'en-US': 'Body text' } },
      { id: '3', role: 'primary-media', visible: true, emphasis: 'md', media: { src: '/a.jpg' } },
    ]
    const { items: mapped, warnings } = mapItemsToTemplate(items, captionedEditorialSpread, asymmetricHero)
    expect(mapped.find(i => i.id === '1')).toBeDefined() // headline
    expect(mapped.find(i => i.id === '3')).toBeDefined() // primary-media
    expect(warnings.some(w => w.includes('body'))).toBe(true)
  })

  it('no duplicate IDs after mapping', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
    ]
    const { items: mapped } = mapItemsToTemplate(items, asymmetricHero, offsetMediaStack)
    const ids = mapped.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not warn for empty optional roles that are lost', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Title' } },
      { id: '3', role: 'ornament', visible: true, emphasis: 'sm' }, // no media src
    ]
    const { warnings } = mapItemsToTemplate(items, asymmetricHero, offsetMediaStack)
    expect(warnings.length).toBe(0) // ornament had no content, no warning
  })
})
