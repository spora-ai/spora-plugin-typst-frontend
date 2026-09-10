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
            await loadImages()
            return image
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to upload image.'
            return null
        } finally {
            uploading.value = false
        }
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

    // Re-fetch when the principal chip changes.
    watch(principalId, async () => {
        if (images.value.length > 0) {
            await loadImages()
        }
    })

    return {
        images,
        loading,
        uploading,
        error,
        principalId,
        setPrincipalId,
        loadImages,
        uploadImage,
        removeImage,
        clearError,
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useImagesStore, import.meta.hot))
}
