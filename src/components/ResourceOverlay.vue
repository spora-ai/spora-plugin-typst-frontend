<script setup lang="ts">
/**
 * ResourceOverlay — single-action surface for a Templates or
 * Examples card.
 *
 * Replaces the inline `<details>` View-source expansion + Edit
 * button + Render button + render-result panel that used to
 * live on each card. One click on the card title opens this
 * modal; every action for that resource (View source, Edit,
 * Open Copy in Editor, Render, Delete) sits inside.
 *
 * Why a modal:
 *   - Cards are smaller and uniform (no per-card row count)
 *   - The source viewer + action bar can use the full width
 *     without pushing the grid into a single-column layout
 *   - Skill-shipped and principal-tier items can render the
 *     same shell — only the available actions differ
 *
 * Source viewer:
 *   Renders `<SourceEditor>` in readOnly mode so the operator
 *   sees the syntax-highlighted source and can scroll + select
 *   for copy, but cannot edit. Editing happens in
 *   `<TextResourceEditModal>` (a separate modal triggered by
 *   the Edit action below).
 *
 * Action bar:
 *   - Edit             (principal-tier only)
 *   - Open Copy in Editor
 *   - Render           (examples only; ephemeral /preview)
 *   - Delete           (principal-tier only, with confirm)
 *
 * Mid-render the Render button is disabled and shows
 * "Rendering…". The result thumbnail renders below the source
 * viewer (replacing it once a render is present, since the
 * viewer is the focus when reading and the thumbnail is the
 * focus when previewing).
 *
 * Like the other modals: native `<dialog>` via showModal()
 * gives the UA-managed focus trap + ::backdrop. showModal() is
 * called from onMounted (the parent's v-if mounts with
 * `open=true` so the watcher-on-change path doesn't fire).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SourceEditor from './SourceEditor.vue'
import type { ResourceKind } from '../composables/useResourceCardList'
import type { RenderedPreview } from '../composables/useResourceCardList'

const props = withDefaults(defineProps<{
    open: boolean
    kind: ResourceKind
    name: string
    content: string
    /** Where the resource lives — `skill` items are read-only. */
    origin: 'principal' | 'skill'
    /** Cached render result for examples; null until the user clicks Render. */
    rendered: RenderedPreview | null
    /** True while a render request is in flight for this overlay. */
    rendering: boolean
    /** Most recent render error for this overlay (cleared on next attempt). */
    renderError: string | null
    /** Loading state for the source fetch — true when content is still arriving. */
    loading: boolean
    /** Most recent load error for the source fetch. */
    loadError: string | null
    ariaLabel?: string
}>(), {
    ariaLabel: 'Resource overlay',
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'edit'): void
    (e: 'open-in-editor'): void
    (e: 'render'): void
    (e: 'delete'): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)

const title = computed(() => `${props.kind === 'template' ? 'Template' : 'Example'}: ${props.name}`)
const canEdit = computed(() => props.origin === 'principal')
const canDelete = computed(() => props.origin === 'principal')
const canRender = computed(() => props.kind === 'example')

function snippetFor(name: string): string {
    return props.kind === 'template'
        ? `#import "templates/${name}"`
        : `#include "examples/${name}"`
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Non-HTTPS contexts (e.g. local dev without TLS) block
        // navigator.clipboard. Fall back to a hidden textarea +
        // execCommand('copy') so the affordance still works.
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
            return document.execCommand('copy')
        } catch {
            return false
        } finally {
            textarea.remove()
        }
    }
}

const copied = ref(false)
async function copyImport(): Promise<void> {
    const ok = await copyToClipboard(snippetFor(props.name))
    if (ok) {
        copied.value = true
        setTimeout(() => {
            copied.value = false
        }, 1500)
    }
}

function close(): void {
    emit('close')
}

function onKey(e: KeyboardEvent): void {
    if (!props.open) return
    if (e.key === 'Escape') {
        e.preventDefault()
        close()
    }
}

function onDialogClick(e: MouseEvent): void {
    if (e.target === dialogRef.value) close()
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
    // The watcher above only fires on `open` CHANGE — the parent
    // mounts this modal with `open=true` already, so call
    // showModal() directly here to cover the initial mount.
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
        data-testid="resource-overlay-dialog"
        @click="onDialogClick"
    >
        <div
            class="relative w-full max-w-4xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
            style="max-height: min(720px, calc(100vh - 2rem))"
            tabindex="-1"
        >
            <header class="flex items-center justify-between gap-2 p-3 border-b border-border">
                <div class="flex items-baseline gap-2 min-w-0">
                    <h2
                        class="text-sm font-semibold text-foreground font-mono truncate min-w-0"
                        :title="title"
                        data-testid="resource-overlay-title"
                    >{{ title }}</h2>
                    <span
                        v-if="origin === 'skill'"
                        class="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded border border-border text-muted-foreground bg-muted"
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Built-in
                    </span>
                    <span
                        v-else
                        class="shrink-0 text-[10px] font-medium uppercase tracking-wide rounded border border-border text-muted-foreground bg-muted px-1.5 py-0.5"
                    >Your upload</span>
                </div>
                <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="resource-overlay-close"
                    @click="close"
                >Close</button>
            </header>

            <div class="flex-1 overflow-hidden p-3 min-h-0">
                <div
                    v-if="loading"
                    class="h-full flex items-center justify-center text-sm text-muted-foreground"
                >Loading source…</div>
                <div
                    v-else-if="loadError !== null"
                    class="h-full flex items-center justify-center text-sm text-destructive"
                >{{ loadError }}</div>
                <div
                    v-else-if="rendered !== null"
                    class="h-full flex flex-col gap-3"
                >
                    <div class="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                            Render preview · <code class="font-mono">{{ rendered.format }}</code>
                            <span v-if="rendered.width !== null && rendered.height !== null">
                                · {{ rendered.width }}×{{ rendered.height }}px
                            </span>
                        </span>
                        <span>Ephemeral — nothing saved</span>
                    </div>
                    <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted rounded">
                        <img
                            v-if="rendered.format === 'png' || rendered.format === 'svg'"
                            :src="rendered.blobUrl"
                            :alt="name"
                            class="max-w-full max-h-full object-contain"
                        >
                        <a
                            v-else-if="rendered.format === 'pdf'"
                            :href="rendered.blobUrl"
                            target="_blank"
                            rel="noopener"
                            class="text-sm font-medium text-primary hover:text-primary/80"
                        >Open PDF</a>
                    </div>
                </div>
                <SourceEditor
                    v-else
                    :model-value="content"
                    :rows="22"
                    read-only
                    aria-label="Resource source (read-only)"
                />
            </div>

            <div
                v-if="renderError !== null"
                class="px-3 py-2 text-xs text-destructive border-t border-border bg-destructive/5"
                data-testid="resource-overlay-render-error"
            >{{ renderError }}</div>

            <footer class="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
                <div class="flex items-center gap-2">
                    <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground truncate max-w-xs">{{ snippetFor(name) }}</code>
                    <button
                        type="button"
                        :class="[
                            'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
                            copied ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        ]"
                        :aria-label="`Copy Typst snippet for ${name}`"
                        data-testid="resource-overlay-copy"
                        @click="copyImport"
                    >{{ copied ? 'Copied' : 'Copy' }}</button>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        v-if="canRender"
                        type="button"
                        class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="rendering || loading || content === ''"
                        data-testid="resource-overlay-render"
                        @click="emit('render')"
                    >{{ rendering ? 'Rendering…' : rendered !== null ? 'Re-render' : 'Render' }}</button>
                    <button
                        v-if="canEdit"
                        type="button"
                        class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="loading || content === ''"
                        data-testid="resource-overlay-edit"
                        @click="emit('edit')"
                    >Edit</button>
                    <button
                        type="button"
                        class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="loading || content === ''"
                        data-testid="resource-overlay-open-copy"
                        @click="emit('open-in-editor')"
                    >Open Copy in Editor</button>
                    <button
                        v-if="canDelete"
                        type="button"
                        class="px-3 py-1.5 rounded-md border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-50"
                        :disabled="loading"
                        data-testid="resource-overlay-delete"
                        @click="emit('delete')"
                    >Delete</button>
                </div>
            </footer>
        </div>
    </dialog>
</template>
