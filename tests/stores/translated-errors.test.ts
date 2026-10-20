/**
 * The stores' translated failure messages.
 *
 * A store reports two kinds of failure. The host's typed `ApiError`
 * carries a message that is already operator-facing, and the store
 * surfaces it verbatim. Anything else — a transport error, a
 * malformed envelope — falls back to the store's own sentence, and
 * that sentence is the one a German operator reads.
 *
 * The fallback is asserted here because it is the only place in the
 * store where the message comes from the catalogue rather than from
 * the wire: a literal left behind in the source would render in
 * English and the extractor's rule 4 would not see it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setApi } from '../../src/api/client'
import { createPluginI18n } from '../../src/i18n'
import { useImagesStore } from '../../src/stores/images'
import { usePrincipalsStore } from '../../src/stores/principals'
import { useResourceStore } from '../../src/stores/resources'
import { useSourcesStore } from '../../src/stores/sources'
import type { PluginHostContext } from '../../src/shims'
import { createPinia, setActivePinia } from 'pinia'

/**
 * The failure a transport error carries.
 *
 * Not an `ApiError`, so it is what takes the catalogue's fallback
 * message rather than the host's own.
 */
const TRANSPORT_FAILURE = 'transport failed'

/**
 * An API whose every call fails with a plain `Error`.
 */
function failingApi(): PluginHostContext['api'] {
    const fail = (): Promise<never> => Promise.reject(new Error(TRANSPORT_FAILURE))
    return {
        get: fail,
        post: fail,
        put: fail,
        patch: fail,
        delete: fail,
    }
}

beforeEach(() => {
    setActivePinia(createPinia())
    // The stores translate through the module-level composer, so the
    // instance has to be re-seeded per test — `createPluginI18n` is
    // what sets it, and a test that switches to German must not
    // leak into the next one.
    createPluginI18n('en')
})

describe('stores/resources — translated failures', () => {
    it('translates the message of a failed template listing', async () => {
        setApi(failingApi())
        const store = useResourceStore()

        await store.loadTemplates()

        expect(store.error).toBe('Failed to load templates.')
    })

    it('translates the message of a failed upload', async () => {
        setApi(failingApi())
        const store = useResourceStore()

        expect(await store.uploadFont('Inter.otf', 'base64')).toBeNull()
        expect(store.error).toBe('Failed to upload font.')

        expect(await store.uploadTemplate('invoice.typ', 'content')).toBeNull()
        expect(store.error).toBe('Failed to upload template.')
    })

    it('translates the message of a failed delete', async () => {
        setApi(failingApi())
        const store = useResourceStore()

        await expect(store.removeFont('Inter.otf')).rejects.toThrow(TRANSPORT_FAILURE)
        expect(store.error).toBe('Failed to delete font.')

        await expect(store.removeTemplate('invoice.typ')).rejects.toThrow(TRANSPORT_FAILURE)
        expect(store.error).toBe('Failed to delete template.')

        await expect(store.removeExample('headings.typ')).rejects.toThrow(TRANSPORT_FAILURE)
        expect(store.error).toBe('Failed to delete example.')
    })
})

describe('stores/sources — translated failures', () => {
    it('translates the message of a failed open', async () => {
        setApi(failingApi())
        const store = useSourcesStore()

        expect(await store.openSource('src-1')).toBeNull()

        expect(store.error).toBe('Failed to open playground source.')
    })

    it('translates the message of a failed save', async () => {
        setApi(failingApi())
        const store = useSourcesStore()

        expect(await store.createSource('letter.typ', 'content')).toBeNull()
        expect(store.error).toBe('Failed to save playground source.')

        expect(await store.saveSource('src-1', 'content')).toBeNull()
        expect(store.error).toBe('Failed to save playground source.')
    })

    it('reads the message from the catalogue, so it follows the panel\'s language', async () => {
        // The point of the assertion: the message comes from the
        // catalogue, not from a literal left in the store. With the
        // German catalogue installed the operator reads German —
        // a literal would still read English.
        createPluginI18n('de')
        setApi(failingApi())
        const store = useSourcesStore()

        await store.saveSource('src-1', 'content')

        expect(store.error).toBe('Editor-Datei konnte nicht gespeichert werden.')
    })

    it('translates the message of a failed delete', async () => {
        setApi(failingApi())
        const store = useSourcesStore()

        await expect(store.removeSource('src-1')).rejects.toThrow(TRANSPORT_FAILURE)

        expect(store.error).toBe('Failed to delete playground source.')
    })
})

describe('stores/images — translated failures', () => {
    it('translates the message of a failed upload', async () => {
        setApi(failingApi())
        const store = useImagesStore()

        expect(await store.uploadImage('logo.png', 'image/png', 'base64')).toBeNull()

        expect(store.error).toBe('Failed to upload image.')
    })

    it('translates the message of a failed delete', async () => {
        setApi(failingApi())
        const store = useImagesStore()

        await expect(store.removeImage('logo.png')).rejects.toThrow(TRANSPORT_FAILURE)

        expect(store.error).toBe('Failed to delete image.')
    })
})

describe('stores/principals — translated failures', () => {
    it('translates the message of a failed listing', async () => {
        setApi(failingApi())
        const store = usePrincipalsStore()

        await store.loadPrincipals()

        expect(store.error).toBe('Failed to load principals.')
    })
})
