// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { Ref } from 'vue'

// ---------------------------------------------------------------------------
// Mock useClientConfig before importing the composable so resolvePreset()
// has a deterministic theme config with presets available.
// ---------------------------------------------------------------------------

vi.mock('~/shared/composables/useClientConfig', () => ({
  useClientConfig: () => ({
    config: {
      value: {
        motion: {
          defaultRevealPreset: 'editorial-reveal',
          revealPresets: {
            'editorial-reveal': {
              startOpacity: 0,
              yOffset: 24,
              duration: 600,
              easing: 'cubic-bezier(.25,.1,.25,1)',
              triggerThreshold: 0.15,
            },
          },
        },
      },
    },
  }),
}))

import { useSectionReveal, type RevealOptions } from '~/shared/composables/useSectionReveal'

// ---------------------------------------------------------------------------
// IntersectionObserver mock — captures observers so tests can fire intersections
// ---------------------------------------------------------------------------

type IOCallback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void

interface MockIO {
  callback: IOCallback
  observed: Element[]
  disconnect: ReturnType<typeof vi.fn>
  options: IntersectionObserverInit | undefined
}

let observers: MockIO[] = []

class MockIntersectionObserver {
  callback: IOCallback
  observed: Element[] = []
  options: IntersectionObserverInit | undefined

  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    this.callback = cb
    this.options = options
    const disconnect = vi.fn(() => {
      this.observed = []
    })
    observers.push({ callback: cb, observed: this.observed, disconnect, options })
    // @ts-expect-error — assign for external reference
    this.disconnect = disconnect
  }

  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  takeRecords() { return [] as any[] }
}

// ---------------------------------------------------------------------------
// animate() mock — spy that records all WAAPI calls
// ---------------------------------------------------------------------------

let animateSpy: ReturnType<typeof vi.fn>

function installAnimateSpy() {
  animateSpy = vi.fn(() => ({ finished: Promise.resolve() } as any))
  // jsdom/happy-dom HTMLElement doesn't provide animate by default
  // @ts-expect-error — augment prototype for tests
  HTMLElement.prototype.animate = animateSpy
}

// ---------------------------------------------------------------------------
// matchMedia mock (prefers-reduced-motion)
// ---------------------------------------------------------------------------

function stubMatchMedia(prefersReduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersReduced,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })
}

// ---------------------------------------------------------------------------
// Mount helper — builds a section DOM with data-reveal targets and runs the composable
// ---------------------------------------------------------------------------

function mountSectionReveal(options: RevealOptions, opts?: { targets?: Array<'title' | 'eyebrow' | 'intro'> }) {
  const targets = opts?.targets ?? ['title', 'eyebrow', 'intro']

  const Comp = defineComponent({
    setup() {
      const sectionEl = ref<HTMLElement | null>(null)
      const result = useSectionReveal(sectionEl, options)
      return { sectionEl, result }
    },
    render() {
      return h('section', { ref: 'sectionEl' }, [
        targets.includes('eyebrow') ? h('span', { 'data-reveal': 'eyebrow' }, 'eyebrow') : null,
        targets.includes('title') ? h('h2', { 'data-reveal': 'title' }, 'title') : null,
        targets.includes('intro') ? h('p', { 'data-reveal': 'intro' }, 'intro') : null,
      ])
    },
  })

  return mount(Comp, { attachTo: document.body })
}

// ---------------------------------------------------------------------------
// Fixture: fire intersection on the first observer
// ---------------------------------------------------------------------------

function fireIntersect() {
  const io = observers[observers.length - 1]
  if (!io || io.observed.length === 0) return
  io.callback([{ isIntersecting: true, target: io.observed[0] }])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSectionReveal', () => {
  beforeEach(() => {
    observers = []
    // @ts-expect-error — override global
    globalThis.IntersectionObserver = MockIntersectionObserver
    installAnimateSpy()
    stubMatchMedia(false)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  describe('when enabled', () => {
    it('sets initial hidden state on data-reveal targets', async () => {
      const wrapper = mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()

      const title = wrapper.element.querySelector('[data-reveal="title"]') as HTMLElement
      expect(title.style.opacity).toBe('0')
      expect(title.style.transform).toContain('translateY(24px)')
    })

    it('creates an IntersectionObserver observing the section', async () => {
      const wrapper = mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()

      expect(observers.length).toBe(1)
      expect(observers[0].observed[0]).toBe(wrapper.element)
    })

    it('animates targets when the section intersects the viewport', async () => {
      mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()

      expect(animateSpy).not.toHaveBeenCalled()
      fireIntersect()

      // 3 targets × 1 call each = 3 animate() calls
      expect(animateSpy).toHaveBeenCalledTimes(3)
    })

    it('skips when no data-reveal targets are present', async () => {
      const Comp = defineComponent({
        setup() {
          const sectionEl = ref<HTMLElement | null>(null)
          useSectionReveal(sectionEl, { preset: 'editorial-reveal' })
          return { sectionEl }
        },
        render() {
          return h('section', { ref: 'sectionEl' }, [h('p', 'no-reveal-targets')])
        },
      })

      mount(Comp, { attachTo: document.body })
      await nextTick()

      // No observer is created when there are no targets to animate
      expect(observers.length).toBe(0)
    })

    it('uses a short fade animation when prefers-reduced-motion is set', async () => {
      stubMatchMedia(true)
      mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()
      fireIntersect()

      expect(animateSpy).toHaveBeenCalled()
      const [, options] = animateSpy.mock.calls[0]
      // Reduced-motion path uses a 200ms ease-out fade
      expect((options as any).duration).toBe(200)
      expect((options as any).easing).toBe('ease-out')
    })
  })

  // -----------------------------------------------------------------------
  // Opt-out paths
  // -----------------------------------------------------------------------

  describe('when preset is "none"', () => {
    it('does not create an IntersectionObserver or animate', async () => {
      mountSectionReveal({ preset: 'none' })
      await nextTick()

      expect(observers.length).toBe(0)
      expect(animateSpy).not.toHaveBeenCalled()
    })
  })

  describe('when disabled (SPL-076 guard)', () => {
    it('skips when disabled=true (literal boolean)', async () => {
      const wrapper = mountSectionReveal({ preset: 'editorial-reveal', disabled: true })
      await nextTick()

      expect(observers.length).toBe(0)
      const title = wrapper.element.querySelector('[data-reveal="title"]') as HTMLElement
      // No initial hidden state applied
      expect(title.style.opacity).toBe('')
      expect(title.style.transform).toBe('')
    })

    it('skips when disabled is a Ref<boolean> resolving to true', async () => {
      const disabled: Ref<boolean> = ref(true)
      mountSectionReveal({ preset: 'editorial-reveal', disabled })
      await nextTick()

      expect(observers.length).toBe(0)
    })

    it('skips when disabled is a getter returning true (computed-like)', async () => {
      mountSectionReveal({ preset: 'editorial-reveal', disabled: () => true })
      await nextTick()

      expect(observers.length).toBe(0)
      expect(animateSpy).not.toHaveBeenCalled()
    })

    it('runs normally when disabled is false', async () => {
      mountSectionReveal({ preset: 'editorial-reveal', disabled: false })
      await nextTick()

      expect(observers.length).toBe(1)
    })

    it('runs normally when disabled is a Ref<false>', async () => {
      const disabled: Ref<boolean> = ref(false)
      mountSectionReveal({ preset: 'editorial-reveal', disabled })
      await nextTick()

      expect(observers.length).toBe(1)
    })

    it('runs normally when disabled is undefined', async () => {
      mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()

      expect(observers.length).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('cleanup', () => {
    it('disconnects the observer on unmount', async () => {
      const wrapper = mountSectionReveal({ preset: 'editorial-reveal' })
      await nextTick()
      const disconnect = observers[0].disconnect

      wrapper.unmount()
      expect(disconnect).toHaveBeenCalled()
    })
  })
})
