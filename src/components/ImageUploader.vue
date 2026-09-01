<script setup lang="ts">
/**
 * Drag-drop uploader for the per-principal image library.
 *
 * PNG / JPEG / WebP go through FileReader.readAsDataURL → base64
 * (the controller's `decodeContent` auto-detects base64 ≥ 16 chars
 * and round-trips it). SVG is text — readAsText, sent raw. MIME is
 * derived from the file (the input's `accept` attribute restricts
 * what the picker shows, but drag-drop can smuggle anything; the
 * `mimeFromName` helper handles the common cases and falls back to
 * the input event's `type`).
 */
import { ref } from 'vue'
import { useImagesStore } from '../stores/images'
import { readFileAsBase64 } from '../api/images'

const store = useImagesStore()
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const

function pickFile(): void {
    fileInput.value?.click()
}

function mimeFromName(name: string, fallback: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    switch (ext) {
        case 'png': return 'image/png'
        case 'jpg':
        case 'jpeg': return 'image/jpeg'
        case 'webp': return 'image/webp'
        case 'svg': return 'image/svg+xml'
        default: return fallback
    }
}

async function handleFile(file: File): Promise<void> {
    const mime = mimeFromName(file.name, file.type)
    if (!ALLOWED_MIMES.includes(mime as (typeof ALLOWED_MIMES)[number])) {
        store.error = `Unsupported image type "${mime || 'unknown'}". Allowed: PNG, JPEG, WebP, SVG.`
        return
    }
    try {
        const isText = mime === 'image/svg+xml'
        const content = isText ? await file.text() : await readFileAsBase64(file)
        const result = await store.uploadImage(file.name, mime, content)
        if (result === null) return
    } catch (e) {
        store.error = e instanceof Error ? e.message : 'Upload failed.'
    }
}

async function onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) await handleFile(file)
    input.value = ''
}

async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    dragOver.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) await handleFile(file)
}
</script>

<template>
    <div
        :class="[
            'rounded-lg border-2 border-dashed p-6 transition-colors',
            dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/60 hover:bg-muted/50',
        ]"
        @drop="onDrop"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
    >
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">Upload image</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                    Supported: PNG, JPEG, WebP, SVG (≤ 5 MiB)
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    :disabled="store.uploading"
                    @click="pickFile"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Choose file
                </button>
                <label for="typst-image-upload" class="text-xs text-muted-foreground cursor-pointer">or drop one here</label>
            </div>
        </div>
        <input
            id="typst-image-upload"
            ref="fileInput"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Upload image file"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
