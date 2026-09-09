import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { listExamples, uploadExample, updateExample, getExample, deleteExample } from '../../src/api/examples'
import type { PluginHostContext } from '../../src/shims'

/**
 * Tests for the example API client.
 *
 * Mirrors `tests/api/templates.test.ts` — same five wire methods
 * (list / upload / update / read / delete), the only difference is
 * the path prefix and the wrapping key (`example` vs. `template`).
 *
 * `getExample` reads `text/plain` and so uses the plugin-local
 * `fetchText` helper (which calls `globalThis.fetch` directly).
 * The list / upload / update / delete methods go through the
 * JSON-only host API client. Tests stub the host API to avoid
 * hitting a real server.
 */

function makeStubApi(handlers: Partial<Record<string, (body?: unknown) => unknown>> = {}): PluginHostContext['api'] {
    return {
        get: <T = unknown>(path: string): Promise<T> => {
            const handler = handlers[path]
            if (handler && typeof handler === 'function') {
                return Promise.resolve(handler() as T)
            }
            return Promise.resolve({} as T)
        },
        post: <T = unknown>(path: string, body: unknown): Promise<T> => {
            const handler = handlers[path]
            if (handler && typeof handler === 'function') {
                return Promise.resolve(handler(body) as T)
            }
            return Promise.resolve({} as T)
        },
        put: <T = unknown>(path: string, body: unknown): Promise<T> => {
            const handler = handlers[path]
            if (handler && typeof handler === 'function') {
                return Promise.resolve(handler(body) as T)
            }
            return Promise.resolve({} as T)
        },
        patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        delete: <T = unknown>(path: string): Promise<T> => {
            const handler = handlers[path]
            if (handler && typeof handler === 'function') {
                return Promise.resolve(handler() as T)
            }
            return Promise.resolve(undefined as T)
        },
    }
}

beforeEach(() => {
    setApi(makeStubApi())
})

describe('api/examples', () => {
    it('listExamples hits /typst/examples without a principal filter by default', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({ examples: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await listExamples()
        expect(requestedPath).toBe('/typst/examples')
    })

    it('uploadExample posts the name + content', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({
                    example: { name: 'tables.typ', kind: 'example', origin: 'principal', size: 240, modified_at: 1 },
                } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const ex = await uploadExample('tables.typ', '#table(...)')
        expect(postedPath).toBe('/typst/examples')
        expect(postedBody).toEqual({ name: 'tables.typ', content: '#table(...)' })
        expect(ex.name).toBe('tables.typ')
    })

    it('updateExample PUTs the new content and unwraps the envelope', async () => {
        let putPath = ''
        let putBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, body: unknown): Promise<T> => {
                putPath = path
                putBody = body
                return Promise.resolve({
                    example: { name: 'tables.typ', kind: 'example', origin: 'principal', size: 480, modified_at: 1234 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const ex = await updateExample('tables.typ', '#table(...)\n#pagebreak()\n#table(...)')
        expect(putPath).toBe('/typst/examples/tables.typ')
        expect(putBody).toEqual({ content: '#table(...)\n#pagebreak()\n#table(...)' })
        expect(ex.name).toBe('tables.typ')
        expect(ex.size).toBe(480)
        expect(ex.modified_at).toBe(1234)
    })

    it('updateExample URL-encodes the basename on the PUT path', async () => {
        let putPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, _body: unknown): Promise<T> => {
                putPath = path
                return Promise.resolve({
                    example: { name: 'heading levels.typ', kind: 'example', origin: 'principal', size: 1, modified_at: 1 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await updateExample('heading levels.typ', '= Hi')
        expect(putPath).toBe('/typst/examples/heading%20levels.typ')
    })

    it('updateExample propagates a 422 ApiError for an invalid basename', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(
                new ApiError('Invalid example basename: ../etc.typ', 'INVALID_BASENAME', 422),
            ),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await expect(updateExample('../etc.typ', 'x')).rejects.toMatchObject({
            code: 'INVALID_BASENAME',
            status: 422,
        })
    })

    it('getExample reads from /typst/examples/{name} (not the templates endpoint)', async () => {
        let requestedUrl = ''
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString()
            requestedUrl = url
            return new Response('#table(...)\n', { status: 200 })
        }))

        const source = await getExample('tables.typ')
        expect(source).toBe('#table(...)\n')
        expect(requestedUrl).toBe('/api/v1/typst/examples/tables.typ')
        expect(requestedUrl).not.toContain('/templates/')

        vi.unstubAllGlobals()
    })

    it('deleteExample removes by name', async () => {
        let deletedPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(path: string): Promise<T> => {
                deletedPath = path
                return Promise.resolve(undefined as T)
            },
        })

        await deleteExample('tables.typ')
        expect(deletedPath).toBe('/typst/examples/tables.typ')
    })
})
