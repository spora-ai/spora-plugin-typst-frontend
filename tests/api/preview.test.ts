import { describe, it, expect } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
import { previewTypst } from '../../src/api/preview'
import type { PluginHostContext } from '../../src/shims'

/**
 * Tests for the editor / playground preview API client.
 *
 * `previewTypst` is a thin wrapper around the host's POST client —
 * the interesting logic is the body shape and the `?principal_id=`
 * threading that lets the backend resolve `#include` against the
 * operator's chip-row selection. The previous shape dropped the
 * principal on the floor and group-scoped examples surfaced as
 * "file not found" on the inspector.
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

describe('api/preview', () => {
    it('POSTs the source + format to /typst/preview and unwraps data', async () => {
        let postedPath = ''
        let postedBody: unknown = null
        setApi(makeStubApi((path, body) => {
            postedPath = path
            postedBody = body
            return {
                bytes: 'aGVsbG8=',
                mime: 'application/pdf',
                format: 'pdf',
                source_name: 'playground.typ',
                width: null,
                height: null,
            }
        }))

        const result = await previewTypst({ source: '= Hi', format: 'pdf' })
        expect(postedPath).toBe('/typst/preview')
        expect(postedBody).toEqual({ source: '= Hi', format: 'pdf', page: undefined, ppi: undefined })
        expect(result.mime).toBe('application/pdf')
        expect(result.format).toBe('pdf')
    })

    it('omits ?principal_id when no principal is supplied', async () => {
        let postedPath = ''
        setApi(makeStubApi((path) => {
            postedPath = path
            return { bytes: '', mime: 'application/pdf', format: 'pdf', source_name: 'x.typ', width: null, height: null }
        }))

        await previewTypst({ source: '= Hi' })
        expect(postedPath).toBe('/typst/preview')
        expect(postedPath).not.toContain('principal_id')
    })

    it('threads principalId onto the URL as ?principal_id=N (group render)', async () => {
        let postedPath = ''
        setApi(makeStubApi((path) => {
            postedPath = path
            return { bytes: '', mime: 'application/pdf', format: 'pdf', source_name: 'group.typ', width: null, height: null }
        }))

        await previewTypst({ source: '= Hi', principalId: 42 })
        expect(postedPath).toBe('/typst/preview?principal_id=42')
    })

    it('omits ?principal_id when principalId is explicitly null', async () => {
        let postedPath = ''
        setApi(makeStubApi((path) => {
            postedPath = path
            return { bytes: '', mime: 'application/pdf', format: 'pdf', source_name: 'x.typ', width: null, height: null }
        }))

        await previewTypst({ source: '= Hi', principalId: null })
        expect(postedPath).toBe('/typst/preview')
    })

    it('URL-encodes non-integer principal ids defensively', async () => {
        let postedPath = ''
        setApi(makeStubApi((path) => {
            postedPath = path
            return { bytes: '', mime: 'application/pdf', format: 'pdf', source_name: 'x.typ', width: null, height: null }
        }))

        await previewTypst({ source: '= Hi', principalId: 1234567890 })
        expect(postedPath).toBe('/typst/preview?principal_id=1234567890')
    })

    it('forwards page + ppi options to the controller', async () => {
        let postedBody: unknown = null
        setApi(makeStubApi((_path, body) => {
            postedBody = body
            return { bytes: '', mime: 'image/png', format: 'png', source_name: 'x.typ', width: 100, height: 100 }
        }))

        await previewTypst({ source: '= Hi', format: 'png', page: 2, ppi: 288 })
        expect(postedBody).toEqual({ source: '= Hi', format: 'png', page: 2, ppi: 288 })
    })

    it('propagates ApiError from the controller', async () => {
        setApi(makeStubApi(() => {
            throw new ApiError('Compilation failed', 'COMPILATION_FAILED', 422)
        }))

        await expect(previewTypst({ source: 'bad' })).rejects.toMatchObject({
            code: 'COMPILATION_FAILED',
            status: 422,
        })
    })
})
