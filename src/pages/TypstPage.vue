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
 * Principal scope:
 *   A single chip row between the tab nav and the tab content
 *   selects which principal's assets to show. Skill-shipped fonts
 *   are visible regardless of selection (backend always returns
 *   tier-1). Uploads stay tied to the caller's own principal
 *   (no override on POST).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useResourceStore } from '../stores/resources'
import { useImagesStore } from '../stores/images'
import { usePrincipalsStore } from '../stores/principals'
import FontUploader from '../components/FontUploader.vue'
import FontList from '../components/FontList.vue'
import ExampleUploader from '../components/ExampleUploader.vue'
import ExampleList from '../components/ExampleList.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ImageList from '../components/ImageList.vue'
import CompileForm from '../components/CompileForm.vue'
import AlertBanner from '../components/AlertBanner.vue'
import PrincipalChipRow from '../components/PrincipalChipRow.vue'

type Tab = 'fonts' | 'examples' | 'images' | 'playground'

const props = defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const activeTab = ref<Tab>('fonts')
const resourceStore = useResourceStore()
const imagesStore = useImagesStore()
const principalsStore = usePrincipalsStore()

// Wire the chip-row selection into both the resource and image
// stores. The watchers inside each store re-fetch on change.
watch(
    () => principalsStore.selectedPrincipalId,
    (id) => {
        resourceStore.setPrincipalId(id)
        imagesStore.setPrincipalId(id)
    },
    { immediate: true },
)

const combinedError = computed<string | null>(() =>
    resourceStore.error ?? imagesStore.error ?? principalsStore.error ?? null,
)

function dismissError(): void {
    resourceStore.clearError()
    imagesStore.clearError()
    principalsStore.clearError()
}

onMounted(async () => {
    // Load principals first so the chip row can settle before the
    // tab content's first fetch — fonts/examples/images fetch with
    // `principalId` from the chip-row selection.
    await principalsStore.loadPrincipals()
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

        <PrincipalChipRow />

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
