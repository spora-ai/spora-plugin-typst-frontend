/// <reference types="vite/client" />
/**
 * Pinia store for the per-principal image library.
 *
 * The plugin's images are now filesystem-backed (no `media_assets`
 * rows); the wire surface is `{ name, mime, size, modified_at, url }`
 * and the URL is `/api/v1/typst/images/{name}`. Delete is by name,
 * not by id. The store is otherwise identical in shape to the
 * pre-refactor `media_assets` version.
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, watch } from 'vue'
import { ApiError } from '../api/client'
import * as imagesApi from '../api/images'
import type { ImageResource, UploadedImage } from '../types'

export const useImagesStore = defineStore('typst-images', () => {
    const images = ref<ImageResource[]>([])
    const loading = ref(false)
    const uploading = ref(false)
    const error = ref<string | null>(null)
    const principalId = ref<number | null>(null)

    function setPrincipalId(id: number | null): void {
        principalId.value = id
    }

    async function loadImages(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            images.value = await imagesApi.listImages(principalId.value ?? undefined)
            hasLoadedOnce = true
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load images.'
        } finally {
            loading.value = false
        }
    }

    async function uploadImage(filename: string, mime: string, content: string): Promise<UploadedImage | null> {
        uploading.value = true
        error.value = null
        try {
            const image = await imagesApi.uploadImage(filename, mime, content, principalId.value ?? undefined)
            if (image.renamed === true) {
                // Surface the rename so the operator sees the
                // backend's filename policy in action instead of
                // wondering where "typst-image-1789038367.jpg"
                // came from.
                lastRename.value = {
                    from: image.original_name ?? null,
                    to: image.name,
                }
            }
            await loadImages()
            return image
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload image.'
            return null
        } finally {
            uploading.value = false
        }
    }

    /**
     * One-shot notice surfaced in `<ImageUploader>` when the
     * backend reports the user-supplied filename was replaced by
     * the `typst-image-<ts>.<ext>` fallback. Cleared by the
     * component after the operator dismisses it.
     */
    const lastRename = ref<{ from: string | null; to: string } | null>(null)
    function clearLastRename(): void {
        lastRename.value = null
    }

    async function removeImage(name: string): Promise<void> {
        uploading.value = true
        error.value = null
        try {
            await imagesApi.deleteImage(name, principalId.value ?? undefined)
            images.value = images.value.filter((i) => i.name !== name)
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to delete image.'
            throw e
        } finally {
            uploading.value = false
        }
    }

    function clearError(): void {
        error.value = null
    }

    // Re-fetch when the principal chip changes. Clear `images`
    // synchronously (flush: 'sync') so the browser stops firing
    // GETs for stale basenames under the new principal_id — the
    // rendered `<img :src>` URL is reactive on principalId, so
    // without a sync clear the in-flight GET rewrites to
    // `?principal_id=<new>` with the OLD basename and 404s until
    // the reload completes.
    //
    // `hasLoadedOnce` skips the initial chip-row set (when the
    // store hasn't fetched anything yet) so onMounted's
    // loadImages() isn't double-fired. We can't use
    // `images.value.length === 0` as that gate — visiting a
    // principal with zero images would permanently silence
    // subsequent reloads back to a populated list.
    let hasLoadedOnce = false
    watch(principalId, async () => {
        if (!hasLoadedOnce) return
        images.value = []
        await loadImages()
    }, { flush: 'sync' })

    return {
        images,
        loading,
        uploading,
        error,
        principalId,
        lastRename,
        setPrincipalId,
        loadImages,
        uploadImage,
        removeImage,
        clearError,
        clearLastRename,
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useImagesStore, import.meta.hot))
}
