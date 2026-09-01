import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, getApi, ApiError } from '../../src/api/client'
import type { PluginHostContext } from '../../src/shims'

/**
 * Tests for the plugin-local API bridge.
 *
 * Mirrors `spora-plugin-memories-frontend/tests/api/client.test.ts` —
 * same shape, same contract:
 *  - `setApi(...)` is idempotent; `getApi()` returns the most recent.
 *  - `ApiError` carries `{ message, code, status }` so the stores can
 *    surface a typed error message without re-parsing the host's
 *    envelope.
 */

function makeStubApi(responses: Partial<Record<string, unknown>> = {}): PluginHostContext['api'] {
    return {
        get: <T = unknown>(path: string): Promise<T> => Promise.resolve((responses[path] ?? {}) as T),
        post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
    }
}

describe('api/client', () => {
    beforeEach(() => {
        setApi(makeStubApi())
    })

    it('returns the registered api after setApi()', () => {
        const api = getApi()
        expect(api).toBeDefined()
        expect(typeof api.get).toBe('function')
        expect(typeof api.post).toBe('function')
    })

    it('overwrites the registered api when setApi() is called twice', async () => {
        const first = getApi()
        const second = makeStubApi({ '/typst/fonts': { overwritten: true } })
        setApi(second)
        const result = await getApi().get<{ overwritten: boolean }>('/typst/fonts')
        expect(result.overwritten).toBe(true)
        expect(getApi()).not.toBe(first)
    })

    it('ApiError carries the standard envelope fields', () => {
        const err = new ApiError('Not Found', 'NOT_FOUND', 404)
        expect(err.message).toBe('Not Found')
        expect(err.code).toBe('NOT_FOUND')
        expect(err.status).toBe(404)
        expect(err.name).toBe('ApiError')
        expect(err).toBeInstanceOf(Error)
    })

    it('ApiError instance can be caught by plain Error handling', () => {
        try {
            throw new ApiError('Boom', 'BOOM', 500)
        } catch (e) {
            expect(e).toBeInstanceOf(Error)
            expect(e).toBeInstanceOf(ApiError)
            expect((e as ApiError).code).toBe('BOOM')
        }
    })
})
