<script lang="ts">
/**
 * Type-only block so the saved/open-in-editor event payload
 * shapes are documented alongside the component. Vue's
 * `<script setup>` strips non-macro exports at runtime, so this
 * lives in a non-setup sibling block — both blocks share the
 * same module.
 */
import type { ResourceKind } from '../composables/useResourceCardList'

export interface OpenInEditorEventPayload {
    name: string
    kind: ResourceKind
    content: string
    filename: string
}

export interface SavedEventPayload {
    name: string
    kind: ResourceKind
    content: string
}
</script>

<script setup lang="ts">
/**
 * Card grid shared by the Templates and Examples panels.
 *
 * Skill-shipped entries (`origin: 'skill'`) render read-only on a
 * muted background; principal uploads are editable. Principal
 * items are listed first, then a divider, then the skill-shipped
 * built-ins — the layout mirrors the directory partition in the
 * composable's principal/skill computeds.
 *
 * Each card is a thin title-tile: name + size + origin label.
 * Clicking anywhere on the card opens `<ResourceOverlay>`
 * (the single-action modal) which holds the source viewer,
 * edit affordance, copy-snippet button, "Open Copy in Editor" /
 * Render / Delete actions, and the cached render thumbnail.
 * The card no longer carries inline `<details>` expansion +
 * per-card action buttons — every action lives in the overlay
 * so the card grid stays uniform. Cards are rendered as native
 * `<button>` elements (Sonar Web:S6819/S6842 — non-interactive
 * elements must not be assigned the `button` role) so keyboard
 * activation + focus styling come for free.
 *
 * The overlay is rendered inside this component (not the parent)
 * because its source + render cache live in
 * `useResourceCardList` and would otherwise need to be lifted to
 * the parent. Owning the overlay here keeps the cache locality
 * clean and the parent free of resource-specific state.
 *
 * Props:
 *   - `kind`: 'template' | 'example' — drives the snippet shape
 *     (`#import "templates/X.typ"` vs `#include "examples/X.typ"`)
 *     and the example-only Render button.
 *   - `emptyText`: shown when no items match.
 *   - `builtInHeadingText`: divider label between principal and
 *     skill sections.
 *
 * Events bubbling up:
 *   - `open-in-editor` — Open Copy in Editor clicked. The
 *     parent routes through `useTabsStore().goToEditor()` so
 *     the Editor tab pre-fills with a copy (the original is
 *     untouched).
 *   - `render-example` — Render clicked (examples only). Kept
 *     as a no-op telemetry signal — the parent doesn't need to
 *     act.
 *
 * Edit is in-place inside the overlay (no second modal). On
 * successful save the overlay emits `saved` and this component
 * refreshes its source cache so the next open shows the new
 * bytes.
 */
import { computed, ref, watch } from 'vue'
import { useResourceStore } from '../stores/resources'
import { useResourceCardList } from '../composables/useResourceCardList'
import ResourceOverlay from './ResourceOverlay.vue'

const props = defineProps<{
    kind: ResourceKind
    emptyText: string
    builtInHeadingText: string
}>()

const emit = defineEmits<{
    (e: 'open-in-editor', payload: OpenInEditorEventPayload): void
    (e: 'render-example', payload: { name: string }): void
}>()

const store = useResourceStore()
const {
    sourceByName,
    loadingName,
    loadError,
    principalItems,
    skillItems,
    hasItems,
    formatBytes,
    ensureSource,
    confirmAndDelete,
    renderingName,
    renderError,
    renderedByName,
    renderExample,
} = useResourceCardList(props.kind)

// The currently-open overlay's resource name. Null when no
// overlay is showing. The composable's source + render caches
// are keyed by name, so opening is a one-step lookup.
const openName = ref<string | null>(null)

const openItem = computed(() => {
    const name = openName.value
    if (name === null) return null
    return principalItems.value.find((t) => t.name === name)
        ?? skillItems.value.find((t) => t.name === name)
        ?? null
})

async function openOverlay(name: string): Promise<void> {
    openName.value = name
    // Eager-fetch so the modal opens with the source visible
    // rather than a loading flash. `ensureSource` short-circuits
    // when the cache is warm.
    await ensureSource(name)
}

function closeOverlay(): void {
    openName.value = null
}

// When the open resource gets deleted (via the overlay's Delete
// action), the overlay would otherwise linger pointing at a name
// no longer in the listing. Watch the items list and close.
watch([principalItems, skillItems], () => {
    const name = openName.value
    if (name === null) return
    const stillThere =
        principalItems.value.some((t) => t.name === name)
        || skillItems.value.some((t) => t.name === name)
    if (!stillThere) openName.value = null
})

function onOpenInEditor(): void {
    const name = openName.value
    if (name === null) return
    const content = sourceByName.value[name] ?? ''
    if (content === '') return
    const stem = name.replace(/\.typ$/, '')
    emit('open-in-editor', {
        name,
        kind: props.kind,
        content,
        filename: `${stem}-copy.typ`,
    })
}

function onRender(): void {
    const name = openName.value
    if (name === null) return
    const content = sourceByName.value[name] ?? ''
    if (content === '') return
    emit('render-example', { name })
    void renderExample(name, content)
}

async function onDelete(): Promise<void> {
    const name = openName.value
    if (name === null) return
    await confirmAndDelete(name)
}

function onSaved(payload: { name: string; content: string }): void {
    // Refresh the source cache with the new bytes so re-opening
    // the overlay (or another render) uses the saved content.
    // The store's templates/examples array is already
    // up-to-date — `updateTemplate` / `updateExample` swap the
    // row in place — so we don't need to reload the listing.
    sourceByName.value = { ...sourceByName.value, [payload.name]: payload.content }
}
</script>

<template>
    <div class="space-y-4">
        <div
            v-if="store.loading && !hasItems"
            class="text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="!hasItems"
            class="text-center text-muted-foreground py-6"
        >{{ emptyText }}</div>
        <template v-else>
            <div
                v-if="principalItems.length > 0"
                class="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
                <button
                    v-for="item in principalItems"
                    :key="item.name"
                    type="button"
                    class="block w-full text-left rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary transition-colors space-y-1"
                    :aria-label="`Open ${kind} ${item.name}`"
                    :data-testid="`resource-card-${item.name}`"
                    @click="openOverlay(item.name)"
                >
                    <div class="font-mono text-sm text-foreground truncate">{{ item.name }}</div>
                    <div class="text-xs text-muted-foreground">
                        {{ formatBytes(item.size) }}
                        · <span class="text-muted-foreground/70">Your upload</span>
                    </div>
                </button>
            </div>
            <div
                v-if="skillItems.length > 0"
                class="space-y-3"
            >
                <div
                    v-if="principalItems.length > 0"
                    class="flex items-center gap-3 pt-1"
                >
                    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ builtInHeadingText }}</span>
                    <span class="flex-1 border-t border-border" />
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        v-for="item in skillItems"
                        :key="item.name"
                        type="button"
                        class="block w-full text-left rounded-lg border border-border bg-muted/40 p-4 cursor-pointer hover:border-primary transition-colors space-y-1"
                        :aria-label="`Open ${kind} ${item.name}`"
                        :data-testid="`resource-card-${item.name}`"
                        @click="openOverlay(item.name)"
                    >
                        <div class="font-mono text-sm text-foreground truncate">{{ item.name }}</div>
                        <div class="text-xs text-muted-foreground">
                            {{ formatBytes(item.size) }}
                            · <span class="inline-flex items-center gap-1 text-muted-foreground/70">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Built-in
                            </span>
                        </div>
                    </button>
                </div>
            </div>
        </template>

        <ResourceOverlay
            v-if="openName !== null && openItem !== null"
            :open="true"
            :kind="props.kind"
            :name="openName"
            :content="sourceByName[openName] ?? ''"
            :origin="openItem.origin"
            :rendered="renderedByName[openName] ?? null"
            :rendering="renderingName === openName"
            :render-error="renderingName === openName ? renderError : null"
            :loading="loadingName === openName"
            :load-error="loadingName === openName ? loadError : null"
            @close="closeOverlay"
            @open-in-editor="onOpenInEditor"
            @render="onRender"
            @delete="onDelete"
            @saved="onSaved"
        />
    </div>
</template>
