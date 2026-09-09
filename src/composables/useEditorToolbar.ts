import type { Component } from 'vue'

/**
 * Tool definition consumed by `EditorToolbar.vue`.
 *
 * Each tool reads the current selection (or null when the caret
 * is collapsed) and returns the snippet that should land in the
 * buffer. The toolbar's dispatcher wraps the selection branch
 * with the tool's `wrap` template when one is provided; otherwise
 * it just inserts `placeholder` at the caret.
 *
 * Two tool shapes are supported today:
 *
 *   1. Selection-agnostic — Heading inserts `= Heading\n` at the
 *      caret and prefixes every selected line with `= ` when
 *      there is a selection. The `wrap` function handles both.
 *
 *   2. Symmetric — Bold, Italic, Underline, Link wrap a non-null
 *      selection in their respective delimiters and fall back to
 *      `placeholder` when no selection is active.
 *
 * `icon` is optional — tools without an icon render as
 * text-only buttons. The toolbar slots tools left-to-right in
 * declaration order so the visible order matches the array.
 */
export interface ToolbarTool {
    /** Visible button label (also the aria-label). */
    label: string
    /**
     * Optional inline SVG component. When omitted the button
     * renders label-only. Kept narrow so callers can hand the
     * toolbar pre-built icon components without forcing a shared
     * icon library on this file.
     */
    icon?: Component
    /**
     * Placeholder text inserted at the caret when no text is
     * selected. The caret lands at the placeholder's "natural"
     * insertion point — for symmetric tools this is the middle of
     * the placeholder so a subsequent insert lands inside the
     * open/close markers.
     */
    placeholder: string
    /**
     * Wrap `selection` in the tool's delimiters (Bold, Italic,
     * Underline, Link) or rewrite each line with a prefix
     * (Heading). Returns the snippet the toolbar should splice
     * into the buffer.
     */
    wrap: (selection: string) => string
}

/**
 * Heading: prefix every selected line with `= ` (Typst's level-1
 * heading marker). With no selection, insert a level-1 placeholder.
 * Multi-line selections get one `= ` per line so the operator can
 * apply the toolbar to a whole block without losing line breaks.
 */
const headingTool: ToolbarTool = {
    label: 'Heading',
    placeholder: '= Heading\n',
    wrap: (selection) =>
        selection
            .split('\n')
            .map((line) => (line === '' ? '= ' : `= ${line}`))
            .join('\n'),
}

/**
 * Bold: wrap selection in `*…*`. With no selection, insert
 * `*bold text*`. The caret lands in the middle (after `*`) so a
 * subsequent keystroke starts inside the markers.
 */
const boldTool: ToolbarTool = {
    label: 'Bold',
    placeholder: '*bold text*',
    wrap: (selection) => `*${selection}*`,
}

/**
 * Italic: wrap selection in `_…_`. With no selection, insert
 * `_italic text_`.
 */
const italicTool: ToolbarTool = {
    label: 'Italic',
    placeholder: '_italic text_',
    wrap: (selection) => `_${selection}_`,
}

/**
 * Underline: wrap selection in `#underline[…]`. With no
 * selection, insert `#underline[underlined]`. Typst's underline
 * is a function call rather than a delimiter pair — the `#` and
 * `[]` bracket the text.
 */
const underlineTool: ToolbarTool = {
    label: 'Underline',
    placeholder: '#underline[underlined]',
    wrap: (selection) => `#underline[${selection}]`,
}

/**
 * Link: wrap selection as `#link("")[…]` so the operator can
 * fill in the URL. With no selection, insert a template with a
 * placeholder URL. Typst's link is a function call too — the
 * URL is a string argument, the label is the body.
 */
const linkTool: ToolbarTool = {
    label: 'Link',
    placeholder: '#link("https://example.com")[label]',
    wrap: (selection) => `#link("https://example.com")[${selection}]`,
}

/**
 * The five formatting tools, in declaration order. The toolbar
 * renders them left-to-right. Heading sits first because it's
 * the most common transform and operators reach for it before
 * inline emphasis.
 */
export const FORMATTING_TOOLS: readonly ToolbarTool[] = [
    headingTool,
    boldTool,
    italicTool,
    underlineTool,
    linkTool,
] as const

/**
 * Decide what to splice into the buffer when the operator
 * clicks a tool. Mirrors how every common WYSIWYG toolbar
 * behaves:
 *
 *   - With a non-empty selection: call `tool.wrap(selection)`.
 *     The wrap function is responsible for adding delimiters.
 *   - With a collapsed caret: insert `tool.placeholder` at the
 *     caret. The placeholder's structure mirrors what the wrap
 *     function would have produced so the operator can type into
 *     it without re-typing markers.
 *
 * Hoisted to module scope so the toolbar component can call it
 * from its click handler without dragging a per-tool `if/else`
 * ladder into the template.
 */
export function applyTool(tool: ToolbarTool, selection: string | null): string {
    if (selection !== null && selection !== '') {
        return tool.wrap(selection)
    }
    return tool.placeholder
}

/**
 * Locate the caret's "natural" insertion point inside a
 * placeholder. Returns the byte offset where subsequent typing
 * should land. Symmetric tools (Bold, Italic, Underline, Link)
 * place this just after the opening marker; Heading places it
 * at the end of the placeholder line. Returning -1 signals "no
 * preferred offset" so the toolbar falls back to "caret at end
 * of inserted text" (SourceEditor's default behaviour).
 *
 * The toolbar uses this to set the caret after an insertion —
 * without it the caret lands at the end of the placeholder,
 * which is awkward for Bold/Italic/Underline where the operator
 * expects to land between the markers.
 */
export function caretOffsetForPlaceholder(placeholder: string): number {
    // Symmetric markers: `*bold*`, `_italic_`, `#underline[underlined]`,
    // `#link("…")[label]`. The opening marker length is the
    // number of characters before the visible text starts.
    for (const open of ['*', '_', '#underline[', '#link("https://example.com")[']) {
        if (placeholder.startsWith(open)) {
            return open.length
        }
    }
    return -1
}
