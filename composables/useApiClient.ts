import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { useClientConfig } from '~/shared/composables/useClientConfig'

type ApiRequest = {
  method: string
  url: string
  parameters?: string[] // Dynamic params from form or localStorage
  extraParams?: Record<string, any> // Static params configured in CMS
  headers?: string[] | Record<string, string>
  response?: Array<{ [key: string]: string }> // Contract: e.g. [{ "auth.access_token": "authorization" }]
}

type ApiConfig = {
  headers?: Record<string, string>
  requests?: Record<string, ApiRequest>
}

type MethodCall = string | {
  type: 'sequence' | 'parallel'
  calls: MethodCall[]
}

// Singleton promise to prevent concurrent duplicate fetches
let _loadingPromise: Promise<ApiConfig> | null = null

// Session-scoped flag: prevents startup methods from running more than once per auth session
let _startupComplete = false

export function resetStartupComplete() {
  _startupComplete = false
}

// In-flight request deduplication: key = "HTTP_METHOD:resolved_url:stable_params"
const _inflightRequests = new Map<string, Promise<any>>()

function makeInflightKey(httpMethod: string, resolvedUrl: string, params: Record<string, any>): string {
  const sortedParams = Object.fromEntries(
    Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  )
  return `${httpMethod}:${resolvedUrl}:${JSON.stringify(sortedParams)}`
}

async function loadApiConfig(): Promise<ApiConfig> {
  const apiConfig = useState<ApiConfig | null>('cms:apiConfig', () => null)
  const isApiConfigLoaded = useState<boolean>('cms:apiConfigLoaded', () => false)

  if (apiConfig.value) {
    return apiConfig.value
  }

  // Return the in-flight promise if already loading (prevents parallel duplicate fetches)
  if (_loadingPromise) {
    return _loadingPromise
  }

  _loadingPromise = (async () => {
    // Forward ?site= from the page URL so preview iframes resolve the correct site
    const params = new URLSearchParams()
    try {
      const route = useRoute()
      const routeSiteId = route.query.site as string | undefined
      if (routeSiteId) params.set('site', routeSiteId)
    } catch {
      if (import.meta.client) {
        const pageSiteId = new URL(window.location.href).searchParams.get('site')
        if (pageSiteId) params.set('site', pageSiteId)
      }
    }
    const qs = params.toString()
    const apiConfigUrl = qs ? `/api/api-config?${qs}` : '/api/api-config'

    try {
      const config = await $fetch<ApiConfig>(apiConfigUrl)
      apiConfig.value = config
      isApiConfigLoaded.value = true
      console.info('[ApiClient] API config loaded from', apiConfigUrl)
      return config
    } catch (e) {
      console.warn('[ApiClient] Failed to load API config:', e)
    }

    // Empty fallback
    apiConfig.value = { headers: {}, requests: {} }
    isApiConfigLoaded.value = true
    return apiConfig.value as ApiConfig
  })().finally(() => {
    _loadingPromise = null
  })

  return _loadingPromise
}

// Extracts a value from an object using a nested path (e.g. "auth.access_token")
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

// Saves data to localStorage per the response contract mapping
function saveContractData(data: Record<string, any>, contract: ApiRequest['response']) {
  if (typeof window === 'undefined' || !contract) return

  // Contract defines the mapping: e.g. [{ "auth.access_token": "authorization" }]
  // means data.auth.access_token is stored as "authorization" in localStorage
  contract.forEach((mapping) => {
    Object.entries(mapping).forEach(([responseKey, localStorageKey]) => {
      const value = getNestedValue(data, responseKey)
      if (value !== undefined && value !== null) {
        localStorage.setItem(
          localStorageKey,
          typeof value === 'string' ? value : JSON.stringify(value)
        )
      }
    })
  })
}

export function useApiClient() {
  const apiConfig = useState<ApiConfig | null>('cms:apiConfig', () => null)
  const isApiConfigLoaded = useState<boolean>('cms:apiConfigLoaded', () => false)
  const { themeSettings } = useClientConfig()

  function getActiveApiConfig(): ApiConfig {
    try {
      const { childSites } = useClientConfig()
      const route = useRoute()
      const slug = Array.isArray(route.params.slug)
        ? route.params.slug.join('/')
        : (route.params.slug || '') as string

      for (const [mountPath, childSite] of Object.entries(childSites.value)) {
        if (slug === mountPath || slug.startsWith(mountPath + '/')) {
          return childSite.apiConfig as ApiConfig
        }
      }
    } catch {
      // Outside route context — fall back to parent config
    }
    return apiConfig.value || { headers: {}, requests: {} }
  }

  function createApiClient(): AxiosInstance {
    return axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  function findApiRequest(method: string): ApiRequest | null {
    const activeConfig = getActiveApiConfig()
    const apiRequests = activeConfig.requests || {}
    if (method in apiRequests) {
      return apiRequests[method] ?? null
    }

    return null
  }

  // Build params from form data, localStorage, and static extraParams.
  // Supports two parameter formats:
  //   - Legacy: string[] — keys matched exactly against formData (e.g., ['email', 'password'])
  //   - New:    Record<string, string> — { apiParamName: componentVarName }
  //             (e.g., { user_account: 'email', password: 'password' })
  function buildParams(methodId: string, formData: Record<string, any>): Record<string, any> {
    const request = findApiRequest(methodId)
    if (!request) return formData

    const params: Record<string, any> = {}

    // Add parameters from form or localStorage
    if (request.parameters) {
      if (Array.isArray(request.parameters)) {
        // Legacy format: string[] — explicit whitelist, matched against formData or localStorage
        for (const key of request.parameters) {
          if (key in formData && formData[key] !== undefined) {
            params[key] = formData[key]
          } else if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(key)
            if (stored !== null) {
              try { params[key] = JSON.parse(stored) } catch { params[key] = stored }
            }
          }
        }
      } else if (typeof request.parameters === 'object') {
        // Mapping format: Record<string, string> — { apiParam: componentVar }
        for (const [apiParam, componentVar] of Object.entries(request.parameters as Record<string, string>)) {
          if (componentVar in formData && formData[componentVar] !== undefined) {
            params[apiParam] = formData[componentVar]
          } else if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(componentVar)
            if (stored !== null) {
              try { params[apiParam] = JSON.parse(stored) } catch { params[apiParam] = stored }
            }
          }
        }
      }
    } else {
      // No parameters configured — pass all form data through directly.
      // Field IDs are defined in the CMS (FormField blocks), so no explicit whitelist is needed.
      Object.assign(params, formData)
    }

    // Add static extraParams, resolving {{varName}} placeholders from env config
    if (request.extraParams) {
      const envConfig = useState<Record<string, string>>('cms:envConfig', () => ({}))
      const resolved: Record<string, any> = {}
      for (const [key, value] of Object.entries(request.extraParams)) {
        if (typeof value === 'string') {
          resolved[key] = value.replace(/\{\{(\w+)\}\}/g, (_, k) => envConfig.value[k] ?? '')
        } else {
          resolved[key] = value
        }
      }
      Object.assign(params, resolved)
    }

    return params
  }

  /**
   * Substitute {param} placeholders in a URL template with values from params.
   * Matched keys are removed from params so they are not also sent as query/body params.
   * Example: url="/member/account/{account_id}/transaction", params={account_id:"42"}
   *          → url="/member/account/42/transaction", params={}
   */
  function substitutePathParams(url: string, params: Record<string, any>): { url: string; params: Record<string, any> } {
    const remaining = { ...params }
    const substituted = url.replace(/\{(\w+)\}/g, (_, key) => {
      if (key in remaining && remaining[key] !== undefined && remaining[key] !== null) {
        const value = String(remaining[key])
        delete remaining[key]
        return value
      }
      return `{${key}}`
    })
    return { url: substituted, params: remaining }
  }

  const apiClient = createApiClient()

  const callApi = async (
    method: string,
    data?: Record<string, any>,
    customConfig?: AxiosRequestConfig
  ): Promise<any> => {
    await loadApiConfig()

    const apiRequest = findApiRequest(method)

    if (!apiRequest) {
      return Promise.reject(new Error(`API request not found for method: ${method}`))
    }

    // Build params with form data, localStorage, and extraParams
    const rawParams = buildParams(method, data || {})

    // Substitute {param} placeholders in the URL template (e.g. /member/account/{account_id}/transaction)
    const { url: resolvedUrl, params } = substitutePathParams(apiRequest.url, rawParams)

    const headers: Record<string, string> = {}
    const activeConfig = getActiveApiConfig()
    const globalHeaders = activeConfig.headers || {}

    // If apiRequest.headers is a string array (e.g. ["authorization"]), read values from localStorage
    if (Array.isArray(apiRequest.headers) && typeof window !== 'undefined') {
      apiRequest.headers.forEach((headerKey) => {
        const value = localStorage.getItem(headerKey)
        if (value) {
          // Check if there's a prefix defined in global headers
          const prefix = globalHeaders[headerKey] || ''
          headers[headerKey] = prefix + value
        }
      })
    } else if (apiRequest.headers && typeof apiRequest.headers === 'object') {
      Object.assign(headers, apiRequest.headers)
    }

    // If the resolved URL is an external absolute URL (http/https), route through
    // the server-side proxy at /api/proxy?url=<encoded> to avoid CORS issues.
    let finalUrl = resolvedUrl
    if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
      finalUrl = `/api/proxy?url=${encodeURIComponent(resolvedUrl)}`
    }

    const config: AxiosRequestConfig = {
      method: apiRequest.method as any,
      url: finalUrl,
      headers: {
        ...headers,
        ...customConfig?.headers,
      },
      ...customConfig,
    }

    if (params && (apiRequest.method === 'POST' || apiRequest.method === 'PUT' || apiRequest.method === 'PATCH')) {
      config.data = params
    } else if (params && (apiRequest.method === 'GET' || apiRequest.method === 'DELETE')) {
      config.params = params
    }

    // Build dedup key BEFORE proxy-wrapping the URL
    const inflightKey = makeInflightKey(apiRequest.method, resolvedUrl, params || {})

    if (_inflightRequests.has(inflightKey)) {
      return _inflightRequests.get(inflightKey)!
    }

    const requestPromise = apiClient.request(config)
      .then((response) => {
        if (response.data && typeof response.data === 'object' && apiRequest.response) {
          saveContractData(response.data, apiRequest.response)
        }
        return response.data
      })
      .catch((error: any) => {
        if (error?.response?.status === 401) {
          const ts = themeSettings.value as any
          const redirectPath = ts?.notAuthRedirect || '/login'
          try {
            const router = useRouter()
            router.replace(redirectPath)
          } catch {
            if (import.meta.client) {
              window.location.href = redirectPath
            }
          }
        }
        console.error('[API Client] Error:', error)
        return Promise.reject(error)
      })
      .finally(() => {
        _inflightRequests.delete(inflightKey)
      })

    _inflightRequests.set(inflightKey, requestPromise)
    return requestPromise
  }

  /**
   * Execute a method call which can be:
   * - A single string (method name)
   * - An object with type 'sequence' and calls array
   * - An object with type 'parallel' and calls array
   */
  const executeMethod = async (
    method: MethodCall,
    formData: Record<string, any>
  ): Promise<any> => {
    // Single call
    if (typeof method === 'string') {
      return callApi(method, formData)
    }

    // Parallel calls
    if (method.type === 'parallel') {
      const results = await Promise.all(
        method.calls.map(call => executeMethod(call, formData))
      )
      return results
    }

    // Sequence calls
    if (method.type === 'sequence') {
      let result = null
      for (const call of method.calls) {
        result = await executeMethod(call, formData)
      }
      return result
    }

    return null
  }

  async function runStartupMethods(): Promise<void> {
    if (_startupComplete) return
    _startupComplete = true
    await loadApiConfig()
    const config = getActiveApiConfig()
    const requests = config.requests || {}
    const startupMethods = Object.entries(requests)
      .filter(([_, req]) => (req as any).tags?.includes('startup'))
      .map(([name]) => name)
    if (startupMethods.length === 0) return
    await Promise.allSettled(startupMethods.map(name => callApi(name, {})))
  }

  return {
    callApi,
    executeMethod,
    apiClient,
    saveContractData,
    buildParams,
    loadApiConfig,
    isApiConfigLoaded,
    runStartupMethods,
  }
}
