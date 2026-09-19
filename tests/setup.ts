import { vi } from 'vitest'

// Mock localStorage for composables that use import.meta.client guards
if (typeof globalThis.localStorage === 'undefined') {
  const storage: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { for (const k of Object.keys(storage)) delete storage[k] },
  })
}

// Mock Nuxt's useRuntimeConfig auto-import for code that depends on it
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    defaultTheme: 'standalone',
    baseApiUrl: '',
  },
}))
