<script setup lang="ts">
/**
 * Edit modal for the principal's template / example source.
 *
 * Discriminated by `kind=`. The header reads "Edit template: X.typ"
 * (or "Edit example: …"), the body hosts the shared
 * `<SourceEditor>` so the operator sees the same syntax highlight
 * + scroll-locked overlay the playground editor uses, and the
 * footer exposes a primary "Save" + a secondary "Cancel".
 *
 * Save delegates to the resource store (`updateTemplate` /
 * `updateExample`) so the post-write state (cache row refresh,
 * `error` flag, `uploading` flag) stays in one place. On success
 * we emit `saved` with the new bytes; the parent re-reads the
 * resource so the card grid's `size` / `mtime` reflect the
 * update. On failure the store's `error` is surfaced inline
 * and the modal stays open so the operator can fix the
 * content and try again — never lose unsaved edits to a
 * "Save → modal closes → surprise" race.
 *
 * Backdrop click = cancel (matches the Cancel button). The
 * <dialog>'s UA-managed Esc does the same; a document-level
 * keydown listener ensures happy-dom (which doesn't fire the
 * dialog's cancel sequence) also routes Esc to `close`.
 *
 * Mid-save the modal is locked: Cancel + Save are disabled, and
 * the backdrop click is short-circuited so an impatient click
 * can't race the in-flight PUT and leave the cache in a
 * half-updated state.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useResourceStore } from '../stores/resources'
import SourceEditor from './SourceEditor.vue'

type Kind = 'template' | 'example'

const props = withDefaults(defineProps<{
    open: boolean
    kind: Kind
    name: string
    initialContent: string
    ariaLabel?: string
}>(), {
    ariaLabel: 'Edit text resource',
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', payload: { name: string, content: string }): void
}>()

const store = useResourceStore()
const content = ref(props.initialContent)
const saving = ref(false)
const dialogRef = ref<HTMLDialogElement | null>(null)

const title = computed(() => `Edit ${props.kind}: ${props.name}`)

function close(): void {
    if (saving.value) return
    emit('close')
}

async function onSave(): Promise<void> {
    if (saving.value) return
    saving.value = true
    store.clearError()
    try {
        const updated = props.kind === 'template'
            ? await store.updateTemplate(props.name, content.value)
            : await store.updateExample(props.name, content.value)
        if (updated !== null) {
            emit('saved', { name: props.name, content: content.value })
        }
    } finally {
        saving.value = false
    }
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
        // Re-seed the editor on every open. The store call below
        // already replaced the row in the cache, so re-reading
        // `initialContent` keeps the modal showing the latest
        // server-side state on the next open (e.g. after the
        // parent refreshes the source via the store).
        content.value = props.initialContent
        store.clearError()
        void nextTick(() => {
            dialogRef.value?.showModal()
        })
    }
})

watch(() => props.initialContent, (next) => {
    // Track a silent parent refresh while the modal is closed so
    // a stale buffer doesn't survive across opens. While saving
    // the user owns the buffer, so don't yank it out from under
    // them.
    if (!saving.value) {
        content.value = next
    }
})

onMounted(() => {
    document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <!--
    Same shape as `OpenPickerModal` — native <dialog> for the
    UA-managed focus trap + ::backdrop, rendered directly in the
    SFC's mount tree (no <Teleport>) so Tailwind's
    `#spora-plugin-typst` scope survives.
  -->
  <dialog
    v-if="open"
    ref="dialogRef"
    class="fixed inset-0 z-50 m-0 max-w-none max-h-none w-full h-full p-4 bg-transparent backdrop:bg-black/40 open:flex items-center justify-center"
    aria-modal="true"
    :aria-label="ariaLabel"
    data-testid="text-resource-edit-dialog"
    @click="onDialogClick"
  >
    <div
      class="relative w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
      style="max-height: min(720px, calc(100vh - 2rem))"
      tabindex="-1"
    >
      <header class="flex items-center justify-between gap-2 p-3 border-b border-border">
        <h2
          class="text-sm font-medium text-foreground font-mono truncate min-w-0"
          :title="title"
          data-testid="text-resource-edit-title"
        >{{ title }}</h2>
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          data-testid="text-resource-edit-close"
          :disabled="saving"
          @click="close"
        >Close</button>
      </header>
      <div class="flex-1 overflow-hidden p-3 min-h-0">
        <SourceEditor
          v-model="content"
          :rows="22"
        />
      </div>
      <div
        v-if="store.error"
        class="px-3 py-2 text-xs text-destructive border-t border-border bg-destructive/5"
        data-testid="text-resource-edit-error"
      >{{ store.error }}</div>
      <footer class="flex items-center justify-end gap-2 px-3 py-2 border-t border-border">
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
          data-testid="text-resource-edit-cancel"
          :disabled="saving"
          @click="close"
        >Cancel</button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          data-testid="text-resource-edit-save"
          :disabled="saving"
          @click="onSave"
        >{{ saving ? 'Saving…' : 'Save' }}</button>
      </footer>
    </div>
  </dialog>
</template>
