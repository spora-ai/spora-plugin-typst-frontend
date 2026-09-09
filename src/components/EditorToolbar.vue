<script setup lang="ts">
/**
 * Editor toolbar — sits directly above the source editor.
 *
 * Two slots:
 *   - `#leading` (default): the formatting tools (Heading, Bold,
 *     Italic, Underline, Link). Each button reads the
 *     `<SourceEditor>`'s current selection, dispatches through
 *     the matching tool definition in `useEditorToolbar.ts`,
 *     and writes back via `editorRef.replaceSelection(snippet)`.
 *
 *   - `#trailing`: caller-provided slot for the Insert Template /
 *     Insert Image buttons that used to live under the editor.
 *     Kept as a slot (not a built-in) so the toolbar doesn't
 *     own the picker state — the pickers stay in `CompileForm.vue`
 *     where their state already lives.
 *
 * Sticky on scroll (`sticky top-0`) so the formatting tools
 * stay reachable while the operator scrolls through a long
 * document. Sticky is relative to the toolbar's nearest
 * scrolling ancestor (the page), so it lifts as the operator
 * scrolls past the editor — which is what they want.
 *
 * Each tool button:
 *   - Reads `editorRef.getSelection()` to decide wrap vs insert
 *   - Calls `editorRef.replaceSelection(snippet)` to write back
 *   - Calls `editorRef.focus()` to keep the caret in the editor
 *     so the next keystroke lands in the buffer
 *
 * No keyboard shortcuts in this commit — those are a follow-up.
 */
import { FORMATTING_TOOLS, applyTool, caretOffsetForPlaceholder, type ToolbarTool } from '../composables/useEditorToolbar'

/**
 * Structural interface for the editor surface the toolbar drives.
 * Defined inline (rather than importing `InstanceType<typeof
 * SourceEditor>`) so tests can stub the editor without dragging in
 * the full SourceEditor typing — the toolbar only needs three
 * methods + the textarea ref, all of which are easy to fake.
 */
export interface EditorSurface {
    getSelection: () => string | null
    replaceSelection: (text: string) => void
    focus: () => void
    textarea: { selectionStart: number | null; setSelectionRange: (start: number, end: number) => void; focus: () => void } | null
}

const props = defineProps<{
    editorRef: { value: EditorSurface | null }
}>()

function onToolClick(tool: ToolbarTool): void {
    const editor = props.editorRef.value
    if (editor === null) return
    const selection = editor.getSelection()
    const snippet = applyTool(tool, selection)
    editor.replaceSelection(snippet)
    // Restore caret at the placeholder's natural insertion point
    // (e.g. inside `*…*`) so the next keystroke lands in the
    // buffer without re-typing markers.
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
        editor.focus()
    }
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
    </div>
</template>
