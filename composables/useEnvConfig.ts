import { readonly } from 'vue'
import type { EnvConfig } from '~/shared/types/envConfig'

/**
 * Loads environment configuration from /api/env-config.
 * Uses useState() for SSR-safe per-request state.
 * Caches the result after first load.
 */
async function loadEnvConfig(): Promise<EnvConfig> {
  const envConfig = useState<EnvConfig>('cms:envConfig', () => ({}))
  const isEnvConfigLoaded = useState<boolean>('cms:envConfigLoaded', () => false)

  // Return cached config if already loaded
  if (isEnvConfigLoaded.value && envConfig.value) {
    return envConfig.value
  }

  try {
    // Forward ?site= from the page URL so admin preview iframes resolve the correct site
    let url = '/api/env-config'
    try {
      const route = useRoute()
      const routeSiteId = route.query.site as string | undefined
      if (routeSiteId) url = `/api/env-config?site=${encodeURIComponent(routeSiteId)}`
    } catch {
      if (import.meta.client) {
        const pageSiteId = new URL(window.location.href).searchParams.get('site')
        if (pageSiteId) url = `/api/env-config?site=${encodeURIComponent(pageSiteId)}`
      }
    }
    const config = await $fetch<EnvConfig>(url)
    envConfig.value = config
    isEnvConfigLoaded.value = true
    console.info('[EnvConfig] Environment config loaded from API')
    return config
  } catch (e) {
    console.warn('[EnvConfig] Failed to load env config:', e)
  }

  // Fallback to empty config
  envConfig.value = {}
  isEnvConfigLoaded.value = true
  console.info('[EnvConfig] Using empty fallback configuration')
  return envConfig.value
}

/**
 * Forces a reload of environment configuration.
 * Useful for refreshing config after CMS updates.
 */
async function reloadEnvConfig(): Promise<EnvConfig> {
  const envConfig = useState<EnvConfig>('cms:envConfig', () => ({}))
  const isEnvConfigLoaded = useState<boolean>('cms:envConfigLoaded', () => false)

  isEnvConfigLoaded.value = false

  try {
    // Cache busting with timestamp
    const config = await $fetch<EnvConfig>(`/api/env-config?t=${Date.now()}`)
    envConfig.value = config
    isEnvConfigLoaded.value = true
    console.info('[EnvConfig] Environment config reloaded')
    return config
  } catch (e) {
    console.error('[EnvConfig] Failed to reload env config:', e)
  }

  // Fallback to empty config
  envConfig.value = {}
  isEnvConfigLoaded.value = true
  return envConfig.value
}

/**
 * Helper functions to convert string values to specific types
 */
function toNumber(value: string | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue
  const num = Number(value)
  return isNaN(num) ? defaultValue : num
}

function toBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

export function useEnvConfig() {
  // SSR-safe state via useState (per-request on server, hydrated on client)
  const envConfig = useState<EnvConfig>('cms:envConfig', () => ({}))
  const isEnvConfigLoaded = useState<boolean>('cms:envConfigLoaded', () => false)

  /**
   * Gets an environment variable as string
   * @param key The variable key (e.g., 'currencyId', 'programSlug')
   * @param defaultValue Fallback value if variable is not found
   * @returns The environment variable value as string
   */
  function getEnvVar(key: string, defaultValue: string = ''): string {
    if (!envConfig.value || !(key in envConfig.value)) {
      if (defaultValue) {
        return defaultValue
      }
      console.warn(`[EnvConfig] Environment variable not found: ${key}`)
      return ''
    }

    return envConfig.value[key]
  }

  /**
   * Gets an environment variable as number
   * @param key The variable key
   * @param defaultValue Fallback value if variable is not found or invalid
   * @returns The environment variable value as number
   */
  function getEnvVarAsNumber(key: string, defaultValue: number = 0): number {
    const value = getEnvVar(key)
    return toNumber(value, defaultValue)
  }

  /**
   * Gets an environment variable as boolean
   * @param key The variable key
   * @param defaultValue Fallback value if variable is not found
   * @returns The environment variable value as boolean
   */
  function getEnvVarAsBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = getEnvVar(key)
    return toBoolean(value, defaultValue)
  }

  /**
   * Gets all environment variables
   * @returns Object with all environment variables as strings
   */
  function getAllEnvVars(): Record<string, string> {
    return { ...envConfig.value }
  }

  /**
   * Checks if an environment variable exists
   */
  function hasEnvVar(key: string): boolean {
    return !!(envConfig.value && key in envConfig.value)
  }

  return {
    // State (readonly to prevent external mutations)
    envConfig: readonly(envConfig),
    isEnvConfigLoaded: readonly(isEnvConfigLoaded),

    // Async loaders
    loadEnvConfig,
    reloadEnvConfig,

    // Getters
    getEnvVar,
    getEnvVarAsNumber,
    getEnvVarAsBoolean,
    getAllEnvVars,
    hasEnvVar,
  }
}
