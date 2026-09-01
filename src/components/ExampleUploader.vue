<script setup lang="ts">
/**
 * Drag-drop uploader for Typst example templates (.typ).
 *
 * Examples are UTF-8 source files — no base64 step, just FileReader's
 * `readAsText`. Same upload-via-store pattern as FontUploader.
 */
import { ref } from 'vue'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()
const fileInput = ref<HTMLInputElement | null>(null)

function pickFile(): void {
    fileInput.value?.click()
}

function readFileAsText(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (): void => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('FileReader returned non-string result'))
                return
            }
            resolve(result)
        }
        reader.onerror = (): void => reject(new Error('FileReader failed'))
        reader.readAsText(file)
    })
}

async function handleFile(file: File): Promise<void> {
    if (!file.name.endsWith('.typ')) {
        store.error = 'Only .typ example files are supported.'
        return
    }
    try {
        const content = await readFileAsText(file)
        const result = await store.uploadExample(file.name, content)
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
            <span class="font-medium">Click to upload</span> or drag a .typ example file here
        </p>
        <p class="text-xs text-gray-500 mt-1">
            Stored as UTF-8 source (≤ 5 MiB)
        </p>
        <input
            ref="fileInput"
            type="file"
            accept=".typ"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
