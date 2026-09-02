import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { useResourceStore } from '../../src/stores/resources'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for the example-patterns path in the resources store —
 * mirrors the templates tests but against the /typst/examples
 * endpoint, which is the smaller snippet kind.
 */

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('stores/resources — examples', () => {
    it('uploads an example and prepends it to the list', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ examples: [] } as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({ example: { name: 'tables.typ', kind: 'example', origin: 'principal', size: 240, modified_at: 9999 } } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.uploadExample('tables.typ', '#table(...)')
        expect(result).not.toBeNull()
        expect(postedPath).toBe('/typst/examples')
        expect(postedBody).toEqual({ name: 'tables.typ', content: '#table(...)' })
        expect(store.examples).toHaveLength(1)
        expect(store.examples[0]?.name).toBe('tables.typ')
    })

    it('removes an example and filters it out of the list', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ examples: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({ example: { name: 'Y.typ', kind: 'example', origin: 'principal', size: 1, modified_at: 1 } } as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.uploadExample('Y.typ', 'a')
        expect(store.examples).toHaveLength(1)
        await store.removeExample('Y.typ')
        expect(store.examples).toHaveLength(0)
    })

    it('surfaces ApiError messages on loadExamples', async () => {
        setApi({
            get: () => Promise.reject(new ApiError('boom-examples', 'BOOM_EXAMPLES', 500)),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadExamples()
        expect(store.error).toBe('boom-examples')
    })

    it('surfaces ApiError messages on uploadExample', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ examples: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(new ApiError('upload-failed', 'UPLOAD_FAILED', 422)),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.uploadExample('bad.typ', 'x')
        expect(result).toBeNull()
        expect(store.error).toBe('upload-failed')
    })
})
