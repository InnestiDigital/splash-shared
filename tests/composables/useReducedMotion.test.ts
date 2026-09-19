// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { Ref } from 'vue'
import { useReducedMotion, resolveReducedMotion } from '~/shared/composables/useReducedMotion'
import type { ReducedMotionMode } from '~/shared/types/animation'

// --- matchMedia mock helpers ---

type ChangeListener = (e: { matches: boolean }) => void

function createMatchMediaMock(initialMatches: boolean) {
  const listeners: ChangeListener[] = []
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((event: string, cb: ChangeListener) => {
      if (event === 'change') listeners.push(cb)
    }),
    removeEventListener: vi.fn((event: string, cb: ChangeListener) => {
      if (event === 'change') {
        const idx = listeners.indexOf(cb)
        if (idx >= 0) listeners.splice(idx, 1)
      }
    }),
    dispatchEvent: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }

  function fireChange(matches: boolean) {
    mql.matches = matches
    listeners.forEach((cb) => cb({ matches }))
  }

  return { mql, fireChange }
}

// --- resolveReducedMotion (pure function) ---

describe('resolveReducedMotion', () => {
  it('returns entry-level override when present', () => {
    const result = resolveReducedMotion(
      { reducedMotion: 'skip' },
      { defaults: { reducedMotion: 'instant' } },
      'fade-only',
    )
    expect(result).toBe('skip')
  })

  it('falls through to scene defaults when entry has no override', () => {
    const result = resolveReducedMotion(
      { reducedMotion: undefined },
      { defaults: { reducedMotion: 'instant' } },
      'fade-only',
    )
    expect(result).toBe('instant')
  })

  it('falls through to theme setting when entry and scene have no override', () => {
    const result = resolveReducedMotion(
      { reducedMotion: undefined },
      { defaults: {} },
      'skip',
    )
    expect(result).toBe('skip')
  })

  it('falls through to system default fade-only when all levels are undefined', () => {
    const result = resolveReducedMotion(
      { reducedMotion: undefined },
      { defaults: undefined },
      undefined,
    )
    expect(result).toBe('fade-only')
  })

  it('handles scene with no defaults object', () => {
    const result = resolveReducedMotion(
      { reducedMotion: undefined },
      {},
      undefined,
    )
    expect(result).toBe('fade-only')
  })

  it('handles scene defaults with no reducedMotion key', () => {
    const result = resolveReducedMotion(
      { reducedMotion: undefined },
      { defaults: { duration: 500 } },
      'instant',
    )
    expect(result).toBe('instant')
  })

  it('entry-level skip overrides everything', () => {
    const result = resolveReducedMotion(
      { reducedMotion: 'skip' },
      { defaults: { reducedMotion: 'fade-only' } },
      'instant',
    )
    expect(result).toBe('skip')
  })

  it('entry-level instant overrides scene and theme', () => {
    const result = resolveReducedMotion(
      { reducedMotion: 'instant' },
      { defaults: { reducedMotion: 'skip' } },
      'fade-only',
    )
    expect(result).toBe('instant')
  })

  it.each<[ReducedMotionMode]>([['skip'], ['fade-only'], ['instant']])(
    'returns %s as system default when passed as theme setting with empty entry and scene',
    (mode) => {
      const result = resolveReducedMotion({}, {}, mode)
      expect(result).toBe(mode)
    },
  )
})

// --- useReducedMotion (reactive composable) ---

describe('useReducedMotion', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  function mountComposable(initialMatches: boolean) {
    const { mql, fireChange } = createMatchMediaMock(initialMatches)
    window.matchMedia = vi.fn().mockReturnValue(mql)

    let result: { isReducedMotion: Ref<boolean> } | undefined

    const Comp = defineComponent({
      setup() {
        result = useReducedMotion()
        return () => h('div')
      },
    })

    const wrapper = mount(Comp)
    return { result: result!, mql, fireChange, wrapper }
  }

  it('detects prefers-reduced-motion: reduce', () => {
    const { result } = mountComposable(true)
    expect(result.isReducedMotion.value).toBe(true)
  })

  it('detects no preference for reduced motion', () => {
    const { result } = mountComposable(false)
    expect(result.isReducedMotion.value).toBe(false)
  })

  it('registers a change listener on matchMedia', () => {
    const { mql } = mountComposable(false)
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates reactively when OS setting changes', async () => {
    const { result, fireChange } = mountComposable(false)
    expect(result.isReducedMotion.value).toBe(false)

    fireChange(true)
    await nextTick()
    expect(result.isReducedMotion.value).toBe(true)

    fireChange(false)
    await nextTick()
    expect(result.isReducedMotion.value).toBe(false)
  })

  it('removes listener on unmount', () => {
    const { mql, wrapper } = mountComposable(false)
    wrapper.unmount()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
