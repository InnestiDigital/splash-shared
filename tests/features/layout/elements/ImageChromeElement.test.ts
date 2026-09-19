/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageChromeElement from '~/shared/features/layout/elements/ImageChromeElement.vue'

describe('ImageChromeElement', () => {
  const base = {
    id: 'i1',
    type: 'image' as const,
    src: '/x.jpg',
    enabled: true,
    position: 'absolute' as const,
    anchor: 'top-left' as const,
    width: '100px',
    offsetX: '0',
    offsetY: '0',
    zIndex: 1,
  }

  it('renders an img with the given src', () => {
    const w = mount(ImageChromeElement, { props: { element: base } })
    const img = w.find('img').element as HTMLImageElement
    expect(img.src).toContain('/x.jpg')
  })

  it('applies width and optional height', () => {
    const w = mount(ImageChromeElement, { props: { element: { ...base, height: '60px' } } })
    const img = w.find('img').element as HTMLImageElement
    expect(img.style.width).toBe('100px')
    expect(img.style.height).toBe('60px')
  })

  it('uses alt when provided', () => {
    const w = mount(ImageChromeElement, { props: { element: { ...base, alt: 'Logo' } } })
    expect(w.find('img').attributes('alt')).toBe('Logo')
  })
})
