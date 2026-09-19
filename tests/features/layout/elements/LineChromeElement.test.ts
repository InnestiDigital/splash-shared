/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LineChromeElement from '~/shared/features/layout/elements/LineChromeElement.vue'

describe('LineChromeElement', () => {
  const baseProps = {
    element: {
      id: 'blue-line',
      type: 'line' as const,
      enabled: true,
      position: 'fixed' as const,
      anchor: 'bottom-left' as const,
      orientation: 'vertical' as const,
      color: '#1B8AB7',
      thickness: '24px',
      length: '100vh',
      offsetX: '0px',
      offsetY: '0px',
      zIndex: 1000,
    },
  }

  it('renders a vertical line with correct dimensions', () => {
    const w = mount(LineChromeElement, { props: baseProps })
    const el = w.find('[data-chrome-element="line"]').element as HTMLElement
    expect(el.style.width).toBe('24px')
    expect(el.style.height).toBe('100vh')
    // happy-dom preserves the input hex; jsdom would normalize to rgb()
    expect(el.style.backgroundColor.toLowerCase()).toMatch(/^(#1b8ab7|rgb\(27, 138, 183\))$/)
  })

  it('renders a horizontal line with swapped dimensions', () => {
    const props = {
      element: { ...baseProps.element, orientation: 'horizontal' as const, length: '100vw' },
    }
    const w = mount(LineChromeElement, { props })
    const el = w.find('[data-chrome-element="line"]').element as HTMLElement
    expect(el.style.width).toBe('100vw')
    expect(el.style.height).toBe('24px')
  })

  it('does not render when enabled is false', () => {
    const props = { element: { ...baseProps.element, enabled: false } }
    const w = mount(LineChromeElement, { props })
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(false)
  })

  it('applies fixed position and anchor offsets', () => {
    const w = mount(LineChromeElement, { props: baseProps })
    const el = w.find('[data-chrome-element="line"]').element as HTMLElement
    expect(el.style.position).toBe('fixed')
    expect(el.style.bottom).toBe('0px')
    expect(el.style.left).toBe('0px')
  })

  it('emits data-hide-below when hideBelow is set', () => {
    const props = { element: { ...baseProps.element, hideBelow: 'md' as const } }
    const w = mount(LineChromeElement, { props })
    const el = w.find('[data-chrome-element="line"]')
    expect(el.attributes('data-hide-below')).toBe('md')
  })
})
