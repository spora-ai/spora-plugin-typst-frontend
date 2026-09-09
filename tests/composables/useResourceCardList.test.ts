/**
 * Tests for the resource-card-list composable that backs the
 * Templates and Examples cards (and the `<ResourceCardList>`
 * wrapper component).
 *
 * The composable's contract post-overlay-refactor:
 *   - Source cache: ensureSource(name) lazy-fetches, short-circuits
 *     on cache hit, surfaces loading + error flags.
 *   - Render cache: renderExample(name, content) calls
 *     `/preview` via the store and stores the decoded blob URL.
 *   - Delete: confirmAndDelete(name) clears source + render caches.
 *
 * Per-kind API plumbing (getTemplate vs getExample) is the
 * primary seam the tests pin down — the rest is bookkeeping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

import { useResourceStore } from '../../src/stores/resources'
import { ApiError } from '../../src/api/client'
import {
    useResourceCardList,
    type ResourceSummary,
} from '../../src/composables/useResourceCardList'

// Stub the API modules so the composable's source-fetch path is
// deterministic and we can assert which kind-of-fetch was issued.
// `vi.importActual` keeps the rest of each module (list, upload,
// delete) untouched so the resource store, which uses them, still
// resolves cleanly when tests seed templates/examples via Pinia.
vi.mock('../../src/api/templates', async () => {
    const actual = await vi.importActual<typeof import('../../src/api/templates')>(
        '../../src/api/templates',
    )
    return { ...actual, getTemplate: vi.fn() }
})
vi.mock('../../src/api/examples', async () => {
    const actual = await vi.importActual<typeof import('../../src/api/examples')>(
        '../../src/api/examples',
    )
    return { ...actual, getExample: vi.fn() }
})

import { getTemplate } from '../../src/api/templates'
import { getExample } from '../../src/api/examples'

function summary(overrides: Partial<ResourceSummary>): ResourceSummary {
    return {
        name: overrides.name ?? 'x.typ',
        size: overrides.size ?? 100,
        origin: overrides.origin ?? 'principal',
    }
}

beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getTemplate).mockReset()
    vi.mocked(getExample).mockReset()
    // The composable registers an onMounted hook for the auto-load
    // trigger; tests that don't mount a component still want to call
    // the composable, and that emits the no-active-instance warning.
    // The hook is a no-op outside an instance — silence just the
    // message so the test output stays clean.
    if (!('__sporaVueWarnSilenced__' in console)) {
        const original = console.warn.bind(console)
        console.warn = (...args: unknown[]) => {
            const first = args[0]
            if (typeof first === 'string' && first.includes('Lifecycle injection APIs can only be used during execution of setup()')) {
                return
            }
            original(...(args as Parameters<typeof original>))
        }
        // eslint-disable-next-line no-underscore-dangle
        ;(console as unknown as { __sporaVueWarnSilenced__: true }).__sporaVueWarnSilenced__ = true
    }
})

afterEach(() => {
    vi.restoreAllMocks()
    // Restore the confirm stub from the confirmAndDelete tests.
    // happy-dom doesn't ship window.confirm, so the tests assign
    // a stub directly; without this reset, a leak into the next
    // test would suppress real confirm() calls.
    delete (window as unknown as { confirm?: unknown }).confirm
})

describe('useResourceCardList — initial state', () => {
    it('starts with empty source + render caches', () => {
        const c = useResourceCardList('template')
        expect(c.sourceByName.value).toEqual({})
        expect(c.renderedByName.value).toEqual({})
        expect(c.loadingName.value).toBeNull()
        expect(c.loadError.value).toBeNull()
        expect(c.renderError.value).toBeNull()
        expect(c.renderingName.value).toBeNull()
    })

    it('hasItems mirrors the store collection length', () => {
        const store = useResourceStore()
        store.templates = [summary({ name: 'a.typ' }) as never] as never
        const c = useResourceCardList('template')
        expect(c.hasItems.value).toBe(true)

        store.templates = [] as never
        expect(c.hasItems.value).toBe(false)
    })

    it('partitions store entries into principal + skill sorted by name', () => {
        const store = useResourceStore()
        // Deliberately unsorted on insert; the composable sorts.
        store.templates = [
            summary({ name: 'zeta.typ', origin: 'principal' }),
            summary({ name: 'alpha.typ', origin: 'skill' }),
            summary({ name: 'beta.typ',  origin: 'principal' }),
            summary({ name: 'mu.typ',    origin: 'skill' }),
        ] as never

        const c = useResourceCardList('template')
        expect(c.principalItems.value.map((t) => t.name)).toEqual(['beta.typ', 'zeta.typ'])
        expect(c.skillItems.value.map((t) => t.name)).toEqual(['alpha.typ', 'mu.typ'])
    })
})

describe('useResourceCardList — ensureSource', () => {
    it('fetches the source via the kind-specific API and caches it', async () => {
        vi.mocked(getTemplate).mockResolvedValueOnce('= hello')

        const c = useResourceCardList('template')
        await c.ensureSource('a.typ')

        expect(getTemplate).toHaveBeenCalledTimes(1)
        expect(getTemplate).toHaveBeenCalledWith('a.typ')
        expect(c.sourceByName.value['a.typ']).toBe('= hello')
        expect(c.loadingName.value).toBeNull()
    })

    it('uses getExample when the kind is "example"', async () => {
        vi.mocked(getExample).mockResolvedValueOnce('#let x = 1')

        const c = useResourceCardList('example')
        await c.ensureSource('snippet.typ')

        expect(getExample).toHaveBeenCalledWith('snippet.typ')
        expect(getTemplate).not.toHaveBeenCalled()
        expect(c.sourceByName.value['snippet.typ']).toBe('#let x = 1')
    })

    it('does NOT re-fetch when the source is already cached', async () => {
        vi.mocked(getTemplate).mockResolvedValue('first')

        const c = useResourceCardList('template')
        await c.ensureSource('a.typ')
        await c.ensureSource('a.typ')
        await c.ensureSource('a.typ')

        expect(getTemplate).toHaveBeenCalledTimes(1)
    })

    it('records the error message and clears loading on a failed fetch', async () => {
        vi.mocked(getTemplate).mockRejectedValueOnce(new Error('boom'))

        const c = useResourceCardList('template')
        await c.ensureSource('a.typ')

        expect(c.loadError.value).toBe('failed to read template')
        expect(c.loadingName.value).toBeNull()
        expect(c.sourceByName.value['a.typ']).toBeUndefined()
    })

    it('prefers the server-supplied ApiError.message over the fallback', async () => {
        vi.mocked(getTemplate).mockRejectedValueOnce(
            new ApiError('server-said-no', 'NOPE', 422),
        )

        const c = useResourceCardList('template')
        await c.ensureSource('a.typ')

        expect(c.loadError.value).toBe('server-said-no')
    })
})

describe('useResourceCardList — confirmAndDelete', () => {
    // happy-dom doesn't ship `window.confirm`, so set up a stub
    // manually per-test and tear it down via afterEach above.
    let originalConfirm: typeof window.confirm

    beforeEach(() => {
        originalConfirm = window.confirm
    })
    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).confirm = originalConfirm
    })

    it('aborts when the confirm prompt is dismissed', async () => {
        const confirmSpy = vi.fn().mockReturnValue(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).confirm = confirmSpy
        const removeSpy = vi.fn()

        const c = useResourceCardList('template')
        // The composable captures `remove` via the store closure;
        // we patch the store to make this assertion-side deterministic.
        const store = useResourceStore()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(store as any).removeTemplate = removeSpy

        await c.confirmAndDelete('a.typ')

        expect(confirmSpy).toHaveBeenCalledWith('Delete template "a.typ"? This cannot be undone.')
        expect(removeSpy).not.toHaveBeenCalled()
    })

    it('clears the source cache for the deleted name when the user confirms', async () => {
        const confirmSpy = vi.fn().mockReturnValue(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).confirm = confirmSpy
        const removeSpy = vi.fn().mockResolvedValue(undefined)
        const store = useResourceStore()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(store as any).removeTemplate = removeSpy

        const c = useResourceCardList('template')
        c.sourceByName.value = { 'a.typ': 'x', 'b.typ': 'y' }

        await c.confirmAndDelete('a.typ')

        expect(confirmSpy).toHaveBeenCalled()
        expect(removeSpy).toHaveBeenCalledWith('a.typ')
        expect(c.sourceByName.value['a.typ']).toBeUndefined()
        expect(c.sourceByName.value['b.typ']).toBe('y')
    })

    it('uses store.removeExample when kind is "example"', async () => {
        const confirmSpy = vi.fn().mockReturnValue(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).confirm = confirmSpy
        const removeSpy = vi.fn().mockResolvedValue(undefined)
        const store = useResourceStore()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(store as any).removeExample = removeSpy

        const c = useResourceCardList('example')
        await c.confirmAndDelete('snippet.typ')

        expect(confirmSpy).toHaveBeenCalledWith('Delete example "snippet.typ"? This cannot be undone.')
        expect(removeSpy).toHaveBeenCalledWith('snippet.typ')
    })
})

describe('useResourceCardList — formatBytes', () => {
    it('renders bytes, KiB, and MiB tiers', () => {
        const c = useResourceCardList('template')
        expect(c.formatBytes(0)).toBe('0 B')
        expect(c.formatBytes(1023)).toBe('1023 B')
        expect(c.formatBytes(1024)).toBe('1.0 KiB')
        expect(c.formatBytes(1024 * 1.5)).toBe('1.5 KiB')
        expect(c.formatBytes(1024 * 1024)).toBe('1.00 MiB')
        expect(c.formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MiB')
    })
})

describe('useResourceCardList — onMounted auto-load', () => {
    // The composable registers an onMounted hook that triggers
    // load when the store's collection for this kind is empty.
    // It only fires inside a real component instance, so we mount
    // a tiny harness that returns the composable's bindings and
    // assert against the store's loading flag.
    it('kicks off store.loadTemplates when templates is empty', async () => {
        const Harness = defineComponent({
            // Call the composable from setup() so onMounted registers.
            // The returned state is unused here; we only want the
            // side-effect of registering the auto-load hook.
            setup() {
                useResourceCardList('template')
                return () => h('div')
            },
        })

        // Pre-stub loadTemplates so the call doesn't actually fire
        // a network request.
        const loadSpy = vi.fn().mockResolvedValue({ templates: [] })
        setActivePinia(createPinia())
        const store = useResourceStore()
        store.loadTemplates = loadSpy

        mount(Harness)
        await flushPromises()

        expect(loadSpy).toHaveBeenCalled()
    })

    it('does not reload when templates is already populated', async () => {
        const Harness = defineComponent({
            setup: () => () => h('div'),
        })
        const loadSpy = vi.fn()
        setActivePinia(createPinia())
        const store = useResourceStore()
        store.templates = [summary({ name: 'preexisting.typ' }) as never] as never
        store.loadTemplates = loadSpy

        mount(Harness)
        await flushPromises()

        expect(loadSpy).not.toHaveBeenCalled()
    })
})

describe('useResourceCardList — example render', () => {
    // The store's `renderExample` bridge is added in a separate
    // commit; the tests patch it onto the store directly so the
    // composable's cast-based access resolves to a controlled
    // stub. The composable decodes the base64 payload into a Blob
    // and stores the resulting objectURL keyed by name.

    const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8//8/AwAI/AL+Sj0G6AAAAABJRU5ErkJggg=='

    function patchStoreRender(impl: (n: string, c: string, f: string, p: number) => Promise<unknown>): void {
        const store = useResourceStore()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(store as any).renderExample = vi.fn().mockImplementation(impl)
    }

    it('starts with empty renderedByName and null renderError', () => {
        const c = useResourceCardList('example')
        expect(c.renderedByName.value).toEqual({})
        expect(c.renderError.value).toBeNull()
        expect(c.renderingName.value).toBeNull()
    })

    it('renderExample stores a blobUrl + mime + format keyed by name', async () => {
        patchStoreRender(async (name) => ({
            bytes: PNG_1X1_BASE64,
            mime: 'image/png',
            format: 'png',
            source_name: name,
            width: 1,
            height: 1,
        }))

        const c = useResourceCardList('example')
        await c.renderExample('snippet.typ', '= hi')

        const cached = c.renderedByName.value['snippet.typ']
        expect(cached).toBeDefined()
        expect(cached!.format).toBe('png')
        expect(cached!.mime).toBe('image/png')
        expect(cached!.width).toBe(1)
        expect(cached!.height).toBe(1)
        expect(cached!.blobUrl).toMatch(/^blob:/)
        expect(c.renderError.value).toBeNull()
        expect(c.renderingName.value).toBeNull()
    })

    it('renderExample asks the store for png @ 144 ppi', async () => {
        const renderSpy = vi.fn().mockResolvedValue({
            bytes: PNG_1X1_BASE64,
            mime: 'image/png',
            format: 'png',
            source_name: 'snippet.typ',
            width: 1,
            height: 1,
        })
        patchStoreRender(renderSpy)

        const c = useResourceCardList('example')
        await c.renderExample('snippet.typ', '= hi')

        expect(renderSpy).toHaveBeenCalledWith('snippet.typ', '= hi', 'png', 144)
    })

    it('renderExample sets renderError when the store rejects with ApiError', async () => {
        patchStoreRender(async () => {
            throw new ApiError('compile-failed', 'COMPILE_ERROR', 422)
        })

        const c = useResourceCardList('example')
        await c.renderExample('snippet.typ', '= broken')

        expect(c.renderError.value).toBe('compile-failed')
        expect(c.renderedByName.value['snippet.typ']).toBeUndefined()
        expect(c.renderingName.value).toBeNull()
    })

    it('renderExample sets a fallback renderError when the store rejects with a plain Error', async () => {
        patchStoreRender(async () => {
            throw new Error('boom')
        })

        const c = useResourceCardList('example')
        await c.renderExample('snippet.typ', '= broken')

        expect(c.renderError.value).toBe('failed to render example')
    })

    it('clearRender removes the cached entry', async () => {
        patchStoreRender(async (name) => ({
            bytes: PNG_1X1_BASE64,
            mime: 'image/png',
            format: 'png',
            source_name: name,
            width: 1,
            height: 1,
        }))

        const c = useResourceCardList('example')
        await c.renderExample('a.typ', '= a')
        expect(c.renderedByName.value['a.typ']).toBeDefined()

        c.clearRender('a.typ')
        expect(c.renderedByName.value['a.typ']).toBeUndefined()
    })

    it('clearRender is a no-op for an unknown name', () => {
        const c = useResourceCardList('example')
        // Should not throw or mutate state.
        c.clearRender('never-rendered.typ')
        expect(c.renderedByName.value).toEqual({})
    })
})
