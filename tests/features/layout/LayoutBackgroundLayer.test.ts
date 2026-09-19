/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayoutBackgroundLayer from '~/shared/features/layout/LayoutBackgroundLayer.vue'

describe('LayoutBackgroundLayer', () => {
  it('renders nothing visible when background is empty', () => {
    const w = mount(LayoutBackgroundLayer, { props: { background: {} } })
    expect(w.find('[data-layout-background]').exists()).toBe(false)
  })

  it('renders color when set', () => {
    const w = mount(LayoutBackgroundLayer, { props: { background: { color: '#ff0000' } } })
    const el = w.find('[data-layout-background]').element as HTMLElement
    // happy-dom keeps hex; jsdom would normalize to rgb()
    expect(el.style.backgroundColor.toLowerCase()).toMatch(/^(#ff0000|rgb\(255, 0, 0\))$/)
  })

  it('renders image with repeat and size', () => {
    const w = mount(LayoutBackgroundLayer, {
      props: {
        background: {
          image: { src: '/bg.jpg', repeat: 'repeat-y', size: 'contain', position: 'left top', attachment: 'fixed' },
        },
      },
    })
    const el = w.find('[data-layout-background]').element as HTMLElement
    expect(el.style.backgroundImage).toBe('url("/bg.jpg")')
    expect(el.style.backgroundRepeat).toBe('repeat-y')
    expect(el.style.backgroundSize).toBe('contain')
    expect(el.style.backgroundAttachment).toBe('fixed')
  })

  it('renders an overlay layer when set', () => {
    const w = mount(LayoutBackgroundLayer, {
      props: {
        background: { color: '#fff', overlay: { color: '#000', opacity: 0.5 } },
      },
    })
    expect(w.find('[data-layout-background-overlay]').exists()).toBe(true)
  })
})
