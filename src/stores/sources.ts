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
import { ref } from 'vue'
import { ApiError } from '../api/client'
import * as sourcesApi from '../api/sources'
import type { PlaygroundSource, PlaygroundSourceSummary } from '../types'

export const useSourcesStore = defineStore('typst-sources', () => {
    const sources = ref<PlaygroundSourceSummary[]>([])
    const loading = ref(false)
    const saving = ref(false)
    const error = ref<string | null>(null)

    async function loadSources(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            sources.value = await sourcesApi.listSources()
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load playground sources.'
        } finally {
            loading.value = false
        }
    }

    async function openSource(id: string): Promise<PlaygroundSource | null> {
        error.value = null
        try {
            return await sourcesApi.getSource(id)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to open playground source.'
            return null
        }
    }

    async function saveSource(id: string, content: string): Promise<PlaygroundSource | null> {
        saving.value = true
        error.value = null
        try {
            const saved = await sourcesApi.updateSource(id, content)
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
                        created_at: saved.created_at,
                        updated_at: saved.updated_at,
                    },
                    ...sources.value,
                ]
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
            await sourcesApi.deleteSource(id)
            sources.value = sources.value.filter((s) => s.id !== id)
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

    return {
        sources,
        loading,
        saving,
        error,
        loadSources,
        openSource,
        saveSource,
        removeSource,
        clearError,
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSourcesStore, import.meta.hot))
}
