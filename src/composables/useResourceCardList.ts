import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import type { PreviewResult } from '../api/preview'
import { getExample } from '../api/examples'
import { getTemplate } from '../api/templates'
import { highlightTypst } from 'highlightjs-typst/highlight'
import { useResourceStore } from '../stores/resources'

export type ResourceKind = 'template' | 'example'

export interface ResourceSummary {
    name: string
    size: number
    origin: 'principal' | 'skill'
}

/**
 * One rendered preview cache entry. `format` mirrors the API
 * envelope's union (`'pdf' | 'png' | 'svg'`) so the template's
 * `format === 'png'` / `'svg'` / `'pdf'` branch narrows without
 * a cast.
 */
export interface RenderedPreview {
    blobUrl: string
    mime: string
    format: 'pdf' | 'png' | 'svg'
    width: number | null
    height: number | null
}

/**
 * Format a byte count for the card's `{{ formatBytes(size) }}` slot.
 * Hoisted to module scope because it doesn't read any composable
 * closure and re-creating on every `useResourceCardList()` call
 * would just churn. The output tiers mirror the format used
 * elsewhere in the admin SPA.
 */
function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / (1024 * 1024)).toFixed(2)} MiB`
}

/**
 * Decode the base64 payload `POST /typst/preview` returns into a
 * `Blob` so we can hand the bytes to `<img src>` / `<a href>` via
 * a transient objectURL. `atob` operates on a binary string, so
 * we walk each char and push its byte value into the Uint8Array.
 * Keeps the conversion in one place — the cache only stores
 * objectURLs, not raw base64.
 */
function base64ToBlob(base64: string, mime: string): Blob {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
        arr[i] = bytes.charCodeAt(i)
    }
    return new Blob([arr], { type: mime })
}

/**
 * Card-grid logic shared by the Templates and Examples panels.
 *
 * `openNames` mirrors the browser-native `<details>` state via the
 * `toggle` event; we deliberately do NOT bind `:open` because that
 * ping-pongs with `@toggle` and visibly flickers as soon as two
 * cards are open at once. The Set drives only the
 * `md:col-span-2` layout and a one-shot first-open fetch.
 *
 * Returns plain Vue refs so callers can destructure into templates
 * or pass them down as props to a child card component.
 */
export function useResourceCardList(kind: ResourceKind) {
    const store = useResourceStore()
    const fetchSource = kind === 'template' ? getTemplate : getExample
    const remove = kind === 'template'
        ? (n: string) => store.removeTemplate(n)
        : (n: string) => store.removeExample(n)
    const collect = (): ResourceSummary[] => (
        (kind === 'template' ? store.templates : store.examples) ?? []
    ) as ResourceSummary[]
    const reload = (): Promise<unknown> => (
        kind === 'template' ? store.loadTemplates() : store.loadExamples()
    )

    const openNames = ref<Set<string>>(new Set())
    const sourceByName = ref<Record<string, string>>({})
    const highlightedByName = ref<Record<string, string>>({})
    const loadingName = ref<string | null>(null)
    const loadError = ref<string | null>(null)

    const editingName = ref<string | null>(null)
    const renderingName = ref<string | null>(null)
    const renderError = ref<string | null>(null)
    const renderedByName = ref<Record<string, RenderedPreview>>({})

    function startEdit(name: string): void {
        editingName.value = name
    }

    function cancelEdit(): void {
        editingName.value = null
    }

    function clearRender(name: string): void {
        const prev = renderedByName.value[name]
        if (prev === undefined) return
        // Revoke the objectURL so the underlying Blob can be GC'd;
        // without this, repeated renders on the same name accumulate
        // Blob memory until the page reloads.
        URL.revokeObjectURL(prev.blobUrl)
        const next = { ...renderedByName.value }
        delete next[name]
        renderedByName.value = next
    }

    async function renderExample(name: string, content: string): Promise<void> {
        renderingName.value = name
        renderError.value = null
        try {
            // The store's `renderExample` bridge hits `/typst/preview`
            // and returns a `PreviewResult` (base64 bytes + mime +
            // format + dims). The store-level indirection keeps the
            // composable out of the api/* module graph so the
            // components can render without dragging the network
            // client in.
            //
            // `renderExample` is added to the resource store in a
            // separate commit; this composable reaches it via a
            // narrow cast so the surface stays strictly typed
            // without leaking the field into the store's public
            // type before that commit lands.
            type PreviewRender = (
                n: string,
                c: string,
                f: 'pdf' | 'png' | 'svg',
                p: number,
            ) => Promise<PreviewResult>
            const preview = (store as unknown as { renderExample: PreviewRender })
            const result = await preview.renderExample(name, content, 'png', 144)
            const blob = base64ToBlob(result.bytes, result.mime)
            const blobUrl = URL.createObjectURL(blob)
            // Replace any previous render for this name so the
            // objectURL → Blob mapping stays 1:1; the previous URL
            // is revoked below so it can be reclaimed.
            const prev = renderedByName.value[name]
            renderedByName.value = {
                ...renderedByName.value,
                [name]: {
                    blobUrl,
                    mime: result.mime,
                    format: result.format,
                    width: result.width,
                    height: result.height,
                },
            }
            if (prev !== undefined) URL.revokeObjectURL(prev.blobUrl)
        } catch (e) {
            renderError.value = e instanceof ApiError ? e.message : 'failed to render example'
        } finally {
            renderingName.value = null
        }
    }

    function onToggle(name: string, event: Event): void {
        const target = event.target as HTMLDetailsElement
        const wasOpen = openNames.value.has(name)
        const next = new Set(openNames.value)
        if (target.open) next.add(name)
        else next.delete(name)
        openNames.value = next
        if (target.open && !wasOpen) {
            // First expand only — `sourceByName` cache skips re-opens.
            void ensureSource(name)
        }
    }

    async function ensureSource(name: string): Promise<void> {
        if (sourceByName.value[name] !== undefined) return
        loadingName.value = name
        loadError.value = null
        try {
            const source = await fetchSource(name)
            sourceByName.value = { ...sourceByName.value, [name]: source }
            highlightedByName.value = {
                ...highlightedByName.value,
                [name]: highlightTypst(source),
            }
        } catch (e) {
            loadError.value = e instanceof ApiError ? e.message : `failed to read ${kind}`
        } finally {
            loadingName.value = null
        }
    }

    async function confirmAndDelete(name: string): Promise<void> {
        if (!confirm(`Delete ${kind} "${name}"? This cannot be undone.`)) return
        try {
            await remove(name)
            const nextSource = { ...sourceByName.value }
            delete nextSource[name]
            sourceByName.value = nextSource
            const nextHighlighted = { ...highlightedByName.value }
            delete nextHighlighted[name]
            highlightedByName.value = nextHighlighted
            if (openNames.value.has(name)) {
                const nextOpen = new Set(openNames.value)
                nextOpen.delete(name)
                openNames.value = nextOpen
            }
            // A deleted example's cached render is also orphaned —
            // the Blob is now detached from any on-disk artifact.
            clearRender(name)
        } catch {
            // store.error already populated
        }
    }

    // Stable sort keeps the order from jittering when the store
    // re-fetches, which would otherwise re-order by server-side
    // insertion order on each refresh.
    const sortedItems = computed(() =>
        collect()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name)),
    )
    const principalItems = computed(() =>
        sortedItems.value.filter((t) => t.origin === 'principal'),
    )
    const skillItems = computed(() =>
        sortedItems.value.filter((t) => t.origin === 'skill'),
    )
    const hasItems = computed(() => collect().length > 0)

    onMounted(() => {
        if (collect().length === 0) void reload()
    })

    return {
        openNames,
        sourceByName,
        highlightedByName,
        loadingName,
        loadError,
        principalItems,
        skillItems,
        hasItems,
        formatBytes,
        onToggle,
        ensureSource,
        confirmAndDelete,
        editingName,
        startEdit,
        cancelEdit,
        renderingName,
        renderError,
        renderedByName,
        renderExample,
        clearRender,
    }
}
