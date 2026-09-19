/**
 * Page-level pre-fetched data — provide/inject composable.
 *
 * Pages can declare `prefetch: ['method-a', 'method-b']` in their config JSON.
 * DynamicPage calls `providePageData()` on setup and `executePrefetch()` on mount.
 * This fetches the listed API methods in parallel and stores results via provide/inject.
 * Child components access pre-fetched data via `usePageData()` without duplicate calls.
 *
 * Usage in DynamicPage:
 *   const { data, loading, executePrefetch } = providePageData()
 *   onMounted(() => executePrefetch(['checkout-get-availability'], callApiFn))
 *
 * Usage in child component:
 *   const { hasMethodData, getMethodData } = usePageData()
 *   if (hasMethodData('checkout-get-availability')) { ... } else { selfFetch() }
 */
import { inject, provide, ref, type Ref } from 'vue'

const PAGE_DATA_KEY = 'page:data'
const PAGE_LOADING_KEY = 'page:loading'

/**
 * Consumer composable — used by child components to access pre-fetched page data.
 */
export function usePageData() {
  const data = inject<Ref<Record<string, any>>>(PAGE_DATA_KEY, ref({}))
  const loading = inject<Ref<boolean>>(PAGE_LOADING_KEY, ref(false))

  function getMethodData(methodName: string): any {
    return data.value[methodName]
  }

  function hasMethodData(methodName: string): boolean {
    return methodName in data.value
  }

  return { data, loading, getMethodData, hasMethodData }
}

/** Type for the callApi function passed to executePrefetch */
export type CallApiFn = (method: string, data?: Record<string, any>) => Promise<any>

/**
 * Provider composable — used by DynamicPage to set up the provide/inject context.
 * Returns `executePrefetch(methods, callApi)` to trigger prefetching on mount.
 */
export function providePageData() {
  const data = ref<Record<string, any>>({})
  const loading = ref(false)

  provide(PAGE_DATA_KEY, data)
  provide(PAGE_LOADING_KEY, loading)

  /**
   * Execute prefetch for the given method names using the provided callApi function.
   * Results are stored in data keyed by method name.
   * Failures are silently caught — components fall back to self-fetching.
   */
  async function executePrefetch(methods: string[], callApi: CallApiFn) {
    if (!methods.length) return
    loading.value = true
    try {
      const results = await Promise.allSettled(
        methods.map(m => callApi(m, {}))
      )
      methods.forEach((name, i) => {
        const result = results[i]
        if (result && result.status === 'fulfilled') {
          data.value[name] = (result as PromiseFulfilledResult<any>).value
        }
      })
    } finally {
      loading.value = false
    }
  }

  return { data, loading, executePrefetch }
}
