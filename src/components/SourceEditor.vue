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

defineExpose({
    focus: () => textareaRef.value?.focus(),
    textarea: textareaRef,
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
