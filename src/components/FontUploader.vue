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
            'rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
            dragOver
                ? 'border-typst-500 bg-typst-50'
                : 'border-gray-300 hover:border-typst-500 hover:bg-typst-50/40',
        ]"
        role="button"
        tabindex="0"
        @click="pickFile"
        @keydown.enter="pickFile"
        @keydown.space.prevent="pickFile"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
    >
        <p class="text-sm text-gray-700">
            <span class="font-medium">Click to upload</span> or drag a font file here
        </p>
        <p class="text-xs text-gray-500 mt-1">
            Supported: {{ ALLOWED_EXTENSIONS.join(', ') }} (≤ 5 MiB)
        </p>
        <input
            ref="fileInput"
            type="file"
            :accept="ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
