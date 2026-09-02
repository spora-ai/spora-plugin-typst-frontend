import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { useSourcesStore } from '../../src/stores/sources'
import type { PluginHostContext } from '../../src/shims'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for the playground-sources Pinia store — the bridge between
 * the open picker / editor / delete buttons in the Playground tab
 * and the {@see ../../src/api/sources} module.
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
    setActivePinia(createPinia())
})

describe('stores/sources', () => {
    it('loads sources from the backend', async () => {
        setApi(makeStubApi({
            '/typst/sources': () => ({
                sources: [
                    { id: 'src-1', filename: 'letter.typ', byte_size: 12, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
                ],
            }),
        }))

        const store = useSourcesStore()
        await store.loadSources()

        expect(store.sources).toHaveLength(1)
        expect(store.sources[0]?.filename).toBe('letter.typ')
    })

    it('opens a source by id and returns the full content', async () => {
        setApi(makeStubApi({
            '/typst/sources/src-1': () => ({
                id: 'src-1',
                filename: 'letter.typ',
                byte_size: 9,
                mime: 'text/x-typst',
                content: '= Letter!',
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-02T00:00:00Z',
            }),
        }))

        const store = useSourcesStore()
        const source = await store.openSource('src-1')
        expect(source).not.toBeNull()
        expect(source?.content).toBe('= Letter!')
    })

    it('saveSource updates the listing in place when the row already exists', async () => {
        let putPath = ''
        let putBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                sources: [
                    { id: 'src-1', filename: 'letter.typ', byte_size: 9, created_at: 't1', updated_at: 't2' },
                ],
            } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, body: unknown): Promise<T> => {
                putPath = path
                putBody = body
                return Promise.resolve({
                    id: 'src-1',
                    filename: 'letter.typ',
                    byte_size: 12,
                    created_at: 't1',
                    updated_at: 't3',
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        await store.loadSources()
        const before = store.sources[0]
        expect(before?.byte_size).toBe(9)

        const saved = await store.saveSource('src-1', '= Letter! Longer.')
        expect(saved).not.toBeNull()
        expect(putPath).toBe('/typst/sources/src-1')
        expect(putBody).toEqual({ content: '= Letter! Longer.' })

        // The in-memory entry reflects the new byte_size + updated_at.
        const after = store.sources[0]
        expect(after?.byte_size).toBe(12)
        expect(after?.updated_at).toBe('t3')
    })

    it('saveSource prepends to the listing when the row was not in it', async () => {
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ sources: [] } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({
                id: 'src-new',
                filename: 'draft.typ',
                byte_size: 6,
                created_at: 't1',
                updated_at: 't1',
            } as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        await store.loadSources()
        expect(store.sources).toHaveLength(0)

        await store.saveSource('src-new', '= Hi!')
        expect(store.sources).toHaveLength(1)
        expect(store.sources[0]?.id).toBe('src-new')
    })

    it('removeSource filters the deleted id out of the listing', async () => {
        let deletedPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                sources: [
                    { id: 'src-1', filename: 'a.typ', byte_size: 1, created_at: 't1', updated_at: 't1' },
                    { id: 'src-2', filename: 'b.typ', byte_size: 1, created_at: 't1', updated_at: 't1' },
                ],
            } as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(path: string): Promise<T> => {
                deletedPath = path
                return Promise.resolve(undefined as T)
            },
        })

        const store = useSourcesStore()
        await store.loadSources()
        expect(store.sources).toHaveLength(2)

        await store.removeSource('src-1')
        expect(deletedPath).toBe('/typst/sources/src-1')
        expect(store.sources).toHaveLength(1)
        expect(store.sources[0]?.id).toBe('src-2');
    });

    it('surfaces ApiError messages on loadSources', async () => {
        setApi({
            get: () => Promise.reject(new ApiError('boom-sources', 'BOOM_SOURCES', 500)),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        await store.loadSources()
        expect(store.error).toBe('boom-sources')
    });
})
