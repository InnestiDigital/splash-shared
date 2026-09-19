// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, provide, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useViewport, VIEWPORT_OVERRIDE } from '~/shared/composables/useViewport'

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  observed: Element[] = []
  disconnected = false

  constructor(private readonly callback: ResizeCallback) {
    MockResizeObserver.instances.push(this)
  }

  observe(el: Element) {
    this.observed.push(el)
  }

  disconnect() {
    this.disconnected = true
  }

  emit(width: number) {
    this.callback([{ contentRect: { width } }])
  }
}

/**
 * happy-dom's `getComputedStyle` knows nothing about `container-type`, so the
 * lookup is fed from an explicit attribute instead.
 */
function stubComputedContainerType() {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const declaration = real(el)
    const declared = el.getAttribute('data-test-container-type')
    const patched = Object.create(declaration)
    patched.getPropertyValue = (property: string) =>
      property === 'container-type' ? (declared ?? '') : declaration.getPropertyValue(property)
    return patched
  })
}

const Probe = defineComponent({
  setup() {
    const { innerWidth } = useViewport()
    return { innerWidth }
  },
  render() {
    return h('div', { class: 'probe' }, String(this.innerWidth))
  },
})

function mountInContainer(containerType: string | null) {
  const Host = defineComponent({
    render() {
      return h(
        'div',
        containerType === null ? {} : { 'data-test-container-type': containerType },
        [h('section', [h(Probe)])],
      )
    },
  })
  return mount(Host, { attachTo: document.body })
}

beforeEach(() => {
  MockResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  window.innerWidth = 1440
  stubComputedContainerType()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useViewport', () => {
  it('returns the injected override untouched and observes nothing', () => {
    const Overridden = defineComponent({
      setup() {
        provide(VIEWPORT_OVERRIDE, ref(375))
        return () => h(Probe)
      },
    })

    const wrapper = mount(Overridden, { attachTo: document.body })

    expect(wrapper.text()).toBe('375')
    expect(MockResizeObserver.instances).toHaveLength(0)
  })

  it('observes the nearest inline-size container instead of the window', async () => {
    const wrapper = mountInContainer('inline-size')
    await nextTick()

    const observer = MockResizeObserver.instances[0]
    expect(observer).toBeDefined()
    expect(observer!.observed[0]).toBe(wrapper.element)

    observer!.emit(640)
    await nextTick()
    expect(wrapper.text()).toBe('640')
  })

  it('tracks later container resizes', async () => {
    const wrapper = mountInContainer('inline-size')
    await nextTick()

    const observer = MockResizeObserver.instances[0]!
    observer.emit(1200)
    await nextTick()
    expect(wrapper.text()).toBe('1200')

    observer.emit(420)
    await nextTick()
    expect(wrapper.text()).toBe('420')
  })

  it('accepts container-type: size as an inline-size container', async () => {
    const wrapper = mountInContainer('size')
    await nextTick()

    expect(MockResizeObserver.instances).toHaveLength(1)
    MockResizeObserver.instances[0]!.emit(500)
    await nextTick()
    expect(wrapper.text()).toBe('500')
  })

  it('falls back to the window when no container ancestor exists', async () => {
    const wrapper = mountInContainer(null)
    await nextTick()

    expect(MockResizeObserver.instances).toHaveLength(0)
    expect(wrapper.text()).toBe('1440')

    window.innerWidth = 380
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.text()).toBe('380')
  })

  it('disconnects the observer on unmount', async () => {
    const wrapper = mountInContainer('inline-size')
    await nextTick()

    const observer = MockResizeObserver.instances[0]!
    wrapper.unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('stops listening to window resizes on unmount', async () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const wrapper = mountInContainer(null)
    await nextTick()

    wrapper.unmount()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
