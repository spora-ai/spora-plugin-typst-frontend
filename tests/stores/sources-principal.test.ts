import { describe, it, expect, beforeEach } from 'vitest'
import { setApi } from '../../src/api/client'
import { useSourcesStore } from '../../src/stores/sources'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

/**
 * Tests for the principal-scoped behaviour of the playground-sources
 * Pinia store. Mirrors the same shape as the resources / images
 * store tests so a regression that drops the chip-row wiring in
 * {@see ../../src/pages/TypstPage.vue} shows up here.
 */

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('stores/sources — principal scoping', () => {
    it('loadSources threads principal_id into the URL when setPrincipalId is set', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({ sources: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        store.setPrincipalId(42)
        await store.loadSources()

        expect(requestedPath).toBe('/typst/sources?principal_id=42')
    })

    it('loadSources omits principal_id when no principal is set (default = user-principal)', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({ sources: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        await store.loadSources()

        expect(requestedPath).toBe('/typst/sources')
    })

    it('setPrincipalId does not re-fetch on the initial set when the listing is empty', async () => {
        const seen: string[] = []
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                seen.push(path)
                return Promise.resolve({ sources: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        // Set the principal BEFORE the first load — should not double-fetch
        // (the onMounted in CompileForm.vue calls loadSources() once and
        // the watcher on principalId only refetches when sources.value
        // is already populated).
        store.setPrincipalId(99)
        await store.loadSources()
        expect(seen).toEqual(['/typst/sources?principal_id=99'])
    })

    it('re-fetches the listing when the principal changes after one is already loaded', async () => {
        // The watcher on `principalId` (flush: 'sync') fires a
        // reload every time the chip row picks a different
        // principal. After the first loadSources() has populated
        // the listing, switching principals must re-fetch — but
        // switching to a principal with zero rows mustn't silence
        // a subsequent switch back to a populated principal (the
        // image-store regression that motivated hasLoadedOnce).
        let fetchCount = 0
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => {
                fetchCount += 1
                return Promise.resolve({ sources: [] } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        await store.loadSources()                                // 1: initial load
        store.setPrincipalId(7)
        await flushPromises()                                    // 2: watcher refetch
        store.setPrincipalId(8)
        await flushPromises()                                    // 3: watcher refetch
        store.setPrincipalId(7)                                  // back to a populated one — must re-fetch
        await flushPromises()                                    // 4: watcher refetch

        expect(fetchCount).toBe(4)
    })

    it('openSource threads the current principal_id into the URL', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve({
                    id: 'src-1',
                    filename: 'letter.typ',
                    byte_size: 9,
                    mime: 'text/x-typst',
                    content: '= Hi',
                    created_at: 't1',
                    updated_at: 't1',
                } as T)
            },
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        store.setPrincipalId(5)
        await store.openSource('src-1')

        expect(requestedPath).toBe('/typst/sources/src-1?principal_id=5')
    })

    it('saveSource threads the current principal_id into the URL', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(path: string, _body: unknown): Promise<T> => {
                requestedPath = path
                return Promise.resolve({
                    id: 'src-1',
                    filename: 'letter.typ',
                    byte_size: 9,
                    created_at: 't1',
                    updated_at: 't1',
                } as T)
            },
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useSourcesStore()
        store.setPrincipalId(11)
        await store.saveSource('src-1', '= Hi')

        expect(requestedPath).toBe('/typst/sources/src-1?principal_id=11')
    })

    it('removeSource threads the current principal_id into the URL', async () => {
        let requestedPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(path: string): Promise<T> => {
                requestedPath = path
                return Promise.resolve(undefined as T)
            },
        })

        const store = useSourcesStore()
        store.setPrincipalId(13)
        await store.removeSource('src-1')

        expect(requestedPath).toBe('/typst/sources/src-1?principal_id=13')
    })
})
