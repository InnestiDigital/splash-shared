// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useHeaderMorphProgress } from '~/shared/composables/useHeaderMorphProgress'

function mountWithComposable(options: Parameters<typeof useHeaderMorphProgress>[0]) {
  let result!: ReturnType<typeof useHeaderMorphProgress>
  const wrapper = mount(defineComponent({
    setup() {
      result = useHeaderMorphProgress(options)
      return () => h('div')
    },
  }))
  return { wrapper, result }
}

async function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  window.dispatchEvent(new Event('scroll'))
  // rAF-throttled handler
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
  await nextTick()
}

describe('useHeaderMorphProgress', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('runs 0→1 over a fixed distance and clamps at both ends', async () => {
    const { wrapper, result } = mountWithComposable({ distancePx: 400 })
    await scrollTo(0)
    expect(result.progress.value).toBe(0)
    await scrollTo(200)
    expect(result.progress.value).toBeCloseTo(0.5)
    await scrollTo(400)
    expect(result.progress.value).toBe(1)
    await scrollTo(900)
    expect(result.progress.value).toBe(1)
    wrapper.unmount()
  })

  it('measures the trigger element bottom when no distance is given', async () => {
    const hero = document.createElement('div')
    hero.setAttribute('data-section-role', 'hero')
    vi.spyOn(hero, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
    document.body.appendChild(hero)

    const { wrapper, result } = mountWithComposable({})
    await scrollTo(400)
    expect(result.progress.value).toBeCloseTo(0.5)
    wrapper.unmount()
    hero.remove()
  })

  it('removes its scroll listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = mountWithComposable({ distancePx: 400 })
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})
