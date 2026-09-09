<script setup lang="ts">
/**
 * TypstPage — single-page admin UI with five tabs:
 *   - Fonts      (uploader + list of per-principal fonts)
 *   - Templates  (uploader + list of per-principal typ templates)
 *   - Examples   (uploader + list of per-principal typ example patterns)
 *   - Images     (uploader + grid of per-principal images)
 *   - Editor     (typ source editor + format selector + result panel)
 *
 * The Editor is the renamed "Playground" — the label change is
 * UI-only per the project's "UI label rename only" rule. The
 * underlying wire still uses `/api/v1/typst/{preview,compile,sources}`
 * and `tool_name='typst.playground'` on the DB.
 *
 * Cross-tab prefill:
 *   Examples tab's "Open Copy in Editor" button (and the same
 *   affordance on Templates) emits `open-in-editor` with
 *   `{ name, content, filename }`. We route it through
 *   `useTabsStore().goToEditor(prefill)` and the Editor consumes
 *   the prefill on its next mount via the tabs store.
 *
 * Edit is in-place inside `<ResourceOverlay>` — the overlay
 * swaps its readOnly SourceEditor for an editable one when the
 * operator clicks Edit, then PUTs via the resource store. The
 * parent no longer needs an edit-modal layer.
 *
 * Principal scope:
 *   A single chip row between the tab nav and the tab content
 *   selects which principal's assets to show. Skill-shipped fonts
 *   are visible regardless of selection (backend always returns
 *   tier-1). Uploads stay tied to the caller's own principal
 *   (no override on POST).
 */
import { computed, onMounted, watch } from 'vue'
import { useResourceStore } from '../stores/resources'
import { useImagesStore } from '../stores/images'
import { useSourcesStore } from '../stores/sources'
import { usePrincipalsStore } from '../stores/principals'
import { useTabsStore, type Tab } from '../stores/tabs'
import FontUploader from '../components/FontUploader.vue'
import FontList from '../components/FontList.vue'
import TemplateUploader from '../components/TemplateUploader.vue'
import TemplateList from '../components/TemplateList.vue'
import ExampleUploader from '../components/ExampleUploader.vue'
import ExampleList from '../components/ExampleList.vue'
import ImageUploader from '../components/ImageUploader.vue'
import ImageList from '../components/ImageList.vue'
import CompileForm from '../components/CompileForm.vue'
import AlertBanner from '../components/AlertBanner.vue'
import PrincipalChipRow from '../components/PrincipalChipRow.vue'

const TABS: readonly Tab[] = ['fonts', 'templates', 'examples', 'images', 'editor']

const TAB_LABELS: Record<Tab, string> = {
    fonts: 'Fonts',
    templates: 'Templates',
    examples: 'Examples',
    images: 'Images',
    editor: 'Editor',
}

const props = defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const tabsStore = useTabsStore()
const resourceStore = useResourceStore()
const imagesStore = useImagesStore()
const sourcesStore = useSourcesStore()
const principalsStore = usePrincipalsStore()

// Wire the chip-row selection into the resource, image, and
// editor-source stores. The watchers inside each store re-fetch
// on change.
watch(
    () => principalsStore.selectedPrincipalId,
    (id) => {
        resourceStore.setPrincipalId(id)
        imagesStore.setPrincipalId(id)
        sourcesStore.setPrincipalId(id)
    },
    { immediate: true },
)

// Templates + Examples tab's "Open Copy in Editor" — switch to the
// Editor tab with the resource's source pre-filled as a copy. The
// Editor consumes the prefill on its next mount.
function onOpenInEditor(payload: { name: string; content: string; filename: string }): void {
    tabsStore.goToEditor({ source: payload.content, filename: payload.filename })
}

const combinedError = computed<string | null>(() =>
    resourceStore.error ?? imagesStore.error ?? sourcesStore.error ?? principalsStore.error ?? null,
)

function dismissError(): void {
    resourceStore.clearError()
    imagesStore.clearError()
    sourcesStore.clearError()
    principalsStore.clearError()
}

onMounted(async () => {
    // Load principals first so the chip row can settle before the
    // tab content's first fetch.
    await principalsStore.loadPrincipals()
    await Promise.all([
        resourceStore.loadAll(),
        imagesStore.loadImages(),
    ])
})
</script>

<template>
    <div class="mx-auto max-w-6xl p-6 space-y-5">
        <header class="flex items-baseline justify-between gap-3">
            <h1 class="text-xl font-semibold text-foreground">Typst</h1>
            <span class="text-xs text-muted-foreground">Per-principal font / template / example / image library</span>
        </header>

        <AlertBanner
            :message="combinedError"
            @dismiss="dismissError"
        />

        <!--
          Principal selector sits ABOVE the tab nav — the scope
          determines what every tab lists, so it gets the most
          prominent visual position. The header (h1) is on top,
          then the chip row, then the tabs.
        -->
        <PrincipalChipRow />

        <nav class="border-b border-border">
            <ul class="flex gap-1">
                <li v-for="tab in TABS" :key="tab">
                    <button
                        type="button"
                        :class="[
                            'px-4 py-2 text-sm border-b-2 -mb-px transition-colors rounded-t',
                            tabsStore.activeTab === tab
                                ? 'border-primary text-primary font-semibold bg-primary/5'
                                : 'border-transparent text-muted-foreground font-medium hover:text-foreground hover:border-border',
                        ]"
                        :aria-current="tabsStore.activeTab === tab ? 'page' : undefined"
                        @click="tabsStore.setTab(tab)"
                    >{{ TAB_LABELS[tab] }}</button>
                </li>
            </ul>
        </nav>

        <section v-if="tabsStore.activeTab === 'fonts'" class="space-y-4">
            <FontUploader />
            <FontList />
        </section>

        <section v-else-if="tabsStore.activeTab === 'templates'" class="space-y-4">
            <TemplateUploader />
            <TemplateList @open-in-editor="onOpenInEditor" />
        </section>

        <section v-else-if="tabsStore.activeTab === 'examples'" class="space-y-4">
            <ExampleUploader />
            <ExampleList @open-in-editor="onOpenInEditor" />
        </section>

        <section v-else-if="tabsStore.activeTab === 'images'" class="space-y-4">
            <ImageUploader />
            <ImageList />
        </section>

        <section v-else-if="tabsStore.activeTab === 'editor'" class="space-y-4">
            <CompileForm :host-context="props.hostContext" />
        </section>
    </div>
</template>
