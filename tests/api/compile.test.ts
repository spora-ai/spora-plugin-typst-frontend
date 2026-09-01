import { describe, it, expect } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { compileTypst, imageSnippet } from '../../src/api/compile'
import type { PluginHostContext } from '../../src/shims'

/**
 * Tests for the playground compile API client.
 *
 * `compileTypst` is a thin wrapper around the host's POST client —
 * the interesting logic is the shape of the body and how the wire
 * response becomes `CompileResult`. `imageSnippet` is a pure helper.
 */

function makeStubApi(handler: (path: string, body: unknown) => unknown): PluginHostContext['api'] {
    return {
        get: <T = unknown>(_path: string): Promise<T> => Promise.resolve({} as T),
        post: <T = unknown>(path: string, body: unknown): Promise<T> => Promise.resolve(handler(path, body) as T),
        put: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        patch: <T = unknown>(_path: string, _body: unknown): Promise<T> => Promise.resolve({} as T),
        delete: <T = unknown>(_path: string): Promise<T> => Promise.resolve(undefined as T),
    }
}

describe('api/compile', () => {
    it('POSTs the source + format to /typst/compile and unwraps data', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi(makeStubApi((path, body) => {
            postedPath = path
            postedBody = body
            return {
                derivative_id: '01HXYZ',
                asset_url: '/api/v1/assets/01HXYZ.pdf',
                format: 'pdf',
                mime: 'application/pdf',
                size: 12345,
                width: null,
                height: null,
                preview_url: '/api/v1/assets/01HABC.png',
            }
        }))

        const result = await compileTypst({ source: '= Hi', format: 'pdf' })
        expect(postedPath).toBe('/typst/compile')
        expect(postedBody).toEqual({ source: '= Hi', format: 'pdf', page: undefined, dpi: undefined })
        expect(result.asset_url).toBe('/api/v1/assets/01HXYZ.pdf')
        expect(result.format).toBe('pdf')
        expect(result.preview_url).toBe('/api/v1/assets/01HABC.png')
    })

    it('defaults format to pdf when omitted', async () => {
        let postedBody: unknown = null
        setApi(makeStubApi((_path, body) => {
            postedBody = body
            return { derivative_id: 'x', asset_url: '/api/v1/assets/x.pdf', format: 'pdf', mime: 'application/pdf', size: 0, width: null, height: null, preview_url: null }
        }))

        await compileTypst({ source: '= Hi' })
        expect((postedBody as { format: string }).format).toBe('pdf')
    })

    it('forwards page + dpi options to the controller', async () => {
        let postedBody: unknown = null
        setApi(makeStubApi((_path, body) => {
            postedBody = body
            return { derivative_id: 'x', asset_url: '/api/v1/assets/x.png', format: 'png', mime: 'image/png', size: 0, width: 100, height: 100, preview_url: null }
        }))

        await compileTypst({ source: '= Hi', format: 'png', page: 1, dpi: 200 })
        expect(postedBody).toEqual({ source: '= Hi', format: 'png', page: 1, dpi: 200 })
    })

    it('propagates ApiError from the controller', async () => {
        setApi(makeStubApi(() => {
            throw new ApiError('Compilation failed', 'COMPILATION_FAILED', 422)
        }))

        await expect(compileTypst({ source: 'bad' })).rejects.toMatchObject({
            code: 'COMPILATION_FAILED',
            status: 422,
        })
    })

    it('imageSnippet produces a #image() call with width: 80%', () => {
        const snippet = imageSnippet('/api/v1/assets/01HXYZ.png')
        expect(snippet).toBe('#image("/api/v1/assets/01HXYZ.png", width: 80%)')
    })
})
