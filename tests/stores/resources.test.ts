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
    it('loads fonts, templates, and examples in parallel', async () => {
        setApi(makeStubApi({
            '/typst/fonts': () => ({ fonts: [{ name: 'Inter-Regular.otf', kind: 'font', origin: 'skill', size: 609600, modified_at: 1700000000 }] }),
            '/typst/templates': () => ({ templates: [{ name: 'invoice.typ', kind: 'template', origin: 'skill', size: 1400, modified_at: 1700000000 }] }),
            '/typst/examples': () => ({ examples: [{ name: 'headings.typ', kind: 'example', origin: 'skill', size: 200, modified_at: 1700000000 }] }),
        }))

        const store = useResourceStore()
        await store.loadAll()

        expect(store.fonts).toHaveLength(1)
        expect(store.fonts[0]?.name).toBe('Inter-Regular.otf')
        expect(store.templates).toHaveLength(1)
        expect(store.templates[0]?.name).toBe('invoice.typ')
        expect(store.examples).toHaveLength(1)
        expect(store.examples[0]?.name).toBe('headings.typ')
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
        expect(postedPath).toBe('/typst/templates')
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

    it('updateTemplate PUTs the new content and replaces the row in place', async () => {
        let putPath = ''
        let putBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                templates: [{ name: 'Letter.typ', kind: 'template', origin: 'principal', size: 100, modified_at: 1 }],
            } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, body: unknown): Promise<T> => {
                putPath = path
                putBody = body
                return Promise.resolve({
                    template: { name: 'Letter.typ', kind: 'template', origin: 'principal', size: 200, modified_at: 999 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadTemplates()
        const before = store.templates[0]
        expect(before?.size).toBe(100)
        expect(before?.modified_at).toBe(1)

        const updated = await store.updateTemplate('Letter.typ', '= New content')
        expect(updated).not.toBeNull()
        expect(putPath).toBe('/typst/templates/Letter.typ')
        expect(putBody).toEqual({ content: '= New content' })

        // The in-memory row reflects the new size + mtime, no
        // second row appended.
        expect(store.templates).toHaveLength(1)
        const after = store.templates[0]
        expect(after?.size).toBe(200)
        expect(after?.modified_at).toBe(999)
    })

    it('updateTemplate prepends the row when it was not already in the listing', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ templates: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({
                template: { name: 'New.typ', kind: 'template', origin: 'principal', size: 50, modified_at: 7 },
            } as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadTemplates()
        expect(store.templates).toHaveLength(0)

        await store.updateTemplate('New.typ', '= Hi')
        expect(store.templates).toHaveLength(1)
        expect(store.templates[0]?.name).toBe('New.typ')
    })

    it('updateTemplate returns null and surfaces error on a 422', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                templates: [{ name: 'Letter.typ', kind: 'template', origin: 'principal', size: 100, modified_at: 1 }],
            } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(
                new ApiError('Invalid template basename: ../etc.typ', 'INVALID_BASENAME', 422),
            ),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadTemplates()
        const result = await store.updateTemplate('../etc.typ', 'x')
        expect(result).toBeNull()
        expect(store.error).toBe('Invalid template basename: ../etc.typ')
        // Original row untouched.
        expect(store.templates).toHaveLength(1)
        expect(store.templates[0]?.size).toBe(100)
    })

    it('updateExample PUTs the new content and replaces the row in place', async () => {
        let putPath = ''
        let putBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                examples: [{ name: 'tables.typ', kind: 'example', origin: 'principal', size: 240, modified_at: 1 }],
            } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, body: unknown): Promise<T> => {
                putPath = path
                putBody = body
                return Promise.resolve({
                    example: { name: 'tables.typ', kind: 'example', origin: 'principal', size: 480, modified_at: 999 },
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.loadExamples()
        const before = store.examples[0]
        expect(before?.size).toBe(240)

        const updated = await store.updateExample('tables.typ', '#table(...)\n#pagebreak()\n#table(...)')
        expect(updated).not.toBeNull()
        expect(putPath).toBe('/typst/examples/tables.typ')
        expect(putBody).toEqual({ content: '#table(...)\n#pagebreak()\n#table(...)' })

        expect(store.examples).toHaveLength(1)
        const after = store.examples[0]
        expect(after?.size).toBe(480)
        expect(after?.modified_at).toBe(999)
    })

    it('updateExample returns null and surfaces error on a 422', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ examples: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(
                new ApiError('Invalid example basename: ../etc.typ', 'INVALID_BASENAME', 422),
            ),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.updateExample('../etc.typ', 'x')
        expect(result).toBeNull()
        expect(store.error).toBe('Invalid example basename: ../etc.typ')
    })

    it('renderExample POSTs the source + name to /typst/preview and returns the result', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({
                    bytes: 'aGVsbG8=',
                    mime: 'image/png',
                    format: 'png',
                    source_name: 'tables.typ',
                    width: 320,
                    height: 200,
                } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.renderExample('tables.typ', '#table(...)')
        expect(result).not.toBeNull()
        expect(result?.format).toBe('png')
        expect(result?.mime).toBe('image/png')
        expect(result?.source_name).toBe('tables.typ')
        expect(postedPath).toBe('/typst/preview')
        // Default format is png — the inline thumbnail shape.
        expect((postedBody as { format: string }).format).toBe('png')
        expect((postedBody as { source: string }).source).toBe('#table(...)')
        expect((postedBody as { name: string }).name).toBe('tables.typ')
        expect(store.error).toBeNull()
    })

    it('renderExample forwards format + ppi overrides', async () => {
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, body: unknown): Promise<T> => {
                postedBody = body
                return Promise.resolve({
                    bytes: '',
                    mime: 'image/png',
                    format: 'png',
                    source_name: 'tables.typ',
                    width: 800,
                    height: 600,
                } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        await store.renderExample('tables.typ', '#table(...)', 'png', 200)
        expect((postedBody as { format: string }).format).toBe('png')
        expect((postedBody as { ppi: number }).ppi).toBe(200)
    })

    it('renderExample surfaces ApiError messages and returns null', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.reject(
                new ApiError('Compilation failed: unknown variable', 'COMPILATION_FAILED', 422),
            ),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useResourceStore()
        const result = await store.renderExample('broken.typ', '#bad()')
        expect(result).toBeNull()
        expect(store.error).toBe('Compilation failed: unknown variable')
    })
})

describe('resources store — principal scoping on writes', () => {
    it('upload passes the store\'s principalId on the wire', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({ font: { name: 'Custom.otf', size: 0, kind: 'font', path: '', origin: 'principal' } } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })
        const store = useResourceStore()
        store.setPrincipalId(42)
        await store.uploadFont('Custom.otf', 'base64-bytes')
        expect(postedPath).toBe('/typst/fonts?principal_id=42')
        expect(postedBody).toEqual({ name: 'Custom.otf', content: 'base64-bytes' })
    })

    it('destroy passes the store\'s principalId on the wire', async () => {
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
        const store = useResourceStore()
        store.setPrincipalId(7)
        await store.removeTemplate('X.typ')
        expect(deletedPath).toBe('/typst/templates/X.typ?principal_id=7')
    })
})
