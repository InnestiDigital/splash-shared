/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('~/shared/composables/useTypographySlotStyle', () => ({
  useTypographySlotStyle: () => computed(() => ({})),
}))

import LayoutShell from '~/shared/features/layout/LayoutShell.vue'
import { applyLayoutDefaults } from '~/shared/features/layout/layoutDefaults'
import { VIEWPORT_OVERRIDE } from '~/shared/composables/useViewport'
import { inject } from 'vue'

const minimalLayout = {
  id: 'default',
  label: { 'en-US': 'Default' },
  allowedBlocks: [],
}

describe('LayoutShell', () => {
  it('renders default slot content', () => {
    const w = mount(LayoutShell, {
      props: { resolvedLayout: applyLayoutDefaults(minimalLayout) },
      slots: { default: '<main>Page content</main>' },
    })
    expect(w.find('main').text()).toBe('Page content')
  })

  it('applies scroll mode class when snap-y', () => {
    const layout = applyLayoutDefaults({ ...minimalLayout, scroll: { mode: 'snap-y' } })
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
    })
    const root = w.find('[data-layout-shell]').element as HTMLElement
    expect(root.dataset.scrollMode).toBe('snap-y')
  })

  it('renders chrome elements', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      chrome: {
        elements: [
          { id: 'l1', type: 'line', enabled: true, position: 'fixed', anchor: 'bottom-left', orientation: 'vertical', color: '#1B8AB7', thickness: '24px', length: '100vh', offsetX: '0', offsetY: '0', zIndex: 1000 },
        ] as any,
      },
    })
    const w = mount(LayoutShell, { props: { resolvedLayout: layout } })
    expect(w.find('[data-chrome-element="line"]').exists()).toBe(true)
  })

  it('renders background layer when configured', () => {
    const layout = applyLayoutDefaults({ ...minimalLayout, background: { color: '#ff0000' } })
    const w = mount(LayoutShell, { props: { resolvedLayout: layout } })
    expect(w.find('[data-layout-background]').exists()).toBe(true)
  })

  it('does NOT render scale wrapper when responsiveMode is breakpoint (default)', () => {
    const layout = applyLayoutDefaults(minimalLayout)
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: '<p>page content</p>' },
    })
    expect(w.find('[data-layout-shell]').attributes('data-responsive-mode')).toBe('breakpoint')
    expect(w.find('.layout-scale-content').exists()).toBe(false)
  })

  it('renders scale wrapper when responsiveMode is scale', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
      },
    })
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: '<p>page content</p>' },
    })
    expect(w.find('[data-layout-shell]').attributes('data-responsive-mode')).toBe('scale')
    expect(w.find('.layout-scale-viewport').exists()).toBe(true)
    expect(w.find('.layout-scale-spacer').exists()).toBe(true)
    expect(w.find('.layout-scale-content').exists()).toBe(true)
    expect(w.find('.layout-scale-content').find('p').text()).toBe('page content')
  })

  it('exposes designWidth + scale + origin via CSS variables on the scale content', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 1200, minScale: 0.5, maxScale: 1, scaleOrigin: 'top-left',
      },
    })
    const w = mount(LayoutShell, { props: { resolvedLayout: layout } })
    const content = w.find('.layout-scale-content').element as HTMLElement
    expect(content.style.getPropertyValue('--layout-design-width')).toBe('1200px')
    expect(content.style.getPropertyValue('--layout-scale-origin')).toBe('top left')
    expect(content.getAttribute('data-scale-origin')).toBe('top-left')
    const scale = content.style.getPropertyValue('--layout-scale')
    expect(Number(scale)).toBeGreaterThan(0)
  })

  it('emits the frame as CSS custom properties on the layout content', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'wide', insetX: 'lg', overflowX: 'visible', sectionSpacingDefault: 'xl',
      },
    })
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: '<p>page content</p>' },
    })
    const content = w.find('[data-layout-content]').element as HTMLElement
    expect(content.style.getPropertyValue('--layout-max-width'))
      .toBe('max(var(--container-max-width, 1200px), 1400px)')
    expect(content.style.getPropertyValue('--layout-inset-x')).toBe('var(--container-inset-x-lg)')
    expect(content.style.getPropertyValue('--layout-space-y')).toBe('var(--section-space-y-xl)')
  })

  it('emits the frame custom properties from the frame defaults when unset', () => {
    const w = mount(LayoutShell, {
      props: { resolvedLayout: applyLayoutDefaults(minimalLayout) },
      slots: { default: '<p>page content</p>' },
    })
    const content = w.find('[data-layout-content]').element as HTMLElement
    expect(content.style.getPropertyValue('--layout-max-width')).toBe('var(--container-max-width, 1200px)')
    expect(content.style.getPropertyValue('--layout-inset-x')).toBe('var(--container-inset-x-md)')
    expect(content.style.getPropertyValue('--layout-space-y')).toBe('var(--section-space-y-md)')
  })

  it('emits the frame custom properties on the scale content too', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'full-bleed', insetX: 'none', overflowX: 'clip', sectionSpacingDefault: 'none',
        responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
      },
    })
    const w = mount(LayoutShell, { props: { resolvedLayout: layout } })
    const content = w.find('.layout-scale-content').element as HTMLElement
    expect(content.style.getPropertyValue('--layout-max-width')).toBe('none')
    expect(content.style.getPropertyValue('--layout-inset-x')).toBe('var(--container-inset-x-none)')
    expect(content.style.getPropertyValue('--layout-space-y')).toBe('var(--section-space-y-none)')
  })

  it('keeps chrome elements OUTSIDE the scale wrapper', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
      },
      chrome: {
        elements: [
          { id: 'l1', type: 'line', enabled: true, layer: 'background', position: 'fixed', anchor: 'bottom-left', orientation: 'vertical', color: '#1B8AB7', thickness: '24px', length: '100vh', offsetX: '0', offsetY: '0', zIndex: 0 },
        ] as any,
      },
    })
    const w = mount(LayoutShell, { props: { resolvedLayout: layout } })
    const chromeEl = w.find('[data-chrome-element="line"]')
    const scaleContent = w.find('.layout-scale-content')
    expect(chromeEl.exists()).toBe(true)
    expect(scaleContent.exists()).toBe(true)
    expect(scaleContent.element.contains(chromeEl.element)).toBe(false)
  })

  it('provides VIEWPORT_OVERRIDE = designWidth inside scale content (so blocks skip mobile collapse)', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
      },
    })

    // Probe component reads VIEWPORT_OVERRIDE via the same path useViewport()
    // would. Confirms scale content provides the design width to descendants.
    const Probe = {
      template: '<span data-probe>{{ width }}</span>',
      setup() {
        const ref = inject<{ value: number } | null>(VIEWPORT_OVERRIDE, null)
        return { width: ref?.value ?? 'none' }
      },
    }
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: Probe },
    })
    expect(w.find('[data-probe]').text()).toBe('1440')
  })

  it('does NOT provide VIEWPORT_OVERRIDE in breakpoint mode (blocks see actual viewport)', () => {
    const layout = applyLayoutDefaults(minimalLayout)
    const Probe = {
      template: '<span data-probe>{{ has }}</span>',
      setup() {
        const ref = inject<{ value: number } | null>(VIEWPORT_OVERRIDE, null)
        return { has: ref ? 'yes' : 'no' }
      },
    }
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: Probe },
    })
    expect(w.find('[data-probe]').text()).toBe('no')
  })

  it('mounts a flow-mode chrome renderer inside the content wrapper (breakpoint branch)', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      chrome: {
        elements: [
          { id: 'flow', type: 'line', enabled: true, positionMode: 'flow', layer: 'background', position: 'fixed', anchor: 'top-right', orientation: 'vertical', color: '#1B8AB7', thickness: '1px', length: '100%', offsetX: '20vw', offsetY: '0px', zIndex: 0 },
        ] as any,
      },
    })
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: '<p>page content</p>' },
    })
    const content = w.find('[data-layout-content]')
    const flow = w.find('.layout-chrome-flow')
    expect(content.exists()).toBe(true)
    expect(flow.exists()).toBe(true)
    expect(content.element.contains(flow.element)).toBe(true)
    // the flow line renders inside the flow wrapper
    expect(flow.find('[data-chrome-element="line"]').exists()).toBe(true)
  })

  it('mounts a flow-mode chrome renderer inside the scale content wrapper (scale branch)', () => {
    const layout = applyLayoutDefaults({
      ...minimalLayout,
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
      },
      chrome: {
        elements: [
          { id: 'flow', type: 'line', enabled: true, positionMode: 'flow', layer: 'background', position: 'fixed', anchor: 'top-right', orientation: 'vertical', color: '#1B8AB7', thickness: '1px', length: '100%', offsetX: '23.3%', offsetY: '0px', zIndex: 0 },
        ] as any,
      },
    })
    const w = mount(LayoutShell, {
      props: { resolvedLayout: layout },
      slots: { default: '<p>page content</p>' },
    })
    const scaleContent = w.find('.layout-scale-content')
    const flow = w.find('.layout-chrome-flow')
    expect(scaleContent.exists()).toBe(true)
    expect(flow.exists()).toBe(true)
    expect(scaleContent.element.contains(flow.element)).toBe(true)
  })

  it('updates spacer height when ResizeObserver reports a new content height', async () => {
    let capturedCallback: ResizeObserverCallback | null = null
    class StubResizeObserver {
      callback: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) { this.callback = cb; capturedCallback = cb }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const original = (globalThis as any).ResizeObserver
    ;(globalThis as any).ResizeObserver = StubResizeObserver

    try {
      const layout = applyLayoutDefaults({
        ...minimalLayout,
        frame: {
          containerMode: 'content', insetX: 'md', overflowX: 'visible',
          responsiveMode: 'scale', designWidth: 1000, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-left',
        },
      })
      const w = mount(LayoutShell, {
        props: { resolvedLayout: layout },
        slots: { default: '<p>content</p>' },
      })

      const spacer = () => w.find('.layout-scale-spacer').element as HTMLElement

      // Observer wiring is a post-flush watcher on the content element ref
      // (re-wires across isScale breakpoint crossings) — flush it first.
      await w.vm.$nextTick()

      expect(capturedCallback).not.toBeNull()
      capturedCallback!([{ contentRect: { height: 2000 } } as any], {} as any)
      await new Promise(r => setTimeout(r, 0))

      // scale = clamp(0.25, viewport / 1000, 1). happy-dom default viewport >= 1000 → scale = 1.
      // Spacer height = 2000 × 1 = 2000px.
      expect(spacer().style.height).toBe('2000px')
    } finally {
      ;(globalThis as any).ResizeObserver = original
    }
  })
})
