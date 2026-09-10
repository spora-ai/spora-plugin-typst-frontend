<script setup lang="ts">
/**
 * ImageInsertModal — modal for picking an image to `#image(...)`
 * into the editor's source.
 *
 * Two image sources:
 *   - **Plugin images** — uploaded via the Images tab; live at
 *     `/api/v1/typst/images/<basename>.<ext>` and can be
 *     referenced directly by `#image()`.
 *   - **Media archive** — images stored via the cross-plugin
 *     media archive; live at `/api/v1/assets/<uuid>.<ext>` and
 *     reachable across plugins.
 *
 * Both lists are loaded lazily by the parent (CompileForm) when
 * the modal opens; the modal just renders whichever the parent
 * hands it.
 *
 * On insert, emits `pick-plugin-image` or `pick-media-image`
 * with the chosen image's URL. The parent builds the
 * `#image("url", width: 80%)` snippet and inserts it at the
 * caret.
 *
 * The plugin-image thumbnails are threaded through
 * `withPrincipal(url, principalId)` so the picker can show a
 * preview for images uploaded to a non-default principal (the
 * image-show endpoint falls back to the caller's user-principal
 * when no `?principal_id=` is on the wire, same bug as the
 * template-overlay read).
 *
 * Native `<dialog>` for the UA-managed focus trap + ::backdrop.
 * `showModal()` is called from onMounted (the parent mounts
 * with `open=true` so the watcher-on-change path doesn't fire).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withPrincipal } from '../api/client'
import { useImagesStore } from '../stores/images'
import type { ImageResource, MediaArchiveImage } from '../types'

const props = withDefaults(defineProps<{
    open: boolean
    pluginImages: ImageResource[]
    mediaImages: MediaArchiveImage[]
    loading?: boolean
    activeTab?: 'plugin' | 'media'
    ariaLabel?: string
}>(), {
    loading: false,
    activeTab: 'plugin',
    ariaLabel: 'Insert image',
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'pick-plugin-image', image: ImageResource): void
    (e: 'pick-media-image', image: MediaArchiveImage): void
    (e: 'change-tab', tab: 'plugin' | 'media'): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const internalTab = ref<'plugin' | 'media'>(props.activeTab)
const imagesStore = useImagesStore()

function scopedPluginUrl(url: string): string {
    return withPrincipal(url, imagesStore.principalId ?? undefined)
}

watch(() => props.activeTab, (tab) => {
    internalTab.value = tab
})

function close(): void {
    emit('close')
}

function onPluginClick(img: ImageResource): void {
    emit('pick-plugin-image', img)
}

function onMediaClick(img: MediaArchiveImage): void {
    emit('pick-media-image', img)
}

function onTabClick(tab: 'plugin' | 'media'): void {
    internalTab.value = tab
    emit('change-tab', tab)
}

function onDialogClick(e: MouseEvent): void {
    if (e.target === dialogRef.value) close()
}

function onKey(e: KeyboardEvent): void {
    if (!props.open) return
    if (e.key === 'Escape') {
        e.preventDefault()
        close()
    }
}

watch(() => props.open, (open) => {
    if (open) {
        void nextTick(() => {
            dialogRef.value?.showModal()
        })
    }
})

onMounted(() => {
    document.addEventListener('keydown', onKey)
    if (props.open && dialogRef.value !== null) {
        dialogRef.value.showModal()
    }
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
})
</script>

<template>
    <dialog
        v-if="open"
        ref="dialogRef"
        class="fixed inset-0 z-50 m-0 max-w-none max-h-none w-full h-full p-4 bg-transparent backdrop:bg-black/40 open:flex items-center justify-center"
        aria-modal="true"
        :aria-label="ariaLabel"
        data-testid="image-insert-modal"
        @click="onDialogClick"
    >
        <div
            class="relative w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
            style="max-height: min(640px, calc(100vh - 2rem))"
            tabindex="-1"
        >
            <header class="flex items-center justify-between gap-2 p-3 border-b border-border">
                <h2
                    class="text-sm font-semibold text-foreground"
                    data-testid="image-insert-title"
                >Insert image · <span class="text-muted-foreground font-normal">#image("…", width: 80%)</span></h2>
                <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="image-insert-close"
                    @click="close"
                >Close</button>
            </header>

            <div class="flex items-center gap-2 px-3 pt-2">
                <button
                    type="button"
                    :class="[
                        'px-3 py-1 text-xs rounded-md transition-colors',
                        internalTab === 'plugin'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground',
                    ]"
                    data-testid="image-insert-tab-plugin"
                    @click="onTabClick('plugin')"
                >Plugin images ({{ pluginImages.length }})</button>
                <button
                    type="button"
                    :class="[
                        'px-3 py-1 text-xs rounded-md transition-colors',
                        internalTab === 'media'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground',
                    ]"
                    data-testid="image-insert-tab-media"
                    @click="onTabClick('media')"
                >Media archive ({{ mediaImages.length }})</button>
            </div>

            <div class="flex-1 overflow-y-auto p-3">
                <div
                    v-if="loading"
                    class="text-xs text-muted-foreground py-6 text-center"
                >Loading…</div>
                <div
                    v-else-if="internalTab === 'plugin' && pluginImages.length === 0"
                    class="text-xs text-muted-foreground py-6 text-center"
                >No plugin images. Upload some via the Images tab first.</div>
                <div
                    v-else-if="internalTab === 'media' && mediaImages.length === 0"
                    class="text-xs text-muted-foreground py-6 text-center"
                >No media-archive images visible to the current principal.</div>
                <div
                    v-else
                    class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2"
                >
                    <button
                        v-for="img in (internalTab === 'plugin' ? pluginImages : mediaImages)"
                        :key="(img as ImageResource).name ?? (img as MediaArchiveImage).id"
                        type="button"
                        class="border border-border rounded-md overflow-hidden bg-background hover:border-primary transition-colors text-left"
                        :data-testid="(img as ImageResource).name !== undefined ? `image-insert-plugin-${(img as ImageResource).name}` : `image-insert-media-${(img as MediaArchiveImage).id}`"
                        @click="internalTab === 'plugin'
                            ? onPluginClick(img as ImageResource)
                            : onMediaClick(img as MediaArchiveImage)"
                    >
                        <div class="aspect-square bg-muted flex items-center justify-center">
                            <img
                                :src="internalTab === 'plugin' ? scopedPluginUrl((img as ImageResource).url) : (img as MediaArchiveImage).asset_url"
                                :alt="(img as ImageResource).name ?? (img as MediaArchiveImage).filename"
                                class="max-w-full max-h-full object-contain"
                                loading="lazy"
                            >
                        </div>
                        <div class="p-1.5 text-[10px] font-mono truncate" :title="(img as ImageResource).name ?? (img as MediaArchiveImage).filename">
                            {{ (img as ImageResource).name ?? (img as MediaArchiveImage).filename }}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    </dialog>
</template>
