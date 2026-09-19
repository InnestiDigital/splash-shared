/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { ref, defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { VIEWPORT_OVERRIDE } from '~/shared/composables/useViewport'
import { useLayoutScale } from '~/shared/features/layout/useLayoutScale'
import type { LayoutFrameConfig } from '~/shared/types/layout'

const scaleFrame: LayoutFrameConfig = {
  containerMode: 'content', insetX: 'md', overflowX: 'visible',
  responsiveMode: 'scale', designWidth: 1440, minScale: 0.25, maxScale: 1, scaleOrigin: 'top-center',
}

function host(frame: LayoutFrameConfig) {
  return defineComponent({
    setup() {
      const scale = useLayoutScale(() => frame)
      return { scale }
    },
    render() {
      return h('div', { 'data-scale': String(this.scale) })
    },
  })
}

describe('useLayoutScale', () => {
  it('returns 1 in breakpoint mode regardless of viewport', () => {
    const v = ref(720)
    const Component = host({ ...scaleFrame, responsiveMode: 'breakpoint' })
    const w = mount(Component, { global: { provide: { [VIEWPORT_OVERRIDE as symbol]: v } } })
    expect(w.attributes('data-scale')).toBe('1')
  })

  it('reflects viewport / designWidth in scale mode', () => {
    const v = ref(720)
    const Component = host(scaleFrame)
    const w = mount(Component, { global: { provide: { [VIEWPORT_OVERRIDE as symbol]: v } } })
    expect(w.attributes('data-scale')).toBe('0.5')
  })

  it('reacts to viewport changes', async () => {
    const v = ref(1440)
    const Component = host(scaleFrame)
    const w = mount(Component, { global: { provide: { [VIEWPORT_OVERRIDE as symbol]: v } } })
    expect(w.attributes('data-scale')).toBe('1')
    v.value = 360
    await nextTick()
    expect(w.attributes('data-scale')).toBe('0.25')
  })
})
