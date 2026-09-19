import { provide, inject, ref, type Ref } from 'vue'

const AUTH_STATE_KEY = Symbol('authState')

/**
 * Called by theme layouts that handle authentication to declare the current auth state.
 * DynamicPage and the preview renderer inject this to apply _auth/_guest settings overrides.
 */
export function provideAuthState(isAuthenticated: Ref<boolean>) {
  provide(AUTH_STATE_KEY, isAuthenticated)
}

/**
 * Returns the current authentication state as a reactive ref.
 * Defaults to false (guest) when no layout has provided auth state.
 */
export function useAuthState(): Ref<boolean> {
  return inject(AUTH_STATE_KEY, ref(false))
}
