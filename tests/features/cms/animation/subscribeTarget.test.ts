/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { useAnimationEngine } from '~/shared/features/cms/animation/useAnimationEngine'

describe('engine.subscribeTarget', () => {
  it('fires handler with null before target is registered', () => {
    const engine = useAnimationEngine()
    const handler = vi.fn()
    engine.subscribeTarget('block-1', 'root', handler)
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('fires handler with element when target registered', () => {
    const engine = useAnimationEngine()
    const el = document.createElement('div')
    const handler = vi.fn()

    engine.subscribeTarget('block-1', 'root', handler)
    handler.mockClear()
    engine.registerBlockTargets('block-1', { root: el })

    expect(handler).toHaveBeenCalledWith(el)
  })

  it('fires handler with null when target unregistered', () => {
    const engine = useAnimationEngine()
    const el = document.createElement('div')
    const handler = vi.fn()
    engine.registerBlockTargets('block-1', { root: el })
    engine.subscribeTarget('block-1', 'root', handler)
    handler.mockClear()

    engine.unregisterTargets('block-1')
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('fires handler with new element when re-registered with a different element (re-render)', () => {
    const engine = useAnimationEngine()
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const handler = vi.fn()

    engine.registerBlockTargets('block-1', { root: el1 })
    engine.subscribeTarget('block-1', 'root', handler)
    handler.mockClear()
    engine.registerBlockTargets('block-1', { root: el2 })

    expect(handler).toHaveBeenLastCalledWith(el2)
  })

  it('does NOT fire handler when re-registered with SAME element (idempotent re-resolution)', () => {
    const engine = useAnimationEngine()
    const el = document.createElement('div')
    const handler = vi.fn()

    engine.registerBlockTargets('block-1', { root: el })
    engine.subscribeTarget('block-1', 'root', handler)
    handler.mockClear()
    // Simulate reQueryTargets() firing for dynamic content with the same element
    engine.registerBlockTargets('block-1', { root: el })

    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribe returned function stops further notifications', () => {
    const engine = useAnimationEngine()
    const handler = vi.fn()
    const unsubscribe = engine.subscribeTarget('block-1', 'root', handler)
    handler.mockClear()
    unsubscribe()

    engine.registerBlockTargets('block-1', { root: document.createElement('div') })
    expect(handler).not.toHaveBeenCalled()
  })
})
