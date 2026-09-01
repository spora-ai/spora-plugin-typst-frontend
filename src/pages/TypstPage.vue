<script setup lang="ts">
/**
 * TypstPage — single-page admin UI with four tabs:
 *   - Fonts     (uploader + list of per-principal fonts)
 *   - Examples  (uploader + list of per-principal typ templates)
 *   - Images    (uploader + grid of per-principal images)
 *   - Playground (typ source editor + format selector; renders
 *                via the chat composer for v0.1 — the dedicated
 *                `/api/v1/typst/compile` endpoint is a follow-up PR)
 *
 * Tab state lives in a single `activeTab` ref. The page owns the
 * error banner (each store's error ref feeds it). Stores themselves
 * are created once on first access via Pinia — no plugin-local
 * Pinia, just the default install in main.ts.
 */
import { computed, onMounted, ref } from 'vue'
import { useResourceStore } from '../stores/resources'
import { useImagesStore } from '../stores/images'
import FontUploader from '../components/FontUploader.vue'
import FontList from '../components/FontList.vue'
import ExampleUploader from '../components/ExampleUploader.vue'
import ExampleList from '../components/ExampleList.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ImageList from '../components/ImageList.vue'
import CompileForm from '../components/CompileForm.vue'
import AlertBanner from '../components/AlertBanner.vue'

type Tab = 'fonts' | 'examples' | 'images' | 'playground'

const props = defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const activeTab = ref<Tab>('fonts')
const resourceStore = useResourceStore()
const imagesStore = useImagesStore()

const combinedError = computed<string | null>(() => resourceStore.error ?? imagesStore.error ?? null)

function dismissError(): void {
    resourceStore.clearError()
    imagesStore.clearError()
}

onMounted(async () => {
    // Eager-load fonts + examples + images on first mount so the
    // operator sees the library without clicking each tab. Each
    // store's call is independent — fire in parallel.
    await Promise.all([
        resourceStore.loadAll(),
        imagesStore.loadImages(),
    ])
})
</script>

<template>
    <div class="mx-auto max-w-6xl p-6 space-y-4">
        <header class="flex items-baseline justify-between gap-3">
            <h1 class="text-xl font-semibold text-typst-900">Typst</h1>
            <span class="text-xs text-gray-500">Per-principal font / example / image library</span>
        </header>

        <AlertBanner
            :message="combinedError"
            @dismiss="dismissError"
        />

        <nav class="border-b border-gray-200">
            <ul class="flex gap-1">
                <li v-for="tab in (['fonts', 'examples', 'images', 'playground'] as Tab[])" :key="tab">
                    <button
                        type="button"
                        :class="[
                            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                            activeTab === tab
                                ? 'border-typst-500 text-typst-900'
                                : 'border-transparent text-gray-500 hover:text-typst-700 hover:border-typst-200',
                        ]"
                        @click="activeTab = tab"
                    >{{ tab.charAt(0).toUpperCase() + tab.slice(1) }}</button>
                </li>
            </ul>
        </nav>

        <section v-if="activeTab === 'fonts'" class="space-y-4">
            <FontUploader />
            <FontList />
        </section>

        <section v-else-if="activeTab === 'examples'" class="space-y-4">
            <ExampleUploader />
            <ExampleList />
        </section>

        <section v-else-if="activeTab === 'images'" class="space-y-4">
            <ImageUploader />
            <ImageList />
        </section>

        <section v-else-if="activeTab === 'playground'" class="space-y-4">
            <CompileForm :host-context="props.hostContext" />
        </section>
    </div>
</template>
