import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { useImagesStore } from '../../src/stores/images'
import type { PluginHostContext } from '../../src/shims'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for the filesystem-backed image store.
 *
 * Replaces the earlier media_assets-backed shape: images now live
 * as plain files at `<storage>/typst/images/<principal>/<name>`,
 * served by the plugin's own route. Delete is by `name`, not `id`,
 * and the listing returns `{ name, mime, size, modified_at, url }`
 * instead of `{ id, filename, mime_type, byte_size, asset_url }`.
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

describe('stores/images', () => {
    it('loads images from the plugin filesystem endpoint', async () => {
        setApi(makeStubApi({
            '/typst/images': () => ({
                images: [
                    { name: 'logo.png', mime: 'image/png', size: 68, modified_at: 1700000000, url: '/api/v1/typst/images/logo.png' },
                ],
            }),
        }))

        const store = useImagesStore()
        await store.loadImages()

        expect(store.images).toHaveLength(1)
        expect(store.images[0]?.name).toBe('logo.png')
        expect(store.images[0]?.url).toBe('/api/v1/typst/images/logo.png')
    })

    it('uploads an image and re-fetches the listing', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({ images: [] } as T),
            post: <T = unknown>(path: string, body: unknown): Promise<T> => {
                postedPath = path
                postedBody = body
                return Promise.resolve({
                    image: { name: 'logo.png', mime: 'image/png', size: 68, modified_at: 1700000000, url: '/api/v1/typst/images/logo.png' },
                } as T)
            },
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useImagesStore()
        const result = await store.uploadImage('logo.png', 'image/png', 'base64-bytes')
        expect(result).not.toBeNull()
        expect(postedPath).toBe('/typst/images')
        expect(postedBody).toEqual({ filename: 'logo.png', mime: 'image/png', content: 'base64-bytes' })
    })

    it('deletes an image by name (not id)', async () => {
        let deletedPath = ''
        setApi({
            get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({
                images: [
                    { name: 'doomed.png', mime: 'image/png', size: 1, modified_at: 1, url: '/api/v1/typst/images/doomed.png' },
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

        const store = useImagesStore()
        await store.loadImages()
        expect(store.images).toHaveLength(1)
        await store.removeImage('doomed.png')
        expect(deletedPath).toBe('/typst/images/doomed.png')
        expect(store.images).toHaveLength(0)
    })

    it('surfaces ApiError messages on loadImages', async () => {
        setApi({
            get: () => Promise.reject(new ApiError('boom-images', 'BOOM_IMAGES', 500)),
            post: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
            delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
        })

        const store = useImagesStore()
        await store.loadImages()
        expect(store.error).toBe('boom-images')
    })
})
