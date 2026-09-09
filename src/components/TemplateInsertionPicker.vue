<script setup lang="ts">
/**
 * TemplateInsertionModal — modal for picking a template to
 * `#import` into the editor's source.
 *
 * Replaces the previous inline panel under the editor (which
 * pushed other affordances off-screen as the source grew). The
 * toolbar's "Template" button toggles this modal; on select the
 * snippet lands at the caret via the parent's pickTemplate
 * handler.
 *
 * Mirrors the image picker's structure (grid of cards, click to
 * insert) so the operator's mental model stays uniform: pick a
 * name, the right snippet lands at the caret.
 *
 * The picker emits `insert` with just the name — the parent
 * (CompileForm) builds the snippet. The backend's
 * `templates/<principal>/<name>` partition is the source of
 * truth for what's importable; emitting the name keeps the
 * picker ignorant of that path.
 *
 * Native `<dialog>` for the UA-managed focus trap + ::backdrop.
 * `showModal()` is called from onMounted (the parent mounts
 * with `open=true` so the watcher-on-change path doesn't fire).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TemplateResource } from '../types'

const props = withDefaults(defineProps<{
    open: boolean
    templates: TemplateResource[]
    loading?: boolean
    ariaLabel?: string
}>(), {
    loading: false,
    ariaLabel: 'Insert template',
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', payload: { name: string }): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)

function close(): void {
    emit('close')
}

function onTemplateClick(name: string): void {
    emit('insert', { name })
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
        data-testid="template-insertion-modal"
        @click="onDialogClick"
    >
        <div
            class="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
            style="max-height: min(560px, calc(100vh - 2rem))"
            tabindex="-1"
        >
            <header class="flex items-center justify-between gap-2 p-3 border-b border-border">
                <h2
                    class="text-sm font-semibold text-foreground"
                    data-testid="template-insertion-title"
                >Insert template · <span class="text-muted-foreground font-normal">#import "templates/X.typ"</span></h2>
                <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="template-insertion-close"
                    @click="close"
                >Close</button>
            </header>

            <div class="flex-1 overflow-y-auto p-3">
                <div
                    v-if="loading"
                    class="text-xs text-muted-foreground py-6 text-center"
                >Loading…</div>
                <div
                    v-else-if="templates.length === 0"
                    class="text-xs text-muted-foreground py-6 text-center"
                >No templates uploaded yet. Upload some via the Templates tab first.</div>
                <div
                    v-else
                    class="grid grid-cols-2 sm:grid-cols-3 gap-2"
                >
                    <button
                        v-for="template in templates"
                        :key="template.name"
                        type="button"
                        class="border border-border rounded-md p-2 bg-background hover:border-primary transition-colors text-left"
                        :data-testid="`template-insertion-card-${template.name}`"
                        @click="onTemplateClick(template.name)"
                    >
                        <div
                            class="font-mono text-xs text-foreground truncate"
                            :title="template.name"
                        >{{ template.name }}</div>
                        <div class="text-[10px] text-muted-foreground mt-0.5">Click to insert</div>
                    </button>
                </div>
            </div>
        </div>
    </dialog>
</template>
