/// <reference types="vite/client" />
/**
 * Pinia store for the playground's source-file pool.
 *
 * These are the `text/x-typst` rows the compile endpoint materialises
 * as a side-effect of compiling — `tool_name='typst.playground'`,
 * `mime_type='text/x-typst'`, `filename=<user-chosen>`. The store is
 * the bridge between {@see ../api/sources} and the open picker +
 * editor + delete buttons in the Playground tab.
 *
 * Why a separate store (and not folded into `resources.ts`): the
 * listing excludes `content` (body), the editor needs a separate
 * `getSource(id)` round-trip, and the lifecycle (open → edit → save
 * / delete) is its own state machine — distinct enough from
 * fonts/templates/examples that co-locating them would just bloat
 * the resources store.
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, watch } from 'vue'
import { ApiError } from '../api/client'
import * as sourcesApi from '../api/sources'
import type {
    PlaygroundSource,
    PlaygroundSourceKind,
    PlaygroundSourceSummary,
} from '../types'

export type SourcesKindFilter = PlaygroundSourceKind | 'all'

export const useSourcesStore = defineStore('typst-sources', () => {
    const sources = ref<PlaygroundSourceSummary[]>([])
    const loading = ref(false)
    const saving = ref(false)
    const error = ref<string | null>(null)
    // The principal the chip row is currently scoped to. Setter is
    // public so the page can wire `usePrincipalsStore.selectedPrincipalId`
    // into it. Mirrors the same shape as the resource and image
    // stores so the chip row's wiring is symmetric.
    const principalId = ref<number | null>(null)
    // The kind chip the picker is currently scoped to. The store
    // exposes the active kind plus the per-kind counts so the chip
    // row renders count badges without re-deriving on every click.
    // `all` (the default) is the union of the three pools.
    const kind = ref<SourcesKindFilter>('all')
    // Per-kind counts derived from the most recent unfiltered fetch.
    // Cached so chip switches don't trigger a per-kind network round
    // trip — the modal renders the badges from this snapshot and
    // filters the list client-side.
    const kindCounts = ref<Record<PlaygroundSourceKind, number>>({
        saved: 0,
        generated: 0,
        uploaded: 0,
        other: 0,
    })

    function setPrincipalId(id: number | null): void {
        principalId.value = id
    }

    function setKind(next: SourcesKindFilter): void {
        kind.value = next
    }

    async function loadSources(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            // Always fetch the union so the per-kind count badges
            // stay accurate even when the chip is narrowed. The
            // client-side filter then drops the rows that don't
            // match the active kind — cheaper than per-chip network
            // round trips and lets the chip switch stay instant.
            const fetched = await sourcesApi.listSources(principalId.value, 'all')
            sources.value = fetched
            recomputeKindCounts(fetched)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load playground sources.'
        } finally {
            loading.value = false
        }
    }

    /**
     * Walk the union fetch and tally each row by its backend-derived
     * `kind` so the chip row can show "Saved (3) · Generated (1) ·
     * Uploaded (0)" without re-deriving on every render. Kept as a
     * pure function so a future test can exercise it directly.
     */
    function recomputeKindCounts(rows: PlaygroundSourceSummary[]): void {
        const next: Record<PlaygroundSourceKind, number> = {
            saved: 0,
            generated: 0,
            uploaded: 0,
            other: 0,
        }
        for (const row of rows) {
            next[row.kind] += 1
        }
        kindCounts.value = next
    }

    async function openSource(id: string): Promise<PlaygroundSource | null> {
        error.value = null
        try {
            return await sourcesApi.getSource(id, principalId.value)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to open playground source.'
            return null
        }
    }

    /**
     * Persist a new playground source row without compiling. Used
     * by the editor's "Save" button when no source is currently
     * open (a fresh buffer). Returns the summary on success or
     * null on failure (the error message is set on `error.value`).
     *
     * The new row is prepended to `sources.value` so the open picker
     * reflects the freshly created file without a full reload, and
     * the per-kind count for its pool is incremented.
     */
    async function createSource(
        filename: string,
        content: string,
    ): Promise<PlaygroundSourceSummary | null> {
        saving.value = true
        error.value = null
        try {
            const created = await sourcesApi.createSource(filename, content, principalId.value)
            // Prepend so the most-recently-saved file surfaces first
            // in the picker; the existing ordering by updated_at
            // would also surface it on the next reload, but the
            // in-memory list wouldn't reflect it without this.
            sources.value = [created, ...sources.value.filter((s) => s.id !== created.id)]
            recomputeKindCounts(sources.value)
            return created
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to save playground source.'
            return null
        } finally {
            saving.value = false
        }
    }

    async function saveSource(id: string, content: string): Promise<PlaygroundSource | null> {
        saving.value = true
        error.value = null
        try {
            const saved = await sourcesApi.updateSource(id, content, principalId.value)
            // The saved row's summary needs to land in `sources.value`
            // so the picker reflects the new mtime; the in-memory
            // entry is updated in place to avoid a full reload.
            const idx = sources.value.findIndex((s) => s.id === id)
            if (idx >= 0) {
                const existing = sources.value[idx]
                if (existing !== undefined) {
                    sources.value[idx] = {
                        id: existing.id,
                        filename: existing.filename,
                        byte_size: saved.byte_size,
                        kind: existing.kind,
                        created_at: existing.created_at,
                        updated_at: saved.updated_at,
                    }
                }
            } else {
                // Source wasn't in the listing (e.g. just opened from
                // media archive without the picker mounted); add it.
                sources.value = [
                    {
                        id: saved.id,
                        filename: saved.filename,
                        byte_size: saved.byte_size,
                        kind: saved.kind,
                        created_at: saved.created_at,
                        updated_at: saved.updated_at,
                    },
                    ...sources.value,
                ]
                recomputeKindCounts(sources.value)
            }
            return saved
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to save playground source.'
            return null
        } finally {
            saving.value = false
        }
    }

    async function removeSource(id: string): Promise<void> {
        saving.value = true
        error.value = null
        try {
            await sourcesApi.deleteSource(id, principalId.value)
            sources.value = sources.value.filter((s) => s.id !== id)
            recomputeKindCounts(sources.value)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete playground source.'
            throw e
        } finally {
            saving.value = false
        }
    }

    function clearError(): void {
        error.value = null
    }

    // Re-fetch when the principal chip changes (mirrors the resource
    // and image stores). The watcher only kicks off a reload when
    // the listing is already populated so the initial mount of the
    // Playground doesn't trigger a double-load.
    watch(principalId, async () => {
        if (sources.value.length > 0) {
            await loadSources()
        }
    })

    return {
        sources,
        loading,
        saving,
        error,
        principalId,
        kind,
        kindCounts,
        setPrincipalId,
        setKind,
        loadSources,
        openSource,
        createSource,
        saveSource,
        removeSource,
        clearError,
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSourcesStore, import.meta.hot))
}
