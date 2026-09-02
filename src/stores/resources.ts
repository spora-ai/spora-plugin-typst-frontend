/// <reference types="vite/client" />
/**
 * Pinia store for fonts + templates (tier-1 + tier-2 resources).
 *
 * The two resource kinds are administered through the same UI shape
 * (upload / list / delete), so we keep them in a single store to
 * avoid duplicating the loading-flag pattern across two stores. The
 * stores for images (which surface a different wire shape with id +
 * asset_url) live in `stores/images.ts`.
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
import type { FontResource, TemplateResource } from '../types'

export const useResourceStore = defineStore('typst-resources', () => {
    const fonts = ref<FontResource[]>([])
    const templates = ref<TemplateResource[]>([])
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

    async function loadTemplates(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            templates.value = await templatesApi.listTemplates(principalId.value ?? undefined)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load templates.'
        } finally {
            loading.value = false
        }
    }

    async function loadAll(): Promise<void> {
        await Promise.all([loadFonts(), loadTemplates()])
    }

    // Re-fetch when the principal changes. `flush: 'post'` ensures
    // the watcher fires after the chip row's store update lands, not
    // mid-tick.
    watch(principalId, async () => {
        if (fonts.value.length > 0 || templates.value.length > 0) {
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

    async function uploadTemplate(name: string, content: string): Promise<TemplateResource | null> {
        uploading.value = true
        error.value = null
        try {
            const template = await templatesApi.uploadTemplate(name, content)
            templates.value.push(template)
            return template
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload template.'
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

    async function removeTemplate(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await templatesApi.deleteTemplate(name)
            templates.value = templates.value.filter((t) => t.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete template.'
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
        loading,
        uploading,
        error,
        principalId,
        setPrincipalId,
        loadFonts,
        loadTemplates,
        loadAll,
        uploadFont,
        uploadTemplate,
        removeFont,
        removeTemplate,
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
