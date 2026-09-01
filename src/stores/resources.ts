/**
 * Pinia store for fonts + examples (tier-1 + tier-2 resources).
 *
 * The two resource kinds are administered through the same UI shape
 * (upload / list / delete), so we keep them in a single store to
 * avoid duplicating the loading-flag pattern across two stores. The
 * stores for images (which surface a different wire shape with id +
 * asset_url) live in `stores/images.ts`.
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { ApiError } from '../api/client'
import * as fontsApi from '../api/fonts'
import * as examplesApi from '../api/examples'
import type { FontResource, ExampleResource } from '../types'

export const useResourceStore = defineStore('typst-resources', () => {
    const fonts = ref<FontResource[]>([])
    const examples = ref<ExampleResource[]>([])
    const loading = ref(false)
    const uploading = ref(false)
    const error = ref<string | null>(null)
    // The principal the chip row is currently scoped to. Setter is
    // public so the page can wire `usePrincipalsStore.selectedPrincipalId`
    // into it.
    const principalId = ref<number | null>(null)

    function setPrincipalId(id: number | null): void {
        principalId.value = id
    }

    async function loadFonts(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            fonts.value = await fontsApi.listFonts(principalId.value ?? undefined)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load fonts.'
        } finally {
            loading.value = false
        }
    }

    async function loadExamples(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            examples.value = await examplesApi.listExamples(principalId.value ?? undefined)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load examples.'
        } finally {
            loading.value = false
        }
    }

    async function loadAll(): Promise<void> {
        await Promise.all([loadFonts(), loadExamples()])
    }

    // Re-fetch when the principal changes. `flush: 'post'` ensures
    // the watcher fires after the chip row's store update lands, not
    // mid-tick.
    watch(principalId, async () => {
        if (fonts.value.length > 0 || examples.value.length > 0) {
            await loadAll()
        }
    })

    async function uploadFont(name: string, content: string): Promise<FontResource | null> {
        uploading.value = true
        error.value = null
        try {
            const font = await fontsApi.uploadFont(name, content)
            fonts.value.push(font)
            return font
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload font.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function uploadExample(name: string, content: string): Promise<ExampleResource | null> {
        uploading.value = true
        error.value = null
        try {
            const example = await examplesApi.uploadExample(name, content)
            examples.value.push(example)
            return example
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload example.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function removeFont(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await fontsApi.deleteFont(name)
            fonts.value = fonts.value.filter((f) => f.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete font.'
            throw e
        } finally {
            uploading.value = false
        }
    }

    async function removeExample(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await examplesApi.deleteExample(name)
            examples.value = examples.value.filter((e) => e.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete example.'
            throw e
        } finally {
            uploading.value = false
        }
    }

    function clearError(): void {
        error.value = null
    }

    return {
        fonts,
        examples,
        loading,
        uploading,
        error,
        principalId,
        setPrincipalId,
        loadFonts,
        loadExamples,
        loadAll,
        uploadFont,
        uploadExample,
        removeFont,
        removeExample,
        clearError,
    }
})
