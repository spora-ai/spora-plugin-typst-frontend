import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { getExample } from '../api/examples'
import { getTemplate } from '../api/templates'
import { t } from '../i18n'
import { useResourceStore } from '../stores/resources'

export type ResourceKind = 'template' | 'example'

/**
 * The message the overlay shows when a source cannot be read.
 *
 * The kind is part of the sentence, so each kind gets its own message
 * rather than a concatenated label.
 */
function readErrorMessage(kind: ResourceKind): string {
    return kind === 'template'
        ? t('failed to read template')
        : t('failed to read example')
}

export interface ResourceSummary {
    name: string
    size: number
    origin: 'principal' | 'skill'
}

/**
 * One rendered preview cache entry — the decoded Blob URL form of the
 * store's `RenderExampleResult` (`PreviewResult`, aliased in
 * `stores/resources.ts`). `format` mirrors the API envelope's union so
 * the two shapes stay in step.
 */
export interface RenderedPreview {
    blobUrl: string
    mime: string
    format: 'pdf' | 'png' | 'svg'
    width: number | null
    height: number | null
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / (1024 * 1024)).toFixed(2)} MiB`
}

/**
 * Decode the base64 payload `POST /typst/preview` returns into a
 * `Blob` so we can hand the bytes to `<img src>` / `<a href>` via a
 * transient objectURL. `atob` operates on a binary string, so each char
 * is walked and its byte value pushed into the Uint8Array.
 *
 * Keeps the conversion in one place — the cache only stores objectURLs,
 * not raw base64.
 */
function base64ToBlob(base64: string, mime: string): Blob {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
        // codePointAt (not charCodeAt) so multi-byte UTF-8 sequences
        // decoded from base64 round-trip correctly when the
        // preview payload contains non-ASCII bytes. Sonar S7758.
        arr[i] = bytes.codePointAt(i) ?? 0
    }
    return new Blob([arr], { type: mime })
}

/**
 * Card-grid data layer shared by the Templates and Examples panels:
 * the per-name source cache, the per-name render cache, and the
 * loading / error flags the card grid and the overlay read.
 *
 * Returns plain Vue refs so callers can destructure into templates or
 * pass them down as props to a child component.
 */
export function useResourceCardList(kind: ResourceKind) {
    const store = useResourceStore()
    const fetchSource: (name: string, principalId?: number) => Promise<string> =
        kind === 'template' ? getTemplate : getExample
    const remove = kind === 'template'
        ? (n: string) => store.removeTemplate(n)
        : (n: string) => store.removeExample(n)
    const collect = (): ResourceSummary[] => (
        (kind === 'template' ? store.templates : store.examples) ?? []
    ) as ResourceSummary[]
    const reload = (): Promise<unknown> => (
        kind === 'template' ? store.loadTemplates() : store.loadExamples()
    )

    const sourceByName = ref<Record<string, string>>({})
    const loadingName = ref<string | null>(null)
    const loadError = ref<string | null>(null)

    const renderingName = ref<string | null>(null)
    const renderError = ref<string | null>(null)
    const renderedByName = ref<Record<string, RenderedPreview>>({})

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
            // and returns the raw `RenderExampleResult` — an alias
            // of `PreviewResult`, so the two shapes stay in step.
            const result = await store.renderExample(name, content, 'png', 144)
            if (result === null) {
                renderError.value = store.error ?? t('failed to render example')
                return
            }
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
            renderError.value = e instanceof ApiError ? e.message : t('failed to render example')
        } finally {
            renderingName.value = null
        }
    }

    async function ensureSource(name: string): Promise<void> {
        if (sourceByName.value[name] !== undefined) return
        loadingName.value = name
        loadError.value = null
        try {
            // Thread the store's current principalId — without it,
            // GETs land in the caller's user-principal and a
            // template uploaded to another principal surfaces as
            // 404 NOT_FOUND ("Principal not visible to caller") in
            // the overlay. The list call passes it, the per-name
            // read used to forget it.
            const source = await fetchSource(name, store.principalId ?? undefined)
            sourceByName.value = { ...sourceByName.value, [name]: source }
        } catch (e) {
            loadError.value = e instanceof ApiError ? e.message : readErrorMessage(kind)
        } finally {
            loadingName.value = null
        }
    }

    async function confirmAndDelete(name: string): Promise<void> {
        const question = kind === 'template'
            ? t('Delete template "{name}"? This cannot be undone.', { name })
            : t('Delete example "{name}"? This cannot be undone.', { name })
        if (!confirm(question)) return
        try {
            await remove(name)
            const nextSource = { ...sourceByName.value }
            delete nextSource[name]
            sourceByName.value = nextSource
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
        sourceByName,
        loadingName,
        loadError,
        principalItems,
        skillItems,
        hasItems,
        formatBytes,
        ensureSource,
        confirmAndDelete,
        renderingName,
        renderError,
        renderedByName,
        renderExample,
        clearRender,
    }
}
