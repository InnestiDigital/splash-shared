/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShapeChromeElement from '~/shared/features/layout/elements/ShapeChromeElement.vue'

describe('ShapeChromeElement', () => {
  it('renders a rectangle with given dimensions', () => {
    const w = mount(ShapeChromeElement, {
      props: {
        element: {
          id: 's1',
          type: 'shape',
          shape: 'rectangle',
          enabled: true,
          position: 'absolute',
          anchor: 'top-left',
          color: '#ff0000',
          width: '50px',
          height: '50px',
          offsetX: '0',
          offsetY: '0',
          zIndex: 1,
        },
      },
    })
    const el = w.find('[data-chrome-element="shape"]').element as HTMLElement
    expect(el.style.width).toBe('50px')
    expect(el.style.height).toBe('50px')
    expect(el.style.borderRadius).toBe('')
  })

  it('renders a circle with 50% radius', () => {
    const w = mount(ShapeChromeElement, {
      props: {
        element: {
          id: 's1',
          type: 'shape',
          shape: 'circle',
          enabled: true,
          position: 'absolute',
          anchor: 'top-left',
          color: '#000',
          width: '40px',
          height: '40px',
          offsetX: '0',
          offsetY: '0',
          zIndex: 1,
        },
      },
    })
    const el = w.find('[data-chrome-element="shape"]').element as HTMLElement
    expect(el.style.borderRadius).toBe('50%')
  })

  it('applies rotation when set', () => {
    const w = mount(ShapeChromeElement, {
      props: {
        element: {
          id: 's1',
          type: 'shape',
          shape: 'rectangle',
          enabled: true,
          position: 'absolute',
          anchor: 'top-left',
          color: '#000',
          width: '40px',
          height: '40px',
          offsetX: '0',
          offsetY: '0',
          zIndex: 1,
          rotation: '45deg',
        },
      },
    })
    const el = w.find('[data-chrome-element="shape"]').element as HTMLElement
    expect(el.style.transform).toContain('rotate(45deg)')
  })
})
