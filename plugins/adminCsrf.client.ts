import { getCsrfToken } from '~/admin/utils/csrf'

/**
 * Client-only plugin that intercepts all $fetch requests to /api/admin/**
 * and automatically attaches the X-CSRF-Token header (double-submit cookie pattern).
 *
 * This eliminates the need for individual callsites to use adminFetch — plain
 * $fetch('/api/admin/...', { method: 'PUT' }) will include the CSRF header.
 */
export default defineNuxtPlugin(() => {
  const originalFetch = globalThis.$fetch

  globalThis.$fetch = Object.assign(
    ((url: string, opts?: any) => {
      const isAdminApi =
        typeof url === 'string' && url.startsWith('/api/admin')

      if (!isAdminApi) {
        return originalFetch(url, opts)
      }

      const csrfToken = getCsrfToken()
      if (!csrfToken) {
        return originalFetch(url, opts)
      }

      const headers: Record<string, string> = {
        ...(opts?.headers as Record<string, string> || {}),
        'X-CSRF-Token': csrfToken,
      }

      return originalFetch(url, { ...opts, headers })
    }) as typeof originalFetch,
    originalFetch,
  )
})
