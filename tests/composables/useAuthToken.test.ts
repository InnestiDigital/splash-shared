/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthToken, setAuthStateOverride, _resetAuthToken } from '~/shared/composables/useAuthToken'

describe('useAuthToken', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetAuthToken()
  })

  it('is unauthenticated when no token is stored', () => {
    const { isAuthenticated } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(false)
  })

  it('is authenticated when a token is present at init', () => {
    localStorage.setItem('authorization', 'abc123')
    const { isAuthenticated } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(true)
  })

  it('treats an empty-string token as unauthenticated', () => {
    localStorage.setItem('authorization', '')
    const { isAuthenticated } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(false)
  })

  it('reacts to refresh() after an external write', () => {
    const { isAuthenticated, refresh } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(false)
    localStorage.setItem('authorization', 'abc123')
    refresh()
    expect(isAuthenticated.value).toBe(true)
  })

  it('clearToken removes the key and flips state', () => {
    localStorage.setItem('authorization', 'abc123')
    const { isAuthenticated, clearToken } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(true)
    clearToken()
    expect(localStorage.getItem('authorization')).toBeNull()
    expect(isAuthenticated.value).toBe(false)
  })

  it('honours a custom storage key', () => {
    localStorage.setItem('my-token', 'abc123')
    const { isAuthenticated } = useAuthToken('my-token')
    expect(isAuthenticated.value).toBe(true)
  })

  it('shares one reactive state across calls', () => {
    const a = useAuthToken('authorization')
    const b = useAuthToken('authorization')
    localStorage.setItem('authorization', 'abc123')
    a.refresh()
    expect(b.isAuthenticated.value).toBe(true)
  })

  it('reacts to a cross-tab storage event for the watched key', () => {
    const { isAuthenticated } = useAuthToken('authorization')
    localStorage.setItem('authorization', 'abc123')
    window.dispatchEvent(new StorageEvent('storage', { key: 'authorization' }))
    expect(isAuthenticated.value).toBe(true)
  })

  it('ignores a storage event for an unrelated key', () => {
    const { isAuthenticated } = useAuthToken('authorization')
    localStorage.setItem('authorization', 'abc123')
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(isAuthenticated.value).toBe(false)
  })

  it('re-reads when a storage event carries a null key (storage cleared)', () => {
    localStorage.setItem('authorization', 'abc123')
    const { isAuthenticated } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(true)
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(isAuthenticated.value).toBe(false)
  })

  it('exposes the raw token value', () => {
    localStorage.setItem('authorization', 'abc123')
    const { token } = useAuthToken('authorization')
    expect(token.value).toBe('abc123')
  })

  it('does not re-read on a repeat call with the same key', () => {
    const { isAuthenticated } = useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(false)
    // Written behind the composable's back. Re-init must NOT pick it up —
    // only an explicit refresh() or a storage event may change state.
    localStorage.setItem('authorization', 'abc123')
    useAuthToken('authorization')
    expect(isAuthenticated.value).toBe(false)
  })

  it('re-reads when the storage key changes', () => {
    localStorage.setItem('other-token', 'xyz')
    const first = useAuthToken('authorization')
    expect(first.isAuthenticated.value).toBe(false)
    const second = useAuthToken('other-token')
    expect(second.isAuthenticated.value).toBe(true)
  })

  it('the storage listener follows a changed key rather than the first one seen', () => {
    // Regression: the listener used to close over whichever key was current
    // when it was bound, so a later caller with a different key was ignored
    // forever.
    useAuthToken('authorization')
    const { isAuthenticated } = useAuthToken('other-token')
    localStorage.setItem('other-token', 'xyz')
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-token' }))
    expect(isAuthenticated.value).toBe(true)
  })

  it('binds the storage listener only once across many calls', () => {
    const spy = vi.spyOn(window, 'addEventListener')
    useAuthToken('authorization')
    useAuthToken('authorization')
    useAuthToken('authorization')
    const storageBindings = spy.mock.calls.filter(([evt]) => evt === 'storage')
    expect(storageBindings).toHaveLength(1)
    spy.mockRestore()
  })

  it('reports unauthenticated when localStorage is unavailable (SSR)', () => {
    const original = globalThis.localStorage
    // @ts-expect-error — deliberately removing the global to exercise the guard
    delete globalThis.localStorage
    try {
      const { isAuthenticated } = useAuthToken('authorization')
      expect(isAuthenticated.value).toBe(false)
    }
    finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true })
    }
  })

  describe('preview auth-state override', () => {
    it('reports authenticated with no token when overridden true', () => {
      const { isAuthenticated } = useAuthToken('authorization')
      expect(isAuthenticated.value).toBe(false)
      setAuthStateOverride(true)
      expect(isAuthenticated.value).toBe(true)
    })

    it('reports unauthenticated with a real token when overridden false', () => {
      localStorage.setItem('authorization', 'abc123')
      const { isAuthenticated } = useAuthToken('authorization')
      expect(isAuthenticated.value).toBe(true)
      setAuthStateOverride(false)
      expect(isAuthenticated.value).toBe(false)
    })

    it('falls back to the real token when cleared with null', () => {
      localStorage.setItem('authorization', 'abc123')
      const { isAuthenticated } = useAuthToken('authorization')
      setAuthStateOverride(false)
      expect(isAuthenticated.value).toBe(false)
      setAuthStateOverride(null)
      expect(isAuthenticated.value).toBe(true)
    })

    it('the override outlives a refresh()', () => {
      const { isAuthenticated, refresh } = useAuthToken('authorization')
      setAuthStateOverride(true)
      localStorage.removeItem('authorization')
      refresh()
      expect(isAuthenticated.value).toBe(true)
    })

    it('is cleared by _resetAuthToken so it cannot leak across tests', () => {
      const { isAuthenticated } = useAuthToken('authorization')
      setAuthStateOverride(true)
      expect(isAuthenticated.value).toBe(true)
      _resetAuthToken()
      expect(useAuthToken('authorization').isAuthenticated.value).toBe(false)
    })
  })

  it('clearToken is a no-op when localStorage is unavailable (SSR)', () => {
    const original = globalThis.localStorage
    // @ts-expect-error — deliberately removing the global to exercise the guard
    delete globalThis.localStorage
    try {
      const { clearToken, isAuthenticated } = useAuthToken('authorization')
      expect(() => clearToken()).not.toThrow()
      expect(isAuthenticated.value).toBe(false)
    }
    finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true })
    }
  })
})
