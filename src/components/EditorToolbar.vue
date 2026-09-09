<script setup lang="ts">
/**
 * Editor toolbar — sits directly above the source editor.
 *
 * Composition:
 *   - `<HeadingMenu>` (H1–H5 picker) — rendered before the
 *     wrap tools since operators reach for headings before
 *     inline emphasis.
 *   - Wrap tools (Bold, Italic, Underline) — symmetric
 *     delimiter-pair tools that wrap a selection or insert a
 *     placeholder.
 *   - Link (link-dialog kind) — opens `<LinkInsertDialog>`.
 *   - `#trailing` slot — caller-provided slot for the Insert
 *     Template / Insert Image trigger buttons.
 *
 * Each tool button:
 *   - Reads `editorRef.getSelection()` for wrap tools
 *   - Dispatches through `editorRef.insertAtCaret`
 *   - Re-focuses the editor with `preventScroll: true` so the
 *     textarea's scroll position survives the toolbar click
 *
 * The HeadingMenu emits `insert` with a level (1–5); the toolbar
 * delegates to `editorRef.applyHeadingAtCaret(level)`, which
 * replaces any existing heading marker on the caret's line so
 * clicking H3 on an already-H1 line cleanly upgrades to `=== `
 * rather than stacking `== = ` on top.
 *
 * Sticky on scroll (`sticky top-0`) so the formatting tools
 * stay reachable while the operator scrolls through a long
 * document.
 *
 * No keyboard shortcuts in this commit — those are a follow-up.
 */
import { ref, watchEffect } from 'vue'
import {
    FORMATTING_TOOLS,
    applyTool,
    caretOffsetForPlaceholder,
    type ToolbarTool,
} from '../composables/useEditorToolbar'
import HeadingMenu from './HeadingMenu.vue'
import LinkInsertDialog from './LinkInsertDialog.vue'

/**
 * Structural interface for the editor surface the toolbar drives.
 * Defined inline (rather than importing `InstanceType<typeof
 * SourceEditor>`) so tests can stub the editor without dragging in
 * the full SourceEditor typing — the toolbar only needs a handful
 * of methods + the textarea ref, all of which are easy to fake.
 *
 * The `textarea` shape carries the DOM event listeners the
 * toolbar subscribes to (input + select) — keeps the
 * EditorSurface contract honest about what the toolbar reaches
 * into on the textarea.
 */
export interface EditorSurface {
    getSelection: () => string | null
    getHeadingLevelAtCaret: () => number | null
    insertAtCaret: (text: string) => void
    insertAtLineStart: (text: string) => void
    applyHeadingAtCaret: (level: number) => void
    focus: (opts?: { preventScroll?: boolean }) => void
    textarea: {
        selectionStart: number | null
        setSelectionRange: (start: number, end: number) => void
        focus: () => void
        addEventListener: (event: string, handler: (e: Event) => void) => void
        removeEventListener: (event: string, handler: (e: Event) => void) => void
    } | null
}

const props = defineProps<{
    editorRef: EditorSurface | null
    /** Whether the editor is busy (mid-render). Toolbar buttons disable when true. */
    busy?: boolean
    /**
     * Current heading level of the caret's line, if detectable.
     * Drives the HeadingMenu trigger label ("H1" vs "Heading")
     * and highlights the active level in the popover. `null`
     * means the line has no heading marker.
     */
    currentLevel?: number | null
}>()

const showLinkDialog = ref(false)
const linkInitialUrl = ref('')
const linkInitialLabel = ref('')

/**
 * Live heading level for the caret's current line, recomputed
 * every time the source changes (via a manual subscription on
 * the editor's v-model). `null` when the line has no marker.
 * Drives the HeadingMenu trigger label ("Heading" vs "H<n>")
 * and the active-level highlight in the popover.
 */
const liveHeadingLevel = ref<number | null>(null)

function refreshCurrentLevel(): void {
    const editor = props.editorRef
    if (editor === null) {
        liveHeadingLevel.value = null
        return
    }
    liveHeadingLevel.value = editor.getHeadingLevelAtCaret()
}

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

function onHeadingInsert(level: number): void {
    const editor = props.editorRef
    if (editor === null) return
    editor.applyHeadingAtCaret(level)
    editor.focus({ preventScroll: true })
    // HeadingMenu's trigger label / active highlight reflect
    // the new level — re-read it from the editor now that the
    // buffer has changed.
    refreshCurrentLevel()
}

/**
 * Keep `currentLevel` in sync with the editor's caret + buffer
 * state. Re-runs whenever the editor ref swaps (e.g. the
 * SourceEditor remounts) and binds to the textarea's `input`
 * (typing) + `select` (caret move) events so manual edits +
 * caret navigation both trigger a refresh.
 */
watchEffect((onCleanup) => {
    const ta = props.editorRef?.textarea
    if (ta === null) return
    // Non-null assertion is safe — the early return above
    // already narrowed the optional chain. TS doesn't carry
    // the narrowing across subsequent property accesses on
    // a reactive prop, so the assertion is needed to make
    // the closure handlers below type-check.
    const ta2 = ta!
    const handler = (): void => refreshCurrentLevel()
    refreshCurrentLevel()
    ta2.addEventListener('input', handler)
    ta2.addEventListener('select', handler)
    onCleanup(() => {
        ta2.removeEventListener('input', handler)
        ta2.removeEventListener('select', handler)
    })
})

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
        <HeadingMenu
            :current-level="liveHeadingLevel"
            :disabled="busy"
            @insert="onHeadingInsert"
        />
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
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
