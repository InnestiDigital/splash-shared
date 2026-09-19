import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'

// --- Mocks (stubGlobal pattern — must be before import) ---

const stateStore = new Map<string, Ref>()
vi.stubGlobal('useState', (key: string, init?: () => any) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(init ? init() : undefined))
  }
  return stateStore.get(key)!
})

const mockRouteQuery: Record<string, string> = {}
let useRouteShouldThrow = false
vi.stubGlobal('useRoute', () => {
  if (useRouteShouldThrow) throw new Error('useRoute not available')
  return { path: '/', query: mockRouteQuery }
})

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useEnvConfig } from '~/shared/composables/useEnvConfig'

// --- Setup ---

beforeEach(() => {
  stateStore.clear()
  mockFetch.mockReset()
  Object.keys(mockRouteQuery).forEach(k => delete mockRouteQuery[k])
  useRouteShouldThrow = false
  vi.restoreAllMocks()
})

// --- Tests ---

describe('useEnvConfig', () => {
  describe('getEnvVar', () => {
    it('returns the value for an existing key', () => {
      const { getEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { apiUrl: 'https://api.example.com' }

      expect(getEnvVar('apiUrl')).toBe('https://api.example.com')
    })

    it('returns default value when key is missing', () => {
      const { getEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      expect(getEnvVar('missing', 'fallback')).toBe('fallback')
    })

    it('returns empty string when key is missing and no default provided', () => {
      const { getEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getEnvVar('missing')).toBe('')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing'))
    })

    it('returns empty string value without warning', () => {
      const { getEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { emptyKey: '' }

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getEnvVar('emptyKey')).toBe('')
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  describe('getEnvVarAsNumber', () => {
    it('converts string value to number', () => {
      const { getEnvVarAsNumber } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { port: '8080', rate: '3.14' }

      expect(getEnvVarAsNumber('port')).toBe(8080)
      expect(getEnvVarAsNumber('rate')).toBe(3.14)
    })

    it('returns default for non-numeric values', () => {
      const { getEnvVarAsNumber } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { bad: 'abc' }

      expect(getEnvVarAsNumber('bad', 42)).toBe(42)
    })

    it('returns default for missing keys', () => {
      const { getEnvVarAsNumber } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getEnvVarAsNumber('missing', 99)).toBe(99)
    })

    it('returns 0 as default when no default specified', () => {
      const { getEnvVarAsNumber } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getEnvVarAsNumber('missing')).toBe(0)
    })
  })

  describe('getEnvVarAsBoolean', () => {
    it('converts "true" to true', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { flag: 'true' }

      expect(getEnvVarAsBoolean('flag')).toBe(true)
    })

    it('converts "TRUE" (case-insensitive) to true', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { flag: 'TRUE' }

      expect(getEnvVarAsBoolean('flag')).toBe(true)
    })

    it('converts "1" to true', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { flag: '1' }

      expect(getEnvVarAsBoolean('flag')).toBe(true)
    })

    it('converts "false" to false', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { flag: 'false' }

      expect(getEnvVarAsBoolean('flag')).toBe(false)
    })

    it('converts "0" to false', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { flag: '0' }

      expect(getEnvVarAsBoolean('flag')).toBe(false)
    })

    it('returns default for missing keys', () => {
      const { getEnvVarAsBoolean } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getEnvVarAsBoolean('missing', true)).toBe(true)
      expect(getEnvVarAsBoolean('missing')).toBe(false)
    })
  })

  describe('getAllEnvVars', () => {
    it('returns a copy of all env vars', () => {
      const { getAllEnvVars } = useEnvConfig()
      const original = { key1: 'val1', key2: 'val2' }
      stateStore.get('cms:envConfig')!.value = original

      const result = getAllEnvVars()
      expect(result).toEqual({ key1: 'val1', key2: 'val2' })
      expect(result).not.toBe(original)
    })

    it('returns empty object when no vars loaded', () => {
      const { getAllEnvVars } = useEnvConfig()
      expect(getAllEnvVars()).toEqual({})
    })
  })

  describe('hasEnvVar', () => {
    it('returns true for existing keys', () => {
      const { hasEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { exists: 'yes' }

      expect(hasEnvVar('exists')).toBe(true)
    })

    it('returns false for missing keys', () => {
      const { hasEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = {}

      expect(hasEnvVar('missing')).toBe(false)
    })

    it('returns true for keys with empty string values', () => {
      const { hasEnvVar } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { emptyVal: '' }

      expect(hasEnvVar('emptyVal')).toBe(true)
    })
  })

  describe('loadEnvConfig', () => {
    it('fetches config from API and caches it', async () => {
      const mockConfig = { apiUrl: 'https://api.test', debug: 'true' }
      mockFetch.mockResolvedValueOnce(mockConfig)
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const { loadEnvConfig, envConfig, isEnvConfigLoaded } = useEnvConfig()
      expect(isEnvConfigLoaded.value).toBe(false)

      const result = await loadEnvConfig()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/env-config')
      expect(result).toEqual(mockConfig)
      expect(envConfig.value).toEqual(mockConfig)
      expect(isEnvConfigLoaded.value).toBe(true)
    })

    it('returns cached config on subsequent calls', async () => {
      const mockConfig = { cached: 'yes' }
      mockFetch.mockResolvedValueOnce(mockConfig)
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const { loadEnvConfig } = useEnvConfig()
      await loadEnvConfig()

      const result = await loadEnvConfig()
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockConfig)
    })

    it('forwards ?site= query param from route', async () => {
      mockRouteQuery.site = 'site-123'
      mockFetch.mockResolvedValueOnce({})
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const { loadEnvConfig } = useEnvConfig()
      await loadEnvConfig()

      expect(mockFetch).toHaveBeenCalledWith('/api/env-config?site=site-123')
    })

    it('falls back to empty config on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const { loadEnvConfig, envConfig, isEnvConfigLoaded } = useEnvConfig()
      const result = await loadEnvConfig()

      expect(result).toEqual({})
      expect(envConfig.value).toEqual({})
      expect(isEnvConfigLoaded.value).toBe(true)
    })

    it('falls back to empty config when useRoute throws and window is unavailable', async () => {
      useRouteShouldThrow = true
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const { loadEnvConfig, envConfig, isEnvConfigLoaded } = useEnvConfig()
      const result = await loadEnvConfig()

      // In Node env, window.location throws → catch → fallback to empty config
      expect(result).toEqual({})
      expect(isEnvConfigLoaded.value).toBe(true)
    })
  })

  describe('reloadEnvConfig', () => {
    it('forces a fresh fetch with cache-busting param', async () => {
      const { reloadEnvConfig, envConfig } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { old: 'data' }
      stateStore.get('cms:envConfigLoaded')!.value = true

      const newConfig = { refreshed: 'yes' }
      mockFetch.mockResolvedValueOnce(newConfig)
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const result = await reloadEnvConfig()

      expect(mockFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/env-config\?t=\d+$/))
      expect(result).toEqual(newConfig)
      expect(envConfig.value).toEqual(newConfig)
    })

    it('falls back to empty config on reload error', async () => {
      const { reloadEnvConfig, envConfig, isEnvConfigLoaded } = useEnvConfig()
      stateStore.get('cms:envConfig')!.value = { old: 'data' }
      stateStore.get('cms:envConfigLoaded')!.value = true

      mockFetch.mockRejectedValueOnce(new Error('Reload failed'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await reloadEnvConfig()

      expect(result).toEqual({})
      expect(envConfig.value).toEqual({})
      expect(isEnvConfigLoaded.value).toBe(true)
    })
  })

  describe('readonly state', () => {
    it('exposes envConfig as readonly', () => {
      const { envConfig } = useEnvConfig()
      expect((envConfig as any).__v_isReadonly).toBe(true)
    })

    it('exposes isEnvConfigLoaded as readonly', () => {
      const { isEnvConfigLoaded } = useEnvConfig()
      expect((isEnvConfigLoaded as any).__v_isReadonly).toBe(true)
    })
  })
})
