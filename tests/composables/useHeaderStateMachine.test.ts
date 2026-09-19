// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { useHeaderStateMachine } from '~/shared/composables/useHeaderStateMachine'
import type { HeaderState, CompactTrigger } from '~/shared/types/headerZone'

// Mock useReducedMotion
vi.mock('~/shared/composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ isReducedMotion: { value: false } }),
}))

function mountStateMachine(opts?: {
  trigger?: CompactTrigger
  duration?: number
  easing?: string
}) {
  let result: ReturnType<typeof useHeaderStateMachine> | undefined

  const Comp = defineComponent({
    setup() {
      result = useHeaderStateMachine({
        trigger: opts?.trigger ?? { unit: 'px', value: 200 },
        duration: opts?.duration ?? 300,
        easing: opts?.easing ?? 'ease-out',
      })
      return () => h('div')
    },
  })

  const wrapper = mount(Comp)
  return { result: result!, wrapper }
}

describe('useHeaderStateMachine', () => {
  let rafCallbacks: ((time: number) => void)[]
  let rafId: number

  beforeEach(() => {
    rafCallbacks = []
    rafId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return ++rafId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function simulateScroll(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  }

  function flushRaf(time: number) {
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    cbs.forEach(cb => cb(time))
  }

  it('starts in expanded state', () => {
    const { result } = mountStateMachine()
    expect(result.state.value).toBe('expanded')
    expect(result.isCompact.value).toBe(false)
    expect(result.isTransitioning.value).toBe(false)
    expect(result.transitionProgress.value).toBe(0)
  })

  it('transitions to compact when scroll crosses threshold', async () => {
    const { result } = mountStateMachine({ trigger: { unit: 'px', value: 100 } })

    simulateScroll(150)
    await nextTick()

    expect(result.state.value).toBe('transitioning-to-compact')
    expect(result.isTransitioning.value).toBe(true)
    expect(result.transitionDirection.value).toBe('to-compact')
  })

  it('does not transition below threshold', async () => {
    const { result } = mountStateMachine({ trigger: { unit: 'px', value: 100 } })

    simulateScroll(50)
    await nextTick()

    expect(result.state.value).toBe('expanded')
  })

  it('completes transition after rAF loop finishes', async () => {
    const { result } = mountStateMachine({
      trigger: { unit: 'px', value: 100 },
      duration: 300,
    })

    simulateScroll(150)
    await nextTick()

    flushRaf(0)    // start frame
    flushRaf(300)  // end frame
    await nextTick()

    expect(result.state.value).toBe('compact')
    expect(result.isCompact.value).toBe(true)
    expect(result.transitionProgress.value).toBe(1)
  })

  it('advances transitionProgress during rAF loop', async () => {
    const { result } = mountStateMachine({
      trigger: { unit: 'px', value: 100 },
      duration: 200,
    })

    simulateScroll(150)
    await nextTick()

    flushRaf(0)    // start frame: records startTime
    flushRaf(100)  // mid frame
    await nextTick()

    expect(result.transitionProgress.value).toBeGreaterThan(0)
    expect(result.transitionProgress.value).toBeLessThanOrEqual(1)
  })

  it('transitions back to expanded when scrolling up past threshold', async () => {
    const { result } = mountStateMachine({
      trigger: { unit: 'px', value: 100 },
      duration: 10,
    })

    // Go compact first
    simulateScroll(150)
    await nextTick()
    flushRaf(0)
    flushRaf(10)
    await nextTick()
    expect(result.state.value).toBe('compact')

    // Scroll back up
    simulateScroll(50)
    await nextTick()

    expect(result.state.value).toBe('transitioning-to-expanded')
    expect(result.transitionDirection.value).toBe('to-expanded')
  })

  it('cleans up scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper } = mountStateMachine()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})

describe('useHeaderStateMachine — reduced motion', () => {
  let rafCallbacks: ((time: number) => void)[]

  beforeEach(() => {
    rafCallbacks = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('snaps directly to compact without transition states', async () => {
    const reducedMotionOverride = ref(true)
    let result: ReturnType<typeof useHeaderStateMachine> | undefined
    const Comp = defineComponent({
      setup() {
        result = useHeaderStateMachine({
          trigger: { unit: 'px', value: 100 },
          duration: 300,
          easing: 'ease-out',
          reducedMotionOverride,
        })
        return () => h('div')
      },
    })
    const wrapper = mount(Comp)

    Object.defineProperty(window, 'scrollY', { value: 150, writable: true, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(result!.state.value).toBe('compact')
    expect(result!.transitionProgress.value).toBe(1)
    expect(rafCallbacks).toHaveLength(0)
    wrapper.unmount()
  })
})
