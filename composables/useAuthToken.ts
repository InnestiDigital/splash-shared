import { ref, computed } from 'vue'

/**
 * Reactive view of the visitor auth token in localStorage.
 *
 * The token is WRITTEN by `useApiClient`'s response-contract mapping
 * (`saveContractData`), which stores a configured response path under a
 * configured localStorage key — e.g. `[{ "auth.access_token": "authorization" }]`.
 * This composable does not own that write; it owns reactivity over it, plus
 * the logout path.
 *
 * Module-scoped ref so every consumer observes one state. Call `refresh()`
 * after any login that wrote the token: a same-document `localStorage.setItem`
 * fires no `storage` event, so nothing else would notice.
 *
 * NOT a security boundary. Presence of a token flips block-level `visibleTo`
 * and the `_auth`/`_guest` setting overrides — both client-side
 * personalization. Page gating is `pages.requireAuth`, enforced server-side
 * against the real token.
 */
const token = ref<string | null>(null)
let initialisedKey: string | null = null
let listenerBound = false

/**
 * Editor-preview override of the resolved auth state. `null` means "no
 * override — use the real token".
 *
 * Exists because the editor iframe has no visitor token, so an author setting
 * a block to "Signed-in visitors" would watch it vanish with no way to bring
 * it back. Set from the preview page in response to an AUTH_STATE_OVERRIDE
 * message; never set on the public site.
 */
const authOverride = ref<boolean | null>(null)

/** Preview-only. Pass null to clear and fall back to the real token. */
export function setAuthStateOverride(value: boolean | null): void {
  authOverride.value = value
}

function read(storageKey: string): string | null {
  if (typeof localStorage === 'undefined') return null
  // `|| null` folds the empty string into null — an empty token is no token.
  return localStorage.getItem(storageKey) || null
}

/**
 * Reads `initialisedKey` at call time rather than closing over the key that
 * happened to be current when the listener was bound: the listener is bound
 * once for the module's lifetime, but the key can change if a later caller
 * passes a different one.
 */
function onStorage(e: StorageEvent): void {
  if (initialisedKey === null) return
  // A null key means the whole store was cleared, which must also be honoured.
  if (e.key === null || e.key === initialisedKey) token.value = read(initialisedKey)
}

/** Test-only reset of module state, including the listener and any override. */
export function _resetAuthToken(): void {
  token.value = null
  initialisedKey = null
  authOverride.value = null
  if (listenerBound && typeof window !== 'undefined') {
    window.removeEventListener('storage', onStorage)
  }
  listenerBound = false
}

export function useAuthToken(storageKey: string = 'authorization') {
  if (initialisedKey !== storageKey) {
    token.value = read(storageKey)
    initialisedKey = storageKey
  }

  if (!listenerBound && typeof window !== 'undefined') {
    listenerBound = true
    // Cross-document changes only — a same-document setItem fires no event.
    window.addEventListener('storage', onStorage)
  }

  function refresh(): void {
    token.value = read(storageKey)
  }

  function clearToken(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey)
    token.value = null
  }

  return {
    token,
    // The preview override wins when set, so an author can inspect either
    // audience without holding a real token.
    isAuthenticated: computed(() => authOverride.value ?? token.value !== null),
    refresh,
    clearToken,
  }
}
