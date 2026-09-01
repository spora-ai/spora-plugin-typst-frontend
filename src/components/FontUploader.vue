<script setup lang="ts">
/**
 * Drag-drop uploader for fonts (.ttf / .otf / .woff / .woff2).
 *
 * Calls the `readFileAsBase64` helper (api/images.ts — shared because
 * the FileReader→base64 idiom is the same for any binary upload) to
 * convert the file before pushing to the store.
 *
 * Tier-1 fonts (skill-shipped) are NOT uploadable through this
 * component — the store's `removeFont` refuses them via 422, but we
 * also grey out delete buttons for them so the UI never tempts the
 * operator into the dead-end path.
 */
import { ref } from 'vue'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const ALLOWED_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'] as const
type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number]

function isAllowed(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    return ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)
}

function pickFile(): void {
    fileInput.value?.click()
}

function readFileAsBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (): void => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('FileReader returned non-string result'))
                return
            }
            const commaIdx = result.indexOf(',')
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
        }
        reader.onerror = (): void => reject(new Error('FileReader failed'))
        reader.readAsDataURL(file)
    })
}

async function handleFile(file: File): Promise<void> {
    if (!isAllowed(file.name)) {
        store.error = `Unsupported font extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`
        return
    }
    try {
        const content = await readFileAsBase64(file)
        const result = await store.uploadFont(file.name, content)
        if (result === null) {
            // store.error already populated
            return
        }
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

function onDragOver(event: DragEvent): void {
    event.preventDefault()
    dragOver.value = true
}

function onDragLeave(): void {
    dragOver.value = false
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
        @dragover="onDragOver"
        @dragleave="onDragLeave"
    >
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">Upload font</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                    Supported: {{ ALLOWED_EXTENSIONS.join(', ') }} (≤ 5 MiB)
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
                <label for="typst-font-upload" class="text-xs text-muted-foreground cursor-pointer">or drop one here</label>
            </div>
        </div>
        <input
            id="typst-font-upload"
            ref="fileInput"
            type="file"
            :accept="ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')"
            aria-label="Upload font file"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
