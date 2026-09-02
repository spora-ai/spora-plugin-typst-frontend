import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { getTemplate, listTemplates, uploadTemplate, deleteTemplate } from '../../src/api/templates'
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
 * The previous version of the TemplateList component called the
 * examples endpoint (`/api/v1/typst/examples/{name}`) instead of
 * templates — that bug is what motivated adding `getTemplate` to
 * the typed client so the wrong-URL mistake can't recur.
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

beforeEach(() => {
    setApi(makeStubApi())
})

describe('api/templates', () => {
    it('getTemplate reads from /typst/templates/{name} (not the examples endpoint)', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve('= Hello\n' as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const source = await getTemplate('letter.typ')
        expect(source).toBe('= Hello\n')
        expect(requestedPath).toBe('/typst/templates/letter.typ')
        // Lock in: the wrong endpoint would be /typst/examples/letter.typ
        // — the bug that motivated this test.
        expect(requestedPath).not.toContain('/examples/')
    })

    it('getTemplate URL-encodes the basename', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve('' as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await getTemplate('Invoice Q1 2026.typ')
        expect(requestedPath).toBe('/typst/templates/Invoice%20Q1%202026.typ')
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

    it('getTemplate surfaces ApiError on a 404', async () => {
        setApi({
            get: () => Promise.reject(new ApiError('missing', 'NOT_FOUND', 404)),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        await expect(getTemplate('ghost.typ')).rejects.toBeInstanceOf(ApiError)
    })
})
