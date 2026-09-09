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
 *   - `focus()` — focus the underlying textarea (used by
 *     `CompileForm.loadStarter` after populating STARTER).
 *   - `textarea` — the raw `<textarea>` element, for cursor-aware
 *     insertion (`CompileForm.insertAtCursor` after an image is
 *     picked from the picker).
 *   - `insertAtCursor(text)` — splice `text` into the buffer at
 *     the current caret (or replace the current selection), then
 *     re-focus and position the caret just after the insertion.
 *     Used by the formatting toolbar and the image / template
 *     pickers.
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
        ta2.focus()
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
function insertAtCursor(text: string): void {
    replaceSelection(text)
}

defineExpose({
    focus: () => textareaRef.value?.focus(),
    textarea: textareaRef,
    insertAtCursor,
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
