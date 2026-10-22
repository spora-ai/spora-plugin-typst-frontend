/**
 * The stores' translated failure messages.
 *
 * A store reports two kinds of failure. A failure that is an
 * `ApiError` carries a message that is already operator-facing, and
 * the store surfaces it verbatim. Anything else — a transport error, a
 * malformed envelope — falls back to the store's own sentence, and
 * that sentence is the one a German operator reads.
 *
 * `ApiError` is the plugin's own class (see `src/api/client.ts`): the
 * host's client throws the host's class, so a host call always takes
 * the catalogue's sentence. The typed branch is what `fetchText` — the
 * template / example source read — produces.
 *
 * The fallback is asserted here because it is the only place in the
 * store where the message comes from the catalogue rather than from
 * the wire: a literal left behind in the source would render in
 * English and the extractor's rule 4 would not see it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setApi, ApiError } from '../../src/api/client'
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
 * message rather than the typed one.
 */
const TRANSPORT_FAILURE = 'transport failed'

/** The failure an `ApiError` carries. */
const WIRE_FAILURE = 'the server said no'

/**
 * An API whose every call fails with the given reason.
 */
function failingApi(reason: unknown): PluginHostContext['api'] {
    const fail = (): Promise<never> => Promise.reject(reason)
    return {
        get: fail,
        post: fail,
        put: fail,
        patch: fail,
        delete: fail,
    }
}

/**
 * Run a store operation against both kinds of failure.
 *
 * The catch block branches on `e instanceof ApiError`: a typed
 * failure keeps its own message, anything else falls back to the
 * catalogue's sentence. Both branches have to run for the branch to
 * be covered.
 */
async function expectBothMessages(
    store: { error: string | null },
    operation: () => Promise<unknown>,
    catalogueMessage: string,
): Promise<void> {
    setApi(failingApi(new ApiError(WIRE_FAILURE, 'WIRE', 502)))
    await operation().catch(() => undefined)
    expect(store.error).toBe(WIRE_FAILURE)

    setApi(failingApi(new Error(TRANSPORT_FAILURE)))
    await operation().catch(() => undefined)
    expect(store.error).toBe(catalogueMessage)
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
    it('reports a failed listing', async () => {
        const store = useResourceStore()

        await expectBothMessages(store, () => store.loadFonts(), 'Failed to load fonts.')
        await expectBothMessages(store, () => store.loadTemplates(), 'Failed to load templates.')
        await expectBothMessages(store, () => store.loadExamples(), 'Failed to load examples.')
    })

    it('reports a failed upload', async () => {
        const store = useResourceStore()

        await expectBothMessages(store, () => store.uploadFont('Inter.otf', 'base64'), 'Failed to upload font.')
        await expectBothMessages(
            store,
            () => store.uploadTemplate('invoice.typ', 'content'),
            'Failed to upload template.',
        )
        await expectBothMessages(
            store,
            () => store.uploadExample('headings.typ', 'content'),
            'Failed to upload example.',
        )
    })

    it('reports a failed update', async () => {
        const store = useResourceStore()

        await expectBothMessages(
            store,
            () => store.updateTemplate('invoice.typ', 'content'),
            'Failed to update template.',
        )
        await expectBothMessages(
            store,
            () => store.updateExample('headings.typ', 'content'),
            'Failed to update example.',
        )
    })

    it('reports a failed preview', async () => {
        const store = useResourceStore()

        await expectBothMessages(
            store,
            () => store.renderExample('headings.typ', '= hi'),
            'Failed to render example preview.',
        )
    })

    it('reports a failed delete', async () => {
        const store = useResourceStore()

        await expectBothMessages(store, () => store.removeFont('Inter.otf'), 'Failed to delete font.')
        await expectBothMessages(store, () => store.removeTemplate('invoice.typ'), 'Failed to delete template.')
        await expectBothMessages(store, () => store.removeExample('headings.typ'), 'Failed to delete example.')
    })
})

describe('stores/sources — translated failures', () => {
    it('reports a failed listing', async () => {
        const store = useSourcesStore()

        await expectBothMessages(store, () => store.loadSources(), 'Failed to load playground sources.')
    })

    it('reports a failed open', async () => {
        const store = useSourcesStore()

        await expectBothMessages(store, () => store.openSource('src-1'), 'Failed to open playground source.')
    })

    it('reports a failed save', async () => {
        const store = useSourcesStore()

        await expectBothMessages(
            store,
            () => store.createSource('letter.typ', 'content'),
            'Failed to save playground source.',
        )
        await expectBothMessages(
            store,
            () => store.saveSource('src-1', 'content'),
            'Failed to save playground source.',
        )
    })

    it('reports a failed delete', async () => {
        const store = useSourcesStore()

        await expectBothMessages(store, () => store.removeSource('src-1'), 'Failed to delete playground source.')
    })

    it('reads the message from the catalogue, so it follows the panel\'s language', async () => {
        // The point of the assertion: the message comes from the
        // catalogue, not from a literal left in the store. With the
        // German catalogue installed the operator reads German —
        // a literal would still read English.
        createPluginI18n('de')
        setApi(failingApi(new Error(TRANSPORT_FAILURE)))
        const store = useSourcesStore()

        await store.saveSource('src-1', 'content')

        expect(store.error).toBe('Editor-Datei konnte nicht gespeichert werden.')
    })
})

describe('stores/images — translated failures', () => {
    it('reports a failed listing', async () => {
        const store = useImagesStore()

        await expectBothMessages(store, () => store.loadImages(), 'Failed to load images.')
    })

    it('reports a failed upload', async () => {
        const store = useImagesStore()

        await expectBothMessages(
            store,
            () => store.uploadImage('logo.png', 'image/png', 'base64'),
            'Failed to upload image.',
        )
    })

    it('reports a failed delete', async () => {
        const store = useImagesStore()

        await expectBothMessages(store, () => store.removeImage('logo.png'), 'Failed to delete image.')
    })
})

describe('stores/principals — translated failures', () => {
    it('reports a failed listing', async () => {
        const store = usePrincipalsStore()

        await expectBothMessages(store, () => store.loadPrincipals(), 'Failed to load principals.')
    })
})
