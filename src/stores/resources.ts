/// <reference types="vite/client" />
/**
 * Pinia store for fonts + templates + examples (tier-1 + tier-2
 * filesystem resources).
 *
 * Three resource kinds share the same UI shape (upload / list /
 * delete), so we keep them in a single store to avoid duplicating
 * the loading-flag pattern across three stores. Images live in
 * `stores/images.ts` because they have a fundamentally different wire
 * shape (filesystem-backed with raw bytes vs. UTF-8 source text).
 *
 * `acceptHMRUpdate` is wired at the bottom so a store rename (e.g.
 * `examples` → `templates`) triggers a full module reload instead of
 * silently keeping the old state — otherwise long-running dev sessions
 * see `store.templates` resolve to `undefined` because the cached
 * store instance was created with the previous shape.
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, watch } from 'vue'
import { ApiError } from '../api/client'
import * as fontsApi from '../api/fonts'
import * as templatesApi from '../api/templates'
import * as examplesApi from '../api/examples'
import * as previewApi from '../api/preview'
import type { PreviewResult } from '../api/preview'
import type { FontResource, TemplateResource, ExampleResource } from '../types'

/**
 * Inline render result for the example-card "render preview"
 * action. Aliased from the API client's wire type so the shape
 * stays in sync — a field added on one side now shows up on the
 * other automatically, and the composable's cast (which used to
 * hide the type mismatch between store + client) goes away.
 *
 * Kept as a separate export name so existing imports keep working
 * and the store doesn't leak the `preview` API client's path into
 * component imports (`import { RenderExampleResult } from
 * '../stores/resources'` reads better than reaching into the api
 * module).
 */
export type { PreviewResult as RenderExampleResult } from '../api/preview'

export const useResourceStore = defineStore('typst-resources', () => {
    const fonts = ref<FontResource[]>([])
    const templates = ref<TemplateResource[]>([])
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
            hasLoadedOnce = true
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load fonts.'
        } finally {
            loading.value = false
        }
    }

    async function loadTemplates(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            templates.value = await templatesApi.listTemplates(principalId.value ?? undefined)
            hasLoadedOnce = true
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load templates.'
        } finally {
            loading.value = false
        }
    }

    async function loadExamples(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            examples.value = await examplesApi.listExamples(principalId.value ?? undefined)
            hasLoadedOnce = true
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load examples.'
        } finally {
            loading.value = false
        }
    }

    async function loadAll(): Promise<void> {
        await Promise.all([loadFonts(), loadTemplates(), loadExamples()])
    }

    // Re-fetch when the principal changes. Clear the per-kind
    // collections synchronously so the rendered overlay source
    // caches don't keep serving stale basenames while the reload
    // is in flight (the overlay's `ensureSource` re-issues the
    // GET with the new principalId against the previous basename
    // otherwise).
    //
    // `hasLoadedOnce` skips the initial chip-row set so onMounted's
    // loadAll() isn't double-fired. We can't use `length === 0`
    // as the gate — visiting a principal with no rows would
    // permanently silence subsequent reloads back to a populated
    // list (mirrors the image-store empty-list regression).
    let hasLoadedOnce = false
    watch(principalId, async () => {
        if (!hasLoadedOnce) return
        fonts.value = []
        templates.value = []
        examples.value = []
        await loadAll()
    }, { flush: 'sync' })

    async function uploadFont(name: string, content: string): Promise<FontResource | null> {
        uploading.value = true
        error.value = null
        try {
            const font = await fontsApi.uploadFont(name, content, principalId.value ?? undefined)
            fonts.value.push(font)
            return font
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload font.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function uploadTemplate(name: string, content: string): Promise<TemplateResource | null> {
        uploading.value = true
        error.value = null
        try {
            const template = await templatesApi.uploadTemplate(name, content, principalId.value ?? undefined)
            templates.value.push(template)
            return template
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload template.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function uploadExample(name: string, content: string): Promise<ExampleResource | null> {
        uploading.value = true
        error.value = null
        try {
            const example = await examplesApi.uploadExample(name, content, principalId.value ?? undefined)
            examples.value.push(example)
            return example
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload example.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function updateTemplate(name: string, content: string): Promise<TemplateResource | null> {
        uploading.value = true
        error.value = null
        try {
            const updated = await templatesApi.updateTemplate(name, content, principalId.value ?? undefined)
            // Replace the row in place so the size / mtime on the
            // card reflects the new bytes without a full reload.
            const idx = templates.value.findIndex((t) => t.name === name)
            if (idx >= 0) {
                templates.value[idx] = updated
            } else {
                templates.value.push(updated)
            }
            return updated
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to update template.'
            return null
        } finally {
            uploading.value = false
        }
    }

    async function updateExample(name: string, content: string): Promise<ExampleResource | null> {
        uploading.value = true
        error.value = null
        try {
            const updated = await examplesApi.updateExample(name, content, principalId.value ?? undefined)
            // Replace the row in place so the size / mtime on the
            // card reflects the new bytes without a full reload.
            const idx = examples.value.findIndex((ex) => ex.name === name)
            if (idx >= 0) {
                examples.value[idx] = updated
            } else {
                examples.value.push(updated)
            }
            return updated
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to update example.'
            return null
        } finally {
            uploading.value = false
        }
    }

    /**
     * Render a thumbnail for an example card without touching the
     * media archive. Bridges to `POST /typst/preview`, which is the
     * ephemeral path — bytes come back inline as base64 and no
     * `media_assets` / `media_derivatives` rows are written.
     *
     * Defaults to `png` at 144 PPI so the inline thumb is the same
     * shape across cards; callers can override for a sharper
     * preview when needed.
     */
    async function renderExample(
        name: string,
        content: string,
        format: 'pdf' | 'png' | 'svg' = 'png',
        ppi?: number,
    ): Promise<PreviewResult | null> {
        error.value = null
        try {
            return await previewApi.previewTypst({ source: content, name, format, ppi })
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to render example preview.'
            return null
        }
    }

    async function removeFont(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await fontsApi.deleteFont(name, principalId.value ?? undefined)
            fonts.value = fonts.value.filter((f) => f.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete font.'
            throw e
        } finally {
            uploading.value = false
        }
    }

    async function removeTemplate(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await templatesApi.deleteTemplate(name, principalId.value ?? undefined)
            templates.value = templates.value.filter((t) => t.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete template.'
            throw e
        } finally {
            uploading.value = false
        }
    }

    async function removeExample(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await examplesApi.deleteExample(name, principalId.value ?? undefined)
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
        templates,
        examples,
        loading,
        uploading,
        error,
        principalId,
        setPrincipalId,
        loadFonts,
        loadTemplates,
        loadExamples,
        loadAll,
        uploadFont,
        uploadTemplate,
        uploadExample,
        updateTemplate,
        updateExample,
        renderExample,
        removeFont,
        removeTemplate,
        removeExample,
        clearError,
    }
})

// Make the store HMR-aware. Without this, renaming `templates` →
// `something` keeps the old instance in memory and any in-flight
// component reading the new name hits `undefined`. With it, Vite
// disposes the old store on edit and the next `useResourceStore()`
// call recreates it from scratch.
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useResourceStore, import.meta.hot))
}
