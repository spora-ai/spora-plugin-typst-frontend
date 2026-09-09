<script setup lang="ts">
/**
 * LinkInsertDialog — small modal that asks for a URL + label
 * before inserting a `#link("…")[…]` snippet.
 *
 * Pre-fill rules:
 *   - `initialLabel` defaults to the textarea's current
 *     selection when the operator clicks Link from the toolbar
 *     with text selected.
 *   - `initialUrl` is empty by default; the operator types the
 *     URL.
 *
 * On confirm:
 *   Emits `confirm` with `{ url, label }` so the toolbar can
 *   build the snippet `#link("<url>")[<label>]` and call
 *   `insertAtCursor` on the editor.
 *
 * On cancel:
 *   Emits `cancel` (or just close).
 *
 * Native `<dialog>` so the toolbar's other dialog (the editor
 * overlay isn't one, but the picker modals are) keeps keyboard
 * handling consistent — Esc / backdrop click work without
 * custom handlers.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
    open: boolean
    initialUrl?: string
    initialLabel?: string
    ariaLabel?: string
}>(), {
    initialUrl: '',
    initialLabel: '',
    ariaLabel: 'Insert link',
})

const emit = defineEmits<{
    (e: 'confirm', payload: { url: string; label: string }): void
    (e: 'cancel'): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const url = ref(props.initialUrl)
const label = ref(props.initialLabel)

watch(() => props.open, (open) => {
    if (open) {
        // Re-seed the inputs every open so a fresh selection /
        // prefill from the toolbar updates them.
        url.value = props.initialUrl
        label.value = props.initialLabel
        void nextTick(() => {
            dialogRef.value?.showModal()
            // Focus the URL field by default so the operator
            // can start typing immediately; pre-filled label
            // needs no attention.
            urlInputRef.value?.focus()
        })
    }
})

const urlInputRef = ref<HTMLInputElement | null>(null)
const labelInputRef = ref<HTMLInputElement | null>(null)

function onConfirm(e: Event): void {
    e.preventDefault()
    emit('confirm', { url: url.value, label: label.value })
}

function close(): void {
    emit('cancel')
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
        data-testid="link-insert-dialog"
        @click="onDialogClick"
    >
        <form
            class="relative w-full max-w-md rounded-lg border border-border bg-card shadow-2xl flex flex-col"
            tabindex="-1"
            @submit="onConfirm"
        >
            <header class="flex items-center justify-between gap-2 p-3 border-b border-border">
                <h2
                    class="text-sm font-semibold text-foreground"
                    data-testid="link-insert-title"
                >Insert link</h2>
                <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="link-insert-close"
                    @click="close"
                >Close</button>
            </header>

            <div class="p-3 space-y-3">
                <label class="block space-y-1">
                    <span class="block text-xs font-medium text-foreground">URL</span>
                    <input
                        ref="urlInputRef"
                        v-model="url"
                        type="url"
                        placeholder="https://example.com"
                        class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-foreground text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                        aria-label="Link URL"
                        data-testid="link-insert-url"
                        required
                    />
                </label>
                <label class="block space-y-1">
                    <span class="block text-xs font-medium text-foreground">Label</span>
                    <input
                        ref="labelInputRef"
                        v-model="label"
                        type="text"
                        placeholder="link text"
                        class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-foreground text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                        aria-label="Link label"
                        data-testid="link-insert-label"
                    />
                </label>
                <p class="text-[10px] text-muted-foreground">
                    Inserted as <code class="font-mono">#link("&lt;url&gt;")[&lt;label&gt;]</code>
                </p>
            </div>

            <footer class="flex items-center justify-end gap-2 px-3 py-2 border-t border-border">
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted"
                    data-testid="link-insert-cancel"
                    @click="close"
                >Cancel</button>
                <button
                    type="submit"
                    class="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    :disabled="url === ''"
                    data-testid="link-insert-confirm"
                >Insert</button>
            </footer>
        </form>
    </dialog>
</template>
