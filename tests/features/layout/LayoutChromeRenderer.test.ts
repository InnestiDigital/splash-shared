/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'

// TextChromeElement pulls in useTypographySlotStyle which uses Nuxt's useState.
// Stub it before importing LayoutChromeRenderer (which imports the text element).
vi.mock('~/shared/composables/useTypographySlotStyle', () => ({
  useTypographySlotStyle: () => computed(() => ({})),
}))

import LayoutChromeRenderer from '~/shared/features/layout/LayoutChromeRenderer.vue'

describe('LayoutChromeRenderer', () => {
  it('renders a line element', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        chrome: {
          elements: [
            {
              id: 'l1',
              type: 'line',
              enabled: true,
              position: 'fixed',
              anchor: 'bottom-left',
              orientation: 'vertical',
              color: '#1B8AB7',
              thickness: '24px',
              length: '100vh',
              offsetX: '0',
              offsetY: '0',
              zIndex: 1000,
            },
          ],
        },
      },
    })
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(true)
  })

  it('renders multiple element types', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        chrome: {
          elements: [
            { id: 'l1', type: 'line', enabled: true, position: 'fixed', anchor: 'top-left', orientation: 'horizontal', color: '#000', thickness: '2px', length: '100vw', offsetX: '0', offsetY: '0', zIndex: 1 },
            { id: 's1', type: 'shape', shape: 'rectangle', enabled: true, position: 'absolute', anchor: 'top-right', color: '#ff0000', width: '50px', height: '50px', offsetX: '0', offsetY: '0', zIndex: 1 },
          ] as any,
        },
      },
    })
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(true)
    expect(w.find('[data-chrome-element="shape"]').exists()).toBe(true)
  })

  it('skips disabled elements', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        chrome: {
          elements: [
            { id: 'l1', type: 'line', enabled: false, position: 'fixed', anchor: 'top-left', orientation: 'horizontal', color: '#000', thickness: '2px', length: '100vw', offsetX: '0', offsetY: '0', zIndex: 1 },
          ] as any,
        },
      },
    })
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(false)
  })

  it('excludes positionMode:flow elements from the default (viewport) render', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        chrome: {
          elements: [
            { id: 'flow', type: 'line', enabled: true, positionMode: 'flow', layer: 'background', position: 'fixed', anchor: 'top-right', orientation: 'vertical', color: '#1B8AB7', thickness: '1px', length: '100%', offsetX: '20vw', offsetY: '0', zIndex: 0 },
            { id: 'fixed', type: 'shape', shape: 'rectangle', enabled: true, position: 'fixed', anchor: 'top-left', color: '#000', width: '10px', height: '10px', offsetX: '0', offsetY: '0', zIndex: 1 },
          ] as any,
        },
      },
    })
    // flow line excluded; the viewport-fixed shape still renders
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(false)
    expect(w.find('[data-chrome-element="shape"]').exists()).toBe(true)
    expect(w.find('.layout-chrome-flow').exists()).toBe(false)
  })

  it('renders ONLY positionMode:flow elements when mode is flow, inside the flow wrapper', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        mode: 'flow',
        chrome: {
          elements: [
            { id: 'flow', type: 'line', enabled: true, positionMode: 'flow', layer: 'background', position: 'fixed', anchor: 'top-right', orientation: 'vertical', color: '#1B8AB7', thickness: '1px', length: '100%', offsetX: '20vw', offsetY: '0', zIndex: 0 },
            { id: 'fixed', type: 'shape', shape: 'rectangle', enabled: true, position: 'fixed', anchor: 'top-left', color: '#000', width: '10px', height: '10px', offsetX: '0', offsetY: '0', zIndex: 1 },
          ] as any,
        },
      },
    })
    const flowWrap = w.find('.layout-chrome-flow')
    expect(flowWrap.exists()).toBe(true)
    expect(flowWrap.attributes('data-chrome-layer')).toBe('flow')
    // flow line rendered inside the wrapper; the viewport-fixed shape is NOT
    const line = w.find('[data-chrome-element="line"]')
    expect(line.exists()).toBe(true)
    expect(flowWrap.element.contains(line.element)).toBe(true)
    expect(w.find('[data-chrome-element="shape"]').exists()).toBe(false)
    // no viewport layers rendered in flow mode
    expect(w.find('.layout-chrome-bg').exists()).toBe(false)
  })

  it('coerces flow elements to position:absolute', () => {
    const w = mount(LayoutChromeRenderer, {
      props: {
        mode: 'flow',
        chrome: {
          elements: [
            { id: 'flow', type: 'line', enabled: true, positionMode: 'flow', position: 'fixed', anchor: 'top-right', orientation: 'vertical', color: '#1B8AB7', thickness: '1px', length: '100%', offsetX: '20vw', offsetY: '0', zIndex: 0 },
          ] as any,
        },
      },
    })
    const line = w.find('[data-chrome-element="line"]').element as HTMLElement
    expect(line.style.position).toBe('absolute')
  })
})
