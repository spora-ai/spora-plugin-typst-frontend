<script setup lang="ts">
/**
 * Grid view of the principal's image library.
 *
 * Each card renders a thumbnail (`<img src={asset_url}>`), the
 * filename, mime + size, a "Copy URL" button (for use in
 * `#image("…")` source), and a Delete button.
 *
 * Origin is implicit — every image in this view is principal-owned
 * (skill-shipped images don't exist on this side of the plugin
 * since images are operator assets by definition; tier-1 fonts
 * exist, tier-1 images don't).
 */
import { onMounted } from 'vue'
import { useImagesStore } from '../stores/images'

const store = useImagesStore()

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

async function copyUrl(url: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(url)
    } catch {
        // Fallback: create a textarea + execCommand('copy') if
        // Clipboard API isn't available (some older browsers,
        // insecure contexts).
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try { document.execCommand('copy') } catch { /* ignore */ }
        textarea.remove()
    }
}

async function confirmAndDelete(id: string, filename: string): Promise<void> {
    if (!confirm(`Delete image "${filename}"? This cannot be undone.`)) return
    try {
        await store.removeImage(id)
    } catch {
        // store.error already populated
    }
}

onMounted(() => {
    if (store.images.length === 0) store.loadImages()
})
</script>

<template>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div
            v-if="store.loading && store.images.length === 0"
            class="col-span-full text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="store.images.length === 0"
            class="col-span-full text-center text-muted-foreground py-6"
        >No images uploaded yet. Drop a PNG / JPEG / WebP / SVG file above.</div>
        <div
            v-for="image in store.images"
            :key="image.id"
            class="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
        >
            <div class="aspect-square bg-muted flex items-center justify-center">
                <img
                    :src="image.asset_url"
                    :alt="image.filename"
                    class="max-w-full max-h-full object-contain"
                    loading="lazy"
                />
            </div>
            <div class="p-3 flex-1 flex flex-col gap-2">
                <div class="min-w-0">
                    <div class="font-mono text-xs text-foreground truncate" :title="image.filename">
                        {{ image.filename }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                        {{ image.mime_type }} · {{ formatBytes(image.byte_size) }}
                    </div>
                </div>
                <div class="flex items-center justify-between gap-2 mt-auto">
                    <button
                        type="button"
                        class="text-xs font-medium text-primary hover:text-primary/80"
                        @click="copyUrl(image.asset_url)"
                    >Copy URL</button>
                    <button
                        type="button"
                        class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                        :disabled="store.uploading"
                        @click="confirmAndDelete(image.id, image.filename)"
                    >Delete</button>
                </div>
            </div>
        </div>
    </div>
</template>
