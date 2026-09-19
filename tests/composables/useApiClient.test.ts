// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, type Ref } from 'vue'

// --- Mocks ---

// axios: useApiClient calls axios.create() at composable-call time; every
// instance shares one request spy so tests can assert on the outgoing config.
const axiosMocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('axios', () => ({
    default: { create: vi.fn(() => ({ request: axiosMocks.request })) },
}))

// useClientConfig: only themeSettings (401 redirect) and childSites (active
// config resolution) are consumed by useApiClient.
// Plain `.value` containers suffice — useApiClient only reads `.value`.
const clientConfigMocks = vi.hoisted(() => ({
    themeSettings: { value: {} as Record<string, any> },
    childSites: { value: {} as Record<string, any> },
}))
vi.mock('~/shared/composables/useClientConfig', () => ({
    useClientConfig: () => clientConfigMocks,
}))

// Nuxt auto-imports: useState, useRoute, useRouter, $fetch
const stateStore = new Map<string, Ref>()
vi.stubGlobal('useState', (key: string, init?: () => any) => {
    if (!stateStore.has(key)) {
        stateStore.set(key, ref(init ? init() : undefined))
    }
    return stateStore.get(key)!
})

const mockRoute = {
    path: '/',
    query: {} as Record<string, string>,
    params: {} as Record<string, any>,
}
vi.stubGlobal('useRoute', () => mockRoute)

const mockRouterReplace = vi.fn()
vi.stubGlobal('useRouter', () => ({ replace: mockRouterReplace }))

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

import { useApiClient } from '~/shared/composables/useApiClient'

// --- Helpers ---

type SeedRequest = {
    method: string
    url: string
    parameters?: string[] | Record<string, string>
    extraParams?: Record<string, any>
    headers?: string[] | Record<string, string>
    response?: Array<{ [key: string]: string }>
}

// Seeds the apiConfig state directly so loadApiConfig() short-circuits
// without hitting $fetch.
function seedConfig(requests: Record<string, SeedRequest>, headers: Record<string, string> = {}) {
    const stateRef = (globalThis as any).useState('cms:apiConfig', () => null)
    stateRef.value = { headers, requests }
}

function okResponse(data: any = {}) {
    axiosMocks.request.mockResolvedValue({ data })
}

// callApi awaits loadApiConfig() before dispatching, so the axios request
// lands a microtask later than the call itself.
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useApiClient', () => {
    beforeEach(() => {
        stateStore.clear()
        localStorage.clear()
        vi.clearAllMocks()
        clientConfigMocks.themeSettings.value = {}
        clientConfigMocks.childSites.value = {}
        mockRoute.params = {}
        okResponse({})
    })

    // -----------------------------------------------------------------------
    // buildParams
    // -----------------------------------------------------------------------

    describe('buildParams', () => {
        it('returns formData as-is when the method is unknown', () => {
            seedConfig({})
            const { buildParams } = useApiClient()
            const formData = { a: 1, b: 'two' }

            expect(buildParams('nope', formData)).toBe(formData)
        })

        it('legacy string[] format: picks whitelisted keys from formData', () => {
            seedConfig({
                login: { method: 'POST', url: '/login', parameters: ['email', 'password'] },
            })
            const { buildParams } = useApiClient()

            const params = buildParams('login', { email: 'a@b.c', password: 'x', extra: 'dropped' })

            expect(params).toEqual({ email: 'a@b.c', password: 'x' })
        })

        it('legacy format: falls back to localStorage, JSON-parsing stored values', () => {
            localStorage.setItem('profile', JSON.stringify({ id: 7 }))
            seedConfig({
                m: { method: 'POST', url: '/m', parameters: ['profile'] },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ profile: { id: 7 } })
        })

        it('legacy format: non-JSON localStorage value is used as raw string', () => {
            localStorage.setItem('token', 'plain-token')
            seedConfig({
                m: { method: 'POST', url: '/m', parameters: ['token'] },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ token: 'plain-token' })
        })

        it('legacy format: key absent from formData and localStorage is omitted', () => {
            seedConfig({
                m: { method: 'POST', url: '/m', parameters: ['missing', 'present'] },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', { present: 1 })).toEqual({ present: 1 })
        })

        it('legacy format: undefined formData value falls through to localStorage', () => {
            localStorage.setItem('email', 'stored@x.y')
            seedConfig({
                m: { method: 'POST', url: '/m', parameters: ['email'] },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', { email: undefined })).toEqual({ email: 'stored@x.y' })
        })

        it('mapping format: renames componentVar to apiParam from formData', () => {
            seedConfig({
                m: {
                    method: 'POST',
                    url: '/m',
                    parameters: { user_account: 'email', password: 'password' },
                },
            })
            const { buildParams } = useApiClient()

            const params = buildParams('m', { email: 'a@b.c', password: 'pw' })

            expect(params).toEqual({ user_account: 'a@b.c', password: 'pw' })
        })

        it('mapping format: resolves componentVar from localStorage under the apiParam name', () => {
            localStorage.setItem('sessionToken', JSON.stringify('tok-1'))
            seedConfig({
                m: { method: 'POST', url: '/m', parameters: { token: 'sessionToken' } },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ token: 'tok-1' })
        })

        it('no parameters configured: passes all form data through', () => {
            seedConfig({ m: { method: 'POST', url: '/m' } })
            const { buildParams } = useApiClient()

            expect(buildParams('m', { a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
        })

        it('extraParams: resolves {{var}} placeholders from cms:envConfig', () => {
            const envRef = (globalThis as any).useState('cms:envConfig', () => ({}))
            envRef.value = { API_KEY: 'k-123' }
            seedConfig({
                m: {
                    method: 'GET',
                    url: '/m',
                    extraParams: { key: '{{API_KEY}}', mixed: 'v-{{API_KEY}}-end' },
                },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ key: 'k-123', mixed: 'v-k-123-end' })
        })

        it('extraParams: missing env var resolves to empty string', () => {
            seedConfig({
                m: { method: 'GET', url: '/m', extraParams: { key: '{{NOPE}}' } },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ key: '' })
        })

        it('extraParams: non-string values pass through verbatim', () => {
            seedConfig({
                m: { method: 'GET', url: '/m', extraParams: { limit: 10, flags: { deep: true } } },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', {})).toEqual({ limit: 10, flags: { deep: true } })
        })

        it('extraParams override colliding form-data keys', () => {
            seedConfig({
                m: { method: 'GET', url: '/m', extraParams: { source: 'cms' } },
            })
            const { buildParams } = useApiClient()

            expect(buildParams('m', { source: 'form', other: 1 }))
                .toEqual({ source: 'cms', other: 1 })
        })
    })

    // -----------------------------------------------------------------------
    // callApi
    // -----------------------------------------------------------------------

    describe('callApi', () => {
        it('rejects with the exact message when the method is unknown', async () => {
            seedConfig({})
            const { callApi } = useApiClient()

            await expect(callApi('ghost')).rejects.toThrow(
                'API request not found for method: ghost'
            )
            expect(axiosMocks.request).not.toHaveBeenCalled()
        })

        it('POST sends params as config.data', async () => {
            seedConfig({ create: { method: 'POST', url: '/items' } })
            const { callApi } = useApiClient()

            await callApi('create', { name: 'n1' })

            const config = axiosMocks.request.mock.calls[0][0]
            expect(config.method).toBe('POST')
            expect(config.url).toBe('/items')
            expect(config.data).toEqual({ name: 'n1' })
            expect(config.params).toBeUndefined()
        })

        it('GET sends params as config.params', async () => {
            seedConfig({ list: { method: 'GET', url: '/items' } })
            const { callApi } = useApiClient()

            await callApi('list', { page: 2 })

            const config = axiosMocks.request.mock.calls[0][0]
            expect(config.params).toEqual({ page: 2 })
            expect(config.data).toBeUndefined()
        })

        it('substitutes {param} path placeholders and removes them from params', async () => {
            seedConfig({
                tx: { method: 'GET', url: '/member/account/{account_id}/transaction' },
            })
            const { callApi } = useApiClient()

            await callApi('tx', { account_id: '42', page: 1 })

            const config = axiosMocks.request.mock.calls[0][0]
            expect(config.url).toBe('/member/account/42/transaction')
            expect(config.params).toEqual({ page: 1 })
        })

        it('leaves unmatched {param} placeholders literal in the URL', async () => {
            seedConfig({ tx: { method: 'GET', url: '/x/{missing}/y' } })
            const { callApi } = useApiClient()

            await callApi('tx', {})

            expect(axiosMocks.request.mock.calls[0][0].url).toBe('/x/{missing}/y')
        })

        it('wraps external absolute URLs through /api/proxy', async () => {
            const external = 'https://api.example.com/data'
            seedConfig({ ext: { method: 'GET', url: external } })
            const { callApi } = useApiClient()

            await callApi('ext')

            expect(axiosMocks.request.mock.calls[0][0].url).toBe(
                `/api/proxy?url=${encodeURIComponent(external)}`
            )
        })

        it('string[] headers: reads localStorage and prepends the global-header prefix', async () => {
            localStorage.setItem('authorization', 'tok-abc')
            seedConfig(
                { me: { method: 'GET', url: '/me', headers: ['authorization', 'x-absent'] } },
                { authorization: 'Bearer ' }
            )
            const { callApi } = useApiClient()

            await callApi('me')

            const headers = axiosMocks.request.mock.calls[0][0].headers
            expect(headers.authorization).toBe('Bearer tok-abc')
            expect(headers).not.toHaveProperty('x-absent')
        })

        it('object headers are merged verbatim', async () => {
            seedConfig({
                m: { method: 'GET', url: '/m', headers: { 'X-Custom': 'v1' } },
            })
            const { callApi } = useApiClient()

            await callApi('m')

            expect(axiosMocks.request.mock.calls[0][0].headers['X-Custom']).toBe('v1')
        })

        it('customConfig fields (e.g. timeout) are spread into the request config', async () => {
            seedConfig({ m: { method: 'GET', url: '/m' } })
            const { callApi } = useApiClient()

            await callApi('m', {}, { timeout: 5000 })

            expect(axiosMocks.request.mock.calls[0][0].timeout).toBe(5000)
        })

        // Characterization: `...customConfig` spreads AFTER the merged headers
        // key, so customConfig.headers replaces (not merges with) request headers.
        it('customConfig.headers replaces the request-level headers entirely', async () => {
            seedConfig({
                m: { method: 'GET', url: '/m', headers: { 'X-Base': 'base' } },
            })
            const { callApi } = useApiClient()

            await callApi('m', {}, { headers: { 'X-Override': 'win' } })

            const headers = axiosMocks.request.mock.calls[0][0].headers
            expect(headers).toEqual({ 'X-Override': 'win' })
        })

        it('resolves with response.data', async () => {
            okResponse({ items: [1, 2] })
            seedConfig({ m: { method: 'GET', url: '/m' } })
            const { callApi } = useApiClient()

            await expect(callApi('m')).resolves.toEqual({ items: [1, 2] })
        })

        it('response contract saves nested values to localStorage (string raw, object stringified)', async () => {
            okResponse({ auth: { access_token: 'tok-xyz' }, profile: { id: 9 } })
            seedConfig({
                login: {
                    method: 'POST',
                    url: '/login',
                    response: [
                        { 'auth.access_token': 'authorization' },
                        { profile: 'profileData' },
                    ],
                },
            })
            const { callApi } = useApiClient()

            await callApi('login', { u: 'x' })

            expect(localStorage.getItem('authorization')).toBe('tok-xyz')
            expect(localStorage.getItem('profileData')).toBe(JSON.stringify({ id: 9 }))
        })

        it('401 error redirects via router.replace to themeSettings.notAuthRedirect', async () => {
            clientConfigMocks.themeSettings.value = { notAuthRedirect: '/members-only' }
            axiosMocks.request.mockRejectedValue({ response: { status: 401 } })
            seedConfig({ m: { method: 'GET', url: '/m' } })
            const { callApi } = useApiClient()

            await expect(callApi('m')).rejects.toEqual({ response: { status: 401 } })
            expect(mockRouterReplace).toHaveBeenCalledWith('/members-only')
        })

        it('401 error defaults to /login when no notAuthRedirect is set', async () => {
            axiosMocks.request.mockRejectedValue({ response: { status: 401 } })
            seedConfig({ m: { method: 'GET', url: '/m' } })
            const { callApi } = useApiClient()

            await expect(callApi('m')).rejects.toBeDefined()
            expect(mockRouterReplace).toHaveBeenCalledWith('/login')
        })

        it('non-401 error rejects without redirecting', async () => {
            axiosMocks.request.mockRejectedValue({ response: { status: 500 } })
            seedConfig({ m: { method: 'GET', url: '/m' } })
            const { callApi } = useApiClient()

            await expect(callApi('m')).rejects.toEqual({ response: { status: 500 } })
            expect(mockRouterReplace).not.toHaveBeenCalled()
        })

        it('deduplicates concurrent identical calls into one request', async () => {
            let resolveRequest!: (v: any) => void
            axiosMocks.request.mockReturnValue(new Promise((r) => { resolveRequest = r }))
            seedConfig({ m: { method: 'GET', url: '/dedupe-a' } })
            const { callApi } = useApiClient()

            const a = callApi('m', { q: '1' })
            const b = callApi('m', { q: '1' })
            await flush()

            expect(axiosMocks.request).toHaveBeenCalledTimes(1)

            resolveRequest({ data: { ok: true } })
            expect(await a).toEqual({ ok: true })
            expect(await b).toEqual({ ok: true })
        })

        it('evicts the in-flight key after resolution — a later call issues a new request', async () => {
            seedConfig({ m: { method: 'GET', url: '/dedupe-b' } })
            const { callApi } = useApiClient()

            await callApi('m', { q: '1' })
            await callApi('m', { q: '1' })

            expect(axiosMocks.request).toHaveBeenCalledTimes(2)
        })

        it('dedup key ignores param insertion order', async () => {
            let resolveRequest!: (v: any) => void
            axiosMocks.request.mockReturnValue(new Promise((r) => { resolveRequest = r }))
            seedConfig({ m: { method: 'GET', url: '/dedupe-c' } })
            const { callApi } = useApiClient()

            const a = callApi('m', { b: 2, a: 1 })
            const b = callApi('m', { a: 1, b: 2 })
            await flush()

            expect(axiosMocks.request).toHaveBeenCalledTimes(1)

            resolveRequest({ data: {} })
            await Promise.all([a, b])
        })

        it('does not deduplicate calls with different params', async () => {
            let resolveRequest!: (v: any) => void
            axiosMocks.request.mockReturnValue(new Promise((r) => { resolveRequest = r }))
            seedConfig({ m: { method: 'GET', url: '/dedupe-d' } })
            const { callApi } = useApiClient()

            const a = callApi('m', { q: '1' })
            const b = callApi('m', { q: '2' })
            await flush()

            expect(axiosMocks.request).toHaveBeenCalledTimes(2)

            resolveRequest({ data: {} })
            await Promise.all([a, b])
        })

        it('evicts the in-flight key after rejection so the call can be retried', async () => {
            axiosMocks.request.mockRejectedValueOnce(new Error('boom'))
            seedConfig({ m: { method: 'GET', url: '/dedupe-e' } })
            const { callApi } = useApiClient()

            await expect(callApi('m', { q: '1' })).rejects.toThrow('boom')

            okResponse({ retried: true })
            await expect(callApi('m', { q: '1' })).resolves.toEqual({ retried: true })
            expect(axiosMocks.request).toHaveBeenCalledTimes(2)
        })
    })
})
