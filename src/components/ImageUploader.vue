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
</script>

<template>
    <div
        class="rounded-lg border-2 border-dashed border-gray-300 hover:border-typst-500 hover:bg-typst-50/40 p-6 text-center cursor-pointer transition-colors"
        role="button"
        tabindex="0"
        @click="pickFile"
        @keydown.enter="pickFile"
    >
        <p class="text-sm text-gray-700">
            <span class="font-medium">Click to upload</span> or drag an image here
        </p>
        <p class="text-xs text-gray-500 mt-1">
            Supported: PNG, JPEG, WebP, SVG (≤ 5 MiB)
        </p>
        <input
            ref="fileInput"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
