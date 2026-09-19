// Stubs for Nuxt virtual modules (#app, #imports) used in component tests.
// These provide no-op defaults — tests should vi.mock() the specific functions they need.

export const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {} })
export const useRoute = () => ({ path: '/', params: {}, query: {}, meta: {} })
export const useHead = () => {}
export const useRuntimeConfig = () => ({ public: {} })
export const navigateTo = () => {}
export const defineNuxtRouteMiddleware = (fn: any) => fn
export const useNuxtApp = () => ({ $fetch: () => {} })
