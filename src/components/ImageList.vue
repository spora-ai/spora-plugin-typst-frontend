<script setup lang="ts">
/**
 * Grid view of the principal's image library.
 *
 * Each card renders a thumbnail (`<img :src="image.url">`), the
 * filename, mime + size, a "Copy URL" button (for use in
 * `#image("…")` source), and a Delete button.
 *
 * Origin is implicit — every image in this view is principal-owned
 * (skill-shipped images don't exist on this side of the plugin:
 * tier-1 fonts and templates exist, tier-1 images don't).
 *
 * Image URLs are threaded through `withPrincipal(url, principalId)`
 * because the backend's image-show endpoint falls back to the
 * caller's user-principal when no `?principal_id=` is on the
 * wire. Same root cause as the template-overlay bug: a list call
 * threads the principal; the per-resource read forgotten it.
 */
import { onMounted } from 'vue'
import { withPrincipal } from '../api/client'
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

async function confirmAndDelete(name: string, filename: string): Promise<void> {
    if (!confirm(`Delete image "${filename}"? This cannot be undone.`)) return
    try {
        await store.removeImage(name)
    } catch {
        // store.error already populated
    }
}

onMounted(() => {
    if ((store.images ?? []).length === 0) store.loadImages()
})

// Pin the store's principalId onto every image URL so the
// thumbnail `<img src>` and the "Copy URL" button both resolve
// against the principal the operator is currently viewing. Without
// this, the image-show endpoint falls back to the caller's
// user-principal and 404s on any image uploaded to a group.
function scopedUrl(url: string): string {
    return withPrincipal(url, store.principalId ?? undefined)
}
</script>

<template>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div
            v-if="store.loading && (store.images ?? []).length === 0"
            class="col-span-full text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="(store.images ?? []).length === 0"
            class="col-span-full text-center text-muted-foreground py-6"
        >No images uploaded yet. Drop a PNG / JPEG / WebP / SVG file above.</div>
        <div
            v-for="image in (store.images ?? [])"
            :key="image.name"
            class="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
        >
            <div class="aspect-square bg-muted flex items-center justify-center">
                    <img
                        :src="scopedUrl(image.url)"
                        :alt="image.name"
                        class="max-w-full max-h-full object-contain"
                        loading="lazy"
                    />
            </div>
            <div class="p-3 flex-1 flex flex-col gap-2">
                <div class="min-w-0">
                    <div class="font-mono text-xs text-foreground truncate" :title="image.name">
                        {{ image.name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                        {{ image.mime }} · {{ formatBytes(image.size) }}
                    </div>
                </div>
                <div class="flex items-center justify-between gap-2 mt-auto">
                    <button
                        type="button"
                        class="text-xs font-medium text-primary hover:text-primary/80"
                        @click="copyUrl(scopedUrl(image.url))"
                    >Copy URL</button>
                    <button
                        type="button"
                        class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                        :disabled="store.uploading"
                        @click="confirmAndDelete(image.name, image.name)"
                    >Delete</button>
                </div>
            </div>
        </div>
    </div>
</template>
