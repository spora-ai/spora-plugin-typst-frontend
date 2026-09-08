import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { getTemplate, listTemplates, uploadTemplate, updateTemplate, deleteTemplate } from '../../src/api/templates'
import type { PluginHostContext } from '../../src/shims'

/**
 * Tests for the template API client.
 *
 * Covers the four wire methods:
 *   GET    /typst/templates          (list)
 *   GET    /typst/templates/{name}   (read source bytes)
 *   POST   /typst/templates          (upload)
 *   DELETE /typst/templates/{name}   (remove)
 *
 * `getTemplate` reads `text/plain` and so uses the plugin-local
 * `fetchText` helper (which calls `globalThis.fetch` directly).
 * The list / upload / delete methods go through the JSON-only
 * host API client. Tests stub `globalThis.fetch` to avoid
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
        put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
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

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        return await handler(url)
    }))
}

beforeEach(() => {
    setApi(makeStubApi())
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('api/templates', () => {
    it('getTemplate reads from /typst/templates/{name} (not the examples endpoint)', async () => {
        let requestedUrl = ''
        stubFetch((url) => {
            requestedUrl = url
            return new Response('= Hello\n', { status: 200 })
        })

        const source = await getTemplate('letter.typ')
        expect(source).toBe('= Hello\n')
        expect(requestedUrl).toBe('/api/v1/typst/templates/letter.typ')
        // Lock in: the wrong endpoint would be /typst/examples/letter.typ
        // — the bug that motivated this test.
        expect(requestedUrl).not.toContain('/examples/')
    })

    it('getTemplate URL-encodes the basename', async () => {
        let requestedUrl = ''
        stubFetch((url) => {
            requestedUrl = url
            return new Response('', { status: 200 })
        })

        await getTemplate('Invoice Q1 2026.typ')
        expect(requestedUrl).toBe('/api/v1/typst/templates/Invoice%20Q1%202026.typ')
    })

    it('getTemplate surfaces ApiError on a 404 with the server message', async () => {
        stubFetch(() => new Response(
            JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Template "ghost.typ" not found' } }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
        ))

        await expect(getTemplate('ghost.typ')).rejects.toBeInstanceOf(ApiError)
        try {
            await getTemplate('ghost.typ')
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError)
            if (e instanceof ApiError) {
                expect(e.code).toBe('NOT_FOUND')
                expect(e.message).toContain('ghost.typ')
                expect(e.status).toBe(404)
            }
        }
    })

    it('getTemplate falls back to HTTP_ERROR when the failure body is not JSON', async () => {
        stubFetch(() => new Response('gateway exploded', { status: 502 }))

        try {
            await getTemplate('letter.typ')
            expect.fail('expected ApiError')
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError)
            if (e instanceof ApiError) {
                expect(e.code).toBe('HTTP_ERROR')
                expect(e.status).toBe(502)
            }
        }
    })

    it('listTemplates hits /typst/templates without a principal filter by default', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({ templates: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await listTemplates()
        expect(requestedPath).toBe('/typst/templates')
    })

    it('listTemplates adds ?principal_id when one is supplied', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({ templates: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await listTemplates(42)
        expect(requestedPath).toBe('/typst/templates?principal_id=42')
    })

    it('uploadTemplate posts the name + content', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({
                    template: { name: 'letter.typ', kind: 'template', origin: 'principal', size: 8, modified_at: 1 },
                } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const t = await uploadTemplate('letter.typ', '= Letter')
        expect(postedPath).toBe('/typst/templates')
        expect(postedBody).toEqual({ name: 'letter.typ', content: '= Letter' })
        expect(t.name).toBe('letter.typ')
    })

    it('deleteTemplate removes by name', async () => {
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

        await deleteTemplate('letter.typ')
        expect(deletedPath).toBe('/typst/templates/letter.typ')
    })

    it('updateTemplate PUTs the new content and unwraps the envelope', async () => {
        let putPath = ''
        let putBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, body: unknown): Promise<T> => {
                putPath = path
                putBody = body
                return Promise.resolve({
                    template: { name: 'Letter.typ', kind: 'template', origin: 'principal', size: 99, modified_at: 1234 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const t = await updateTemplate('Letter.typ', '= New content')
        expect(putPath).toBe('/typst/templates/Letter.typ')
        expect(putBody).toEqual({ content: '= New content' })
        expect(t.name).toBe('Letter.typ')
        expect(t.size).toBe(99)
        expect(t.modified_at).toBe(1234)
    })

    it('updateTemplate URL-encodes the basename on the PUT path', async () => {
        let putPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, _body: unknown): Promise<T> => {
                putPath = path
                return Promise.resolve({
                    template: { name: 'Invoice Q1 2026.typ', kind: 'template', origin: 'principal', size: 1, modified_at: 1 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await updateTemplate('Invoice Q1 2026.typ', '= Hi')
        expect(putPath).toBe('/typst/templates/Invoice%20Q1%202026.typ')
    })

    it('updateTemplate propagates a 422 ApiError for an invalid basename', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(
                new ApiError('Invalid template basename: ../etc.typ', 'INVALID_BASENAME', 422),
            ),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await expect(updateTemplate('../etc.typ', 'x')).rejects.toMatchObject({
            code: 'INVALID_BASENAME',
            status: 422,
        })
    })
})
