import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { useResourceStore } from '../../src/stores/resources'
import type { PluginHostContext } from '../../src/shims'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for the fonts + templates store.
 *
 * The store relies on `getApi()` being initialised by the host's
 * mount contract — we register a stub API in beforeEach so each
 * test gets an isolated request log without depending on a real
 * fetch.
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
        delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
    }
}

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('stores/resources', () => {
    it('loads fonts and templates in parallel', async () => {
        setApi(makeStubApi({
            '/typst/fonts': () => ({ fonts: [{ name: 'Inter-Regular.otf', kind: 'font', origin: 'skill', size: 609600, modified_at: 1700000000 }] }),
            '/typst/examples': () => ({ templates: [{ name: 'invoice.typ', kind: 'template', origin: 'skill', size: 1400, modified_at: 1700000000 }] }),
        }))

        const store = useResourceStore()
        await store.loadAll()

        expect(store.fonts).toHaveLength(1)
        expect(store.fonts[0]?.name).toBe('Inter-Regular.otf')
        expect(store.templates).toHaveLength(1)
        expect(store.templates[0]?.name).toBe('invoice.typ')
        expect(store.error).toBeNull()
    })

    it('surfaces ApiError messages on loadFonts', async () => {
        setApi({
            get: () => Promise.reject(new ApiError('boom', 'BOOM', 500)),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadFonts()
        expect(store.error).toBe('boom')
    })

    it('uploads a font and prepends it to the list', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ fonts: [] } as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({ font: { name: 'Custom.otf', kind: 'font', origin: 'principal', size: 1234, modified_at: 9999 } } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.uploadFont('Custom.otf', 'base64-bytes')
        expect(result).not.toBeNull()
        expect(postedPath).toBe('/typst/fonts')
        expect(postedBody).toEqual({ name: 'Custom.otf', content: 'base64-bytes' })
        expect(store.fonts).toHaveLength(1)
        expect(store.fonts[0]?.name).toBe('Custom.otf')
        expect(store.fonts[0]?.origin).toBe('principal')
    })

    it('removes a font and filters it out of the list', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ fonts: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({ font: { name: 'X.otf', kind: 'font', origin: 'principal', size: 1, modified_at: 1 } } as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.uploadFont('X.otf', 'a')
        expect(store.fonts).toHaveLength(1)
        await store.removeFont('X.otf')
        expect(store.fonts).toHaveLength(0)
    })

    it('uploads a template and prepends it to the list', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ templates: [] } as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({ template: { name: 'Letter.typ', kind: 'template', origin: 'principal', size: 567, modified_at: 9999 } } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.uploadTemplate('Letter.typ', '= Hi')
        expect(result).not.toBeNull()
        expect(postedPath).toBe('/typst/examples')
        expect(postedBody).toEqual({ name: 'Letter.typ', content: '= Hi' })
        expect(store.templates).toHaveLength(1)
        expect(store.templates[0]?.name).toBe('Letter.typ')
    })

    it('removes a template and filters it out of the list', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ templates: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({ template: { name: 'X.typ', kind: 'template', origin: 'principal', size: 1, modified_at: 1 } } as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.uploadTemplate('X.typ', 'a')
        expect(store.templates).toHaveLength(1)
        await store.removeTemplate('X.typ')
        expect(store.templates).toHaveLength(0)
    })
})
