// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Deterministic theme motion config (entranceThreshold drives the observer).
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useClientConfig', () => ({
  useClientConfig: () => ({
    config: {
      value: {
        motion: {
          entranceThreshold: 0.15,
          entranceDelay: 0,
          defaultDuration: 600,
          defaultChoreography: { baseDelay: 80 },
        },
      },
    },
  }),
}))

import { useEntranceReveal } from '~/shared/composables/useEntranceReveal'

// ---------------------------------------------------------------------------
// IntersectionObserver mock — records thresholds, lets tests fire entries with
// an explicit intersectionRatio + boundingClientRect height.
// ---------------------------------------------------------------------------

interface MockIO {
  callback: IntersectionObserverCallback
  observed: Element[]
  thresholds: number[]
  unobserved: Element[]
}

let observers: MockIO[] = []

class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  observed: Element[] = []
  unobserved: Element[] = []
  thresholds: number[]

  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb
    const t = options?.threshold
    this.thresholds = t === undefined ? [0] : Array.isArray(t) ? t : [t]
    observers.push(this)
  }

  observe(el: Element) { this.observed.push(el) }
  unobserve(el: Element) { this.unobserved.push(el) }
  disconnect() { this.observed = [] }
  takeRecords() { return [] as any[] }
}

function fire(el: Element, ratio: number, height: number) {
  const io = observers[observers.length - 1]
  io.callback(
    [{
      isIntersecting: true,
      target: el,
      intersectionRatio: ratio,
      boundingClientRect: { height } as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    }] as unknown as IntersectionObserverEntry[],
    io as unknown as IntersectionObserver,
  )
}

let animateSpy: ReturnType<typeof vi.fn>

function mountEntrance() {
  const Comp = defineComponent({
    setup() {
      const rootEl = ref<HTMLElement | null>(null)
      useEntranceReveal(rootEl)
      return { rootEl }
    },
    render() {
      return h('div', { ref: 'rootEl' }, [
        h('section', { 'data-entrance': '' }, 'target'),
      ])
    },
  })
  return mount(Comp, { attachTo: document.body })
}

describe('useEntranceReveal — tall-target reveal (entrance-tall-sections)', () => {
  beforeEach(() => {
    observers = []
    // @ts-expect-error — override global
    globalThis.IntersectionObserver = MockIntersectionObserver
    animateSpy = vi.fn(() => ({
      addEventListener: vi.fn(),
      cancel: vi.fn(),
    } as any))
    // @ts-expect-error — augment prototype for tests
    HTMLElement.prototype.animate = animateSpy
    window.innerHeight = 900
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }) as any
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('observes at [0, threshold] so the 0-crossing can reach tall targets', async () => {
    mountEntrance()
    await nextTick()
    expect(observers[0].thresholds).toEqual([0, 0.15])
  })

  it('pre-hides the target at opacity:0 on mount', async () => {
    const wrapper = mountEntrance()
    await nextTick()
    const el = wrapper.element.querySelector('[data-entrance]') as HTMLElement
    expect(el.style.opacity).toBe('0')
  })

  it('reveals a viewport-taller target even when ratio never reaches threshold', async () => {
    const wrapper = mountEntrance()
    await nextTick()
    const el = wrapper.element.querySelector('[data-entrance]') as HTMLElement

    // 6146px section at 900px viewport: max ratio ~0.146 < 0.15 — old code
    // stranded it. Fire the 0-crossing with a below-threshold ratio.
    fire(el, 0.02, 6146)

    expect(animateSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT reveal a normal target below threshold, but does at threshold', async () => {
    const wrapper = mountEntrance()
    await nextTick()
    const el = wrapper.element.querySelector('[data-entrance]') as HTMLElement

    // Normal 300px element reporting the 0-crossing — must wait.
    fire(el, 0.02, 300)
    expect(animateSpy).not.toHaveBeenCalled()

    // Crosses the configured threshold — reveals now (ref-tuned feel intact).
    fire(el, 0.2, 300)
    expect(animateSpy).toHaveBeenCalledTimes(1)
  })
})
