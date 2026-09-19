/**
 * @vitest-environment happy-dom
 */
// @ts-nocheck

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { ANIMATION_TARGETS_CHANGED } from '~/shared/features/cms/animation/constants'
import { createMockEngine, mountAnimatedBlock, flushMicrotasks } from './helpers'

// ---------------------------------------------------------------------------
// Dynamic child that dispatches targets-changed from a nested element
// ---------------------------------------------------------------------------

const DynamicChildBlock = defineComponent({
  name: 'DynamicChildBlock',
  props: { blockId: { type: String, default: 'block-1' } },
  setup(props) {
    return () =>
      h('section', { class: 'accordion' }, [
        h('h1', { 'data-target': 'heading' }, 'Title'),
        h('button', {
          class: 'nested-trigger',
          onClick: (e: MouseEvent) => {
            ;(e.target as HTMLElement).dispatchEvent(
              new CustomEvent(ANIMATION_TARGETS_CHANGED, {
                bubbles: true,
                detail: { blockId: props.blockId },
              }),
            )
          },
        }, 'Toggle'),
      ])
  },
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('animation-targets-changed signal', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  describe('AnimatedBlock re-queries targets on event', () => {
    it('re-queries targets and calls refreshTargets when event fires', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()
      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)

      const wrapperEl = wrapper.element as HTMLElement
      wrapperEl.dispatchEvent(new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } }))

      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(2)
      expect(engine.refreshTargets).toHaveBeenCalledWith('block-1')
    })

    it('re-queries targets when event has no blockId in detail', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()

      ;(wrapper.element as HTMLElement).dispatchEvent(
        new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: {} }),
      )
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(2)
      expect(engine.refreshTargets).toHaveBeenCalledWith('block-1')
    })

    it('ignores event with a different blockId', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()
      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)

      ;(wrapper.element as HTMLElement).dispatchEvent(
        new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-OTHER' } }),
      )
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      expect(engine.refreshTargets).not.toHaveBeenCalled()
    })
  })

  describe('engine refreshTargets updates stored DOM references', () => {
    it('registerBlockTargets is called with fresh parts on refresh', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()

      ;(wrapper.element as HTMLElement).dispatchEvent(
        new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } }),
      )
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      const secondCallParts = (engine.registerBlockTargets as ReturnType<typeof vi.fn>).mock.calls[1][1]
      expect(secondCallParts.root).toBeTruthy()
      expect(secondCallParts.root.tagName).toBe('SECTION')
      expect(secondCallParts.heading.tagName).toBe('H1')
    })
  })

  describe('rebindAffectedScenes re-setups scenes after target refresh', () => {
    it('refreshTargets is called which triggers rebindAffectedScenes in real engine', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()

      ;(wrapper.element as HTMLElement).dispatchEvent(
        new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } }),
      )
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.refreshTargets).toHaveBeenCalledTimes(1)
      expect(engine.refreshTargets).toHaveBeenCalledWith('block-1')
    })
  })

  describe('debounce', () => {
    it('rapid events only trigger one re-query', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()
      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)

      const wrapperEl = wrapper.element as HTMLElement
      const event = () => new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } })

      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(20)
      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(20)
      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(20)
      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(20)
      wrapperEl.dispatchEvent(event())

      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(2)
      expect(engine.refreshTargets).toHaveBeenCalledTimes(1)
    })

    it('events spaced beyond debounce window each trigger a re-query', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-1' })
      await flushMicrotasks()

      const wrapperEl = wrapper.element as HTMLElement
      const event = () => new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } })

      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      wrapperEl.dispatchEvent(event())
      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(3)
      expect(engine.refreshTargets).toHaveBeenCalledTimes(2)
    })
  })

  describe('event bubbling from nested children', () => {
    it('event dispatched from a nested child bubbles up to AnimatedBlock root', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({
        engine,
        blockId: 'block-1',
        child: DynamicChildBlock,
        targetsSchema: { root: {}, heading: { selector: "[data-target='heading']" } },
      })
      await flushMicrotasks()
      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)

      const button = wrapper.find('button.nested-trigger')
      await button.trigger('click')

      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(2)
      expect(engine.refreshTargets).toHaveBeenCalledWith('block-1')
    })
  })

  describe('blocks without dynamic children', () => {
    it('no listener regression: blocks work normally without targets-changed events', async () => {
      const engine = createMockEngine()
      const { wrapper } = mountAnimatedBlock({ engine, blockId: 'block-static' })
      await flushMicrotasks()

      expect(engine.registerBlockTargets).toHaveBeenCalledTimes(1)
      expect(engine.refreshTargets).not.toHaveBeenCalled()

      wrapper.unmount()
      expect(engine.unregisterTargets).toHaveBeenCalledWith('block-static')
    })

    it('no engine: targets-changed event does not cause errors', async () => {
      const { wrapper } = mountAnimatedBlock({ engine: null })
      await flushMicrotasks()

      const wrapperEl = wrapper.element as HTMLElement
      expect(() => {
        wrapperEl.dispatchEvent(new CustomEvent(ANIMATION_TARGETS_CHANGED, { bubbles: true, detail: { blockId: 'block-1' } }))
      }).not.toThrow()

      vi.advanceTimersByTime(100)
      await flushMicrotasks()

      expect(wrapper.find('h1').text()).toBe('Title')
    })
  })
})

describe('ANIMATION_TARGETS_CHANGED constant', () => {
  it('equals "animation-targets-changed"', () => {
    expect(ANIMATION_TARGETS_CHANGED).toBe('animation-targets-changed')
  })
})
