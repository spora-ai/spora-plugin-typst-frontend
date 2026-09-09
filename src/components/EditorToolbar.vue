<script setup lang="ts">
/**
 * Editor toolbar — sits directly above the source editor.
 *
 * Three tool kinds are dispatched here:
 *   - `wrap` — the symmetric tools (Bold, Italic, Underline)
 *     wrap a non-empty selection in their delimiters or insert
 *     a placeholder at the caret when no selection is active.
 *   - `line-start` — Heading inserts `= ` at the START of the
 *     caret's current line so the active line becomes a
 *     heading. Column position inside the line is preserved.
 *   - `link-dialog` — Link opens `<LinkInsertDialog>` with URL
 *     + label inputs. The selection pre-fills the label.
 *
 * The toolbar slots:
 *   - `#trailing` — caller-provided slot for the Insert Template /
 *     Insert Image buttons. Those pickers are modal-driven now
 *     (see `<ImageInsertModal>` and `<TemplateInsertModal>`),
 *     so the slot is just the trigger buttons.
 *
 * Sticky on scroll (`sticky top-0`) so the formatting tools
 * stay reachable while the operator scrolls through a long
 * document.
 *
 * Each tool button:
 *   - Reads `editorRef.getSelection()` for wrap tools
 *   - Dispatches through `editorRef.insertAtCaret` /
 *     `insertAtLineStart` accordingly
 *   - Re-focuses the editor with `preventScroll: true` so the
 *     textarea's scroll position survives the toolbar click
 *     (the previous default scrolled the operator away from
 *     whatever they were reading further down)
 *
 * No keyboard shortcuts in this commit — those are a follow-up.
 */
import { ref } from 'vue'
import {
    FORMATTING_TOOLS,
    applyTool,
    caretOffsetForPlaceholder,
    type ToolbarTool,
} from '../composables/useEditorToolbar'
import LinkInsertDialog from './LinkInsertDialog.vue'

/**
 * Structural interface for the editor surface the toolbar drives.
 * Defined inline (rather than importing `InstanceType<typeof
 * SourceEditor>`) so tests can stub the editor without dragging in
 * the full SourceEditor typing — the toolbar only needs three
 * methods + the textarea ref, all of which are easy to fake.
 */
export interface EditorSurface {
    getSelection: () => string | null
    insertAtCaret: (text: string) => void
    insertAtLineStart: (text: string) => void
    focus: (opts?: { preventScroll?: boolean }) => void
    textarea: { selectionStart: number | null; setSelectionRange: (start: number, end: number) => void; focus: () => void } | null
}

const props = defineProps<{
    editorRef: EditorSurface | null
}>()

const showLinkDialog = ref(false)
const linkInitialUrl = ref('')
const linkInitialLabel = ref('')

function onToolClick(tool: ToolbarTool): void {
    const editor = props.editorRef
    if (editor === null) return

    if (tool.kind === 'link-dialog') {
        // Pre-fill the label with the operator's current selection
        // so they can highlight some text, click Link, and only
        // need to fill in the URL.
        const selection = editor.getSelection()
        linkInitialLabel.value = selection ?? 'label'
        linkInitialUrl.value = ''
        showLinkDialog.value = true
        return
    }

    if (tool.kind === 'line-start') {
        editor.insertAtLineStart(tool.placeholder)
        editor.focus({ preventScroll: true })
        return
    }

    // wrap tool
    const selection = editor.getSelection()
    const snippet = applyTool(tool, selection)
    editor.insertAtCaret(snippet)
    // Re-position the caret at the placeholder's natural
    // insertion point so the next keystroke lands inside the
    // open markers (e.g. inside `*…*` for Bold).
    const caretOffset = caretOffsetForPlaceholder(snippet)
    if (caretOffset >= 0) {
        const ta = editor.textarea
        if (ta !== null) {
            requestAnimationFrame(() => {
                const ta2 = editor.textarea
                if (ta2 === null) return
                const cursor = ta.selectionStart ?? 0
                ta2.focus()
                ta2.setSelectionRange(cursor + caretOffset, cursor + caretOffset)
            })
        }
    } else {
        editor.focus({ preventScroll: true })
    }
}

function onLinkConfirm(payload: { url: string; label: string }): void {
    const editor = props.editorRef
    if (editor === null) {
        showLinkDialog.value = false
        return
    }
    const label = payload.label === '' ? 'label' : payload.label
    const snippet = `#link("${payload.url}")[${label}]`
    editor.insertAtCaret(snippet)
    editor.focus({ preventScroll: true })
    showLinkDialog.value = false
}

function onLinkCancel(): void {
    showLinkDialog.value = false
}
</script>

<template>
    <div
        class="sticky top-0 z-10 flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/40"
        role="toolbar"
        aria-label="Editor formatting tools"
    >
        <div class="flex items-center gap-1">
            <button
                v-for="tool in FORMATTING_TOOLS"
                :key="tool.label"
                type="button"
                class="px-2 py-1 rounded text-xs font-medium text-foreground hover:bg-background hover:text-foreground border border-transparent hover:border-border transition-colors"
                :aria-label="tool.label"
                :title="tool.label"
                :data-testid="`editor-tool-${tool.label.toLowerCase()}`"
                @click="onToolClick(tool)"
            >{{ tool.label }}</button>
        </div>
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <slot name="trailing" />

        <LinkInsertDialog
            :open="showLinkDialog"
            :initial-url="linkInitialUrl"
            :initial-label="linkInitialLabel"
            @confirm="onLinkConfirm"
            @cancel="onLinkCancel"
        />
    </div>
</template>
