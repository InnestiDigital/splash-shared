// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, nextTick } from 'vue'
import { providePageData, usePageData, type CallApiFn } from '~/shared/composables/usePageData'

/**
 * Helper: mount a parent component that calls providePageData(),
 * and a child component that calls usePageData().
 * Returns refs to both.
 */
function mountWithProvideInject(callApi: CallApiFn, prefetchMethods: string[] = []) {
  const childData = ref<any>(null)
  const childLoading = ref<boolean>(false)
  const childHas = ref<Record<string, boolean>>({})
  const childGet = ref<Record<string, any>>({})

  const Child = defineComponent({
    setup() {
      const { data, loading, hasMethodData, getMethodData } = usePageData()
      // Expose to parent test
      childData.value = data
      childLoading.value = loading.value
      childHas.value = {}
      childGet.value = {}

      return { data, loading, hasMethodData, getMethodData }
    },
    template: '<div class="child">{{ JSON.stringify(data) }}</div>',
  })

  const Parent = defineComponent({
    components: { Child },
    setup() {
      const { data, loading, executePrefetch } = providePageData()
      return { data, loading, executePrefetch }
    },
    template: '<div class="parent"><Child /></div>',
  })

  const wrapper = mount(Parent)
  return { wrapper, childData, prefetchMethods }
}

describe('usePageData', () => {
  it('provides default empty state to children', () => {
    const mockCallApi = vi.fn()
    const { wrapper } = mountWithProvideInject(mockCallApi)
    expect(wrapper.find('.child').text()).toContain('{}')
  })

  it('executePrefetch stores fulfilled results keyed by method name', async () => {
    const mockCallApi: CallApiFn = vi.fn()
      .mockResolvedValueOnce({ products: [1, 2, 3] })
      .mockResolvedValueOnce({ categories: ['A', 'B'] })

    const Parent = defineComponent({
      setup() {
        const { data, loading, executePrefetch } = providePageData()
        return { data, loading, executePrefetch }
      },
      template: '<div>{{ JSON.stringify(data) }}</div>',
    })

    const wrapper = mount(Parent)
    const vm = wrapper.vm as any

    await vm.executePrefetch(['shop-get-products', 'shop-get-categories'], mockCallApi)

    expect(mockCallApi).toHaveBeenCalledTimes(2)
    expect(mockCallApi).toHaveBeenCalledWith('shop-get-products', {})
    expect(mockCallApi).toHaveBeenCalledWith('shop-get-categories', {})

    expect(vm.data['shop-get-products']).toEqual({ products: [1, 2, 3] })
    expect(vm.data['shop-get-categories']).toEqual({ categories: ['A', 'B'] })
    expect(vm.loading).toBe(false)
  })

  it('executePrefetch silently handles rejected methods', async () => {
    const mockCallApi: CallApiFn = vi.fn()
      .mockResolvedValueOnce({ data: 'ok' })
      .mockRejectedValueOnce(new Error('Network error'))

    const Parent = defineComponent({
      setup() {
        const { data, loading, executePrefetch } = providePageData()
        return { data, loading, executePrefetch }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Parent)
    const vm = wrapper.vm as any

    // Should not throw
    await vm.executePrefetch(['success-method', 'failing-method'], mockCallApi)

    expect(vm.data['success-method']).toEqual({ data: 'ok' })
    expect(vm.data['failing-method']).toBeUndefined()
    expect(vm.loading).toBe(false)
  })

  it('executePrefetch is a no-op for empty methods array', async () => {
    const mockCallApi = vi.fn()

    const Parent = defineComponent({
      setup() {
        const { data, loading, executePrefetch } = providePageData()
        return { data, loading, executePrefetch }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Parent)
    await (wrapper.vm as any).executePrefetch([], mockCallApi)
    expect(mockCallApi).not.toHaveBeenCalled()
  })

  it('loading is true during prefetch execution', async () => {
    let resolveFn: (v: any) => void
    const pendingPromise = new Promise(resolve => { resolveFn = resolve })
    const mockCallApi: CallApiFn = vi.fn().mockReturnValue(pendingPromise)

    const Parent = defineComponent({
      setup() {
        const { data, loading, executePrefetch } = providePageData()
        return { data, loading, executePrefetch }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Parent)
    const vm = wrapper.vm as any

    const prefetchPromise = vm.executePrefetch(['slow-method'], mockCallApi)

    // Should be loading while waiting
    expect(vm.loading).toBe(true)

    // Resolve the pending call
    resolveFn!({ result: 'done' })
    await prefetchPromise

    expect(vm.loading).toBe(false)
    expect(vm.data['slow-method']).toEqual({ result: 'done' })
  })

  it('child hasMethodData and getMethodData work after prefetch', async () => {
    const mockCallApi: CallApiFn = vi.fn().mockResolvedValue({ items: [1] })

    const Child = defineComponent({
      setup() {
        const { hasMethodData, getMethodData } = usePageData()
        return { hasMethodData, getMethodData }
      },
      template: '<div></div>',
    })

    const Parent = defineComponent({
      components: { Child },
      setup() {
        const { data, loading, executePrefetch } = providePageData()
        return { data, loading, executePrefetch }
      },
      template: '<div><Child ref="child" /></div>',
    })

    const wrapper = mount(Parent)
    const parentVm = wrapper.vm as any
    const childVm = wrapper.findComponent(Child).vm as any

    // Before prefetch
    expect(childVm.hasMethodData('my-method')).toBe(false)
    expect(childVm.getMethodData('my-method')).toBeUndefined()

    await parentVm.executePrefetch(['my-method'], mockCallApi)
    await nextTick()

    // After prefetch
    expect(childVm.hasMethodData('my-method')).toBe(true)
    expect(childVm.getMethodData('my-method')).toEqual({ items: [1] })
  })

  it('usePageData returns empty defaults when used outside provider', () => {
    // Component that uses usePageData without a parent providing it
    const Orphan = defineComponent({
      setup() {
        const { data, loading, hasMethodData, getMethodData } = usePageData()
        return { data, loading, hasMethodData, getMethodData }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Orphan)
    const vm = wrapper.vm as any

    expect(vm.data).toEqual({})
    expect(vm.loading).toBe(false)
    expect(vm.hasMethodData('anything')).toBe(false)
    expect(vm.getMethodData('anything')).toBeUndefined()
  })
})
