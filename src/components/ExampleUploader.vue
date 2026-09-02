<script setup lang="ts">
/**
 * Drag-drop uploader for Typst example patterns (.typ).
 *
 * Examples are UTF-8 source files — same shape as templates, but
 * semantically distinct (small pattern snippets vs. full document
 * skeletons). Both uploader and listing share the same wire shape;
 * the UI separation is purely navigational.
 */
import { ref } from 'vue'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function pickFile(): void {
    fileInput.value?.click()
}

function readFileAsText(file: File): Promise<string> {
    return file.text()
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
                <p class="text-sm font-medium text-foreground">Upload example</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                    Stored as UTF-8 source (≤ 5 MiB)
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
                <label for="typst-example-upload" class="text-xs text-muted-foreground cursor-pointer">or drop one here</label>
            </div>
        </div>
        <input
            id="typst-example-upload"
            ref="fileInput"
            type="file"
            accept=".typ"
            aria-label="Upload Typst example file"
            class="hidden"
            @change="onFileChange"
        />
    </div>
</template>
