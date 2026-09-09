<script setup lang="ts">
/**
 * Reusable Typst source editor — textarea + syntax-highlighted
 * overlay, scroll-locked.
 *
 * Extracted from the inlined markup in `CompileForm.vue` so the
 * Templates and Examples edit modals (follow-up commits) can use
 * the same editor surface. Behaviour matches the previous inlined
 * version exactly.
 *
 * Architecture: a transparent `<textarea>` stacked on top of a
 * `<pre>` containing hljs-highlighted HTML. Both share the same
 * font, padding, line-height, box-sizing, letter-spacing, tab-size,
 * font-variant-ligatures, and text-rendering so the highlight
 * glyphs line up under the caret. The pre is `pointer-events: none`
 * — all clicks fall through to the textarea. Scroll position is
 * mirrored from the textarea onto the pre on every scroll event.
 *
 * hljs escapes its output, so `v-html` is XSS-safe.
 *
 * Trailing newline: hljs strips a final newline, which makes the
 * last line shorter than the textarea's last line. We always
 * append `\n` so the caret on an empty last line still lines up.
 *
 * `readOnly=true` sets the textarea's `readonly` attribute so the
 * Templates/Examples "View source" preview can show the source
 * without allowing edits (and still let operators scroll + select
 * to copy).
 *
 * Exposes:
 *   - `focus(opts?)` — focus the underlying textarea. The
 *     toolbar passes `{ preventScroll: true }` after every
 *     insertion so clicking Bold / Italic / Heading doesn't
 *     yank the textarea's scroll position back to the caret.
 *   - `textarea` — the raw `<textarea>` element, for cursor-aware
 *     insertion (`CompileForm.insertAtCursor` after an image is
 *     picked from the picker).
 *   - `insertAtCursor(text)` — splice `text` into the buffer at
 *     the current caret (or replace the current selection), then
 *     re-focus and position the caret just after the insertion.
 *     Used by the formatting toolbar and the image / template
 *     pickers.
 *   - `insertAtLineStart(text)` — splice `text` at the start of
 *     the caret's current line. The caret position inside the
 *     line is preserved (the inserted text shifts the caret
 *     right by `text.length`). Used by the Heading tool, which
 *     prefixes the active line with `= `.
 *   - `applyHeadingAtCaret(level)` — set the caret's line to a
 *     heading of `level` (1–5). Replaces any existing heading
 *     marker on the line so repeated clicks don't stack
 *     markers; if the line has no marker, prepends `= × level`
 *     followed by a space. The caret stays anchored at the
 *     same content offset (e.g. column 3 of "foo" stays at the
 *     'o' even after wrapping with `= = foo`).
 *   - `getHeadingLevelAtCaret()` — return the heading level (1–5)
 *     of the caret's current line, or `null` if the line has no
 *     heading marker. Drives the HeadingMenu trigger label
 *     ("Heading" vs "H<n>") and the active-level highlight in
 *     the popover.
 *   - `replaceSelection(text)` — write `text` over the current
 *     selection (or insert at caret if no selection). Used by the
 *     formatting tools when wrapping selected text in `*…*`,
 *     `_…_`, `#underline[…]`, etc.
 *   - `getSelection()` — return the currently selected substring,
 *     or `null` if the textarea has no selection. The toolbar
 *     uses this to decide between "wrap selection" and "insert
 *     placeholder" behaviour for each formatting tool.
 *
 * Both insert/replace methods write back to the model via the
 * same `@input` event the user's typing triggers, so any
 * downstream `v-model` consumer sees a single update per call
 * and the highlight overlay re-renders synchronously.
 */
import { computed, ref } from 'vue'
import { highlightTypst } from 'highlightjs-typst/highlight'

const props = withDefaults(
    defineProps<{
        modelValue: string
        placeholder?: string
        rows?: number
        readOnly?: boolean
        ariaLabel?: string
    }>(),
    {
        placeholder: '',
        rows: 18,
        readOnly: false,
        ariaLabel: 'Typst source',
    },
)

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const highlightRef = ref<HTMLPreElement | null>(null)

const highlightedSource = computed(() => highlightTypst(props.modelValue) + '\n')

/**
 * Mirror the textarea's scroll position onto the highlighted
 * `<pre>` so they stay in lockstep. Both elements share the same
 * width and the `<pre>` is `pointer-events: none` so it only
 * scrolls via this handler.
 */
function onEditorScroll(): void {
    const ta = textareaRef.value
    const pre = highlightRef.value
    if (ta === null || pre === null) return
    pre.scrollTop = ta.scrollTop
    pre.scrollLeft = ta.scrollLeft
}

/**
 * Return the substring the user has selected, or `null` when the
 * caret is collapsed (no selection). The textarea's
 * `selectionStart === selectionEnd` is the canonical "no
 * selection" check — both indices are equal when the user has
 * clicked but not dragged.
 */
function getSelection(): string | null {
    const ta = textareaRef.value
    if (ta === null) return null
    const start = ta.selectionStart
    const end = ta.selectionEnd
    if (start === end) return null
    return ta.value.slice(start, end)
}

/**
 * Replace the current selection with `text`, or insert `text` at
 * the caret if there is no selection. Mirrors the behaviour of
 * the image / template pickers (which only ever insert at the
 * caret) but adds the selection-replace branch so the
 * formatting toolbar's wrap-selection case works without
 * dispatching two events.
 *
 * Writing via the same setter the `@input` handler uses keeps
 * the `v-model` consumer unaware that the change came from JS
 * rather than the keyboard.
 *
 * The post-write `focus()` passes `preventScroll: true` so the
 * browser doesn't yank the textarea back to the caret on every
 * toolbar click — operators were getting scrolled away from
 * whatever they were reading further down in the document.
 */
function replaceSelection(text: string): void {
    const ta = textareaRef.value
    if (ta === null) {
        // No DOM access — fall back to appending, mirroring the
        // image picker's defensive branch.
        const next = props.modelValue + text
        emit('update:modelValue', next)
        return
    }
    const start = ta.selectionStart ?? props.modelValue.length
    const end = ta.selectionEnd ?? props.modelValue.length
    const next = props.modelValue.slice(0, start) + text + props.modelValue.slice(end)
    emit('update:modelValue', next)
    requestAnimationFrame(() => {
        const ta2 = textareaRef.value
        if (ta2 === null) return
        ta2.focus({ preventScroll: true })
        ta2.setSelectionRange(start + text.length, start + text.length)
    })
}

/**
 * Insert `text` at the caret, replacing any active selection.
 * Equivalent to `replaceSelection(text)` today but kept as a
 * distinct method so callers can document the intent — image /
 * template pickers are "insert at caret", the formatting toolbar
 * is "wrap selection or insert placeholder".
 */
function insertAtCaret(text: string): void {
    replaceSelection(text)
}

/**
 * Insert `text` at the start of the caret's current line,
 * preserving the caret's column position inside that line.
 * Used by the Heading tool to prefix the active line with
 * `= ` without disrupting the operator's column.
 *
 * If the caret is on the very first line, `lineStart` is 0.
 * If the caret sits inside an empty line (no characters before
 * the next `\n`), `lineStart` collapses to the column 0 of the
 * line — `= ` lands right at the start.
 */
function insertAtLineStart(text: string): void {
    const ta = textareaRef.value
    if (ta === null) {
        const next = text + props.modelValue
        emit('update:modelValue', next)
        return
    }
    const caret = ta.selectionStart ?? 0
    let lineStart = caret
    while (lineStart > 0 && props.modelValue[lineStart - 1] !== '\n') {
        lineStart--
    }
    const next = props.modelValue.slice(0, lineStart) + text + props.modelValue.slice(lineStart)
    emit('update:modelValue', next)
    requestAnimationFrame(() => {
        const ta2 = textareaRef.value
        if (ta2 === null) return
        ta2.focus({ preventScroll: true })
        // Place caret just after the inserted snippet (it shifts
        // right by text.length from its old position).
        ta2.setSelectionRange(caret + text.length, caret + text.length)
    })
}

/**
 * Set the caret's current line to a heading of `level` (1–5).
 * Replaces any existing heading marker on the line so repeated
 * clicks don't stack `= = = …` markers — picking H3 on an
 * already-H2 line cleanly replaces `== ` with `=== ` rather
 * than appending a third one (which would still render as H2
 * in Typst but looks broken to the operator).
 *
 * Detection: the line must start with `=` repeated 1+ times
 * followed by a single whitespace char (Typst's heading
 * grammar — `=` without a trailing space is just literal
 * `=` characters in markup, not a heading). If no marker, the
 * line is treated as plain text and the marker is prepended.
 *
 * Caret positioning: the caret stays anchored to the same
 * content offset relative to the line. If the line was
 * "foo bar" with caret at column 4 ('b'), and we add a level-1
 * heading marker, the caret lands at "foo |bar" — column 4
 * of the new line, between 'foo ' and 'bar'. The existing
 * column anchor survives both the prepend and the replace
 * paths.
 */
function applyHeadingAtCaret(level: number): void {
    const ta = textareaRef.value
    if (ta === null) return
    const source = props.modelValue
    const caret = ta.selectionStart ?? 0
    let lineStart = caret
    while (lineStart > 0 && source[lineStart - 1] !== '\n') {
        lineStart--
    }
    let lineEnd = source.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = source.length
    const line = source.slice(lineStart, lineEnd)
    const marker = '='.repeat(Math.max(1, Math.min(5, level))) + ' '
    const headingMatch = line.match(/^(=+)(\s)/)
    let newLine: string
    let oldMarkerLength: number
    if (headingMatch) {
        oldMarkerLength = headingMatch[0].length
        newLine = marker + line.slice(oldMarkerLength)
    } else {
        oldMarkerLength = 0
        newLine = marker + line
    }
    const newSource = source.slice(0, lineStart) + newLine + source.slice(lineEnd)
    emit('update:modelValue', newSource)
    requestAnimationFrame(() => {
        const ta2 = textareaRef.value
        if (ta2 === null) return
        ta2.focus({ preventScroll: true })
        // Caret stays anchored to the same content offset relative
        // to the line. The delta = newMarkerLength - oldMarkerLength.
        const delta = marker.length - oldMarkerLength
        const newCaret = caret + delta
        ta2.setSelectionRange(newCaret, newCaret)
    })
}

/**
 * Return the heading level of the caret's current line, or
 * `null` if no marker. Pure read — doesn't move the caret or
 * emit any update.
 *
 * Detection mirrors `applyHeadingAtCaret`'s heading regex:
 * the line must start with `=` repeated 1+ times followed by
 * a single whitespace char (Typst's heading grammar — bare
 * `=` without a trailing space is literal markup, not a
 * heading). The level is capped at 5 because Typst only has
 * five heading levels.
 */
function getHeadingLevelAtCaret(): number | null {
    const ta = textareaRef.value
    if (ta === null) return null
    const source = props.modelValue
    const caret = ta.selectionStart ?? 0
    let lineStart = caret
    while (lineStart > 0 && source[lineStart - 1] !== '\n') {
        lineStart--
    }
    let lineEnd = source.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = source.length
    const line = source.slice(lineStart, lineEnd)
    const match = line.match(/^(=+)(\s)/)
    if (match === null) return null
    return Math.min(match[1].length, 5)
}

defineExpose({
    focus: (opts?: { preventScroll?: boolean }) => {
        textareaRef.value?.focus(opts)
    },
    textarea: textareaRef,
    insertAtCaret,
    insertAtLineStart,
    applyHeadingAtCaret,
    getHeadingLevelAtCaret,
    replaceSelection,
    getSelection,
})
</script>

<template>
    <div class="typst-editor rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-1 focus:ring-ring">
        <pre
            ref="highlightRef"
            class="typst-editor__highlight"
            aria-hidden="true"
        ><code class="hljs language-typst" v-html="highlightedSource"></code></pre>
        <textarea
            ref="textareaRef"
            :value="modelValue"
            :rows="rows"
            :placeholder="placeholder"
            :readonly="readOnly"
            :aria-label="ariaLabel"
            class="typst-editor__textarea"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
            @scroll="onEditorScroll"
        ></textarea>
    </div>
</template>
