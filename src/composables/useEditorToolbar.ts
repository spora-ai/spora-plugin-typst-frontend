/**
 * Tool definitions consumed by `EditorToolbar.vue`.
 *
 * Each tool has a `kind` that drives the dispatcher's behaviour:
 *
 *   - `wrap` — the default. Wraps a non-empty selection in the
 *     tool's delimiters (or inserts the placeholder when no
 *     selection is active). Symmetric tools (Bold, Italic,
 *     Underline) and asymmetric tools (Link — sort of, until
 *     the dialog opens) live here.
 *
 *   - `link-dialog` — the toolbar opens a modal asking for URL +
 *     label instead of inserting a placeholder. The selection
 *     pre-fills the label. Link is the only tool of this kind
 *     today; the kind exists so future dialog-driven tools
 *     (table, footnote) don't have to special-case themselves.
 *
 * Heading used to be `line-start` here but moved to its own
 * `<HeadingMenu>` component because H1–H5 needs a popover rather
 * than a single button (clicking H2 once would be ambiguous if
 * Heading cycled). The toolbar renders the menu before this
 * tools list.
 */
export type ToolKind = 'wrap' | 'link-dialog'

export interface ToolbarTool {
    /** Visible button label (also the aria-label). */
    label: string
    kind: ToolKind
    /**
     * Snippet that lands in the buffer when the operator clicks
     * the tool without a selection. For symmetric wrap tools
     * (Bold, Italic, etc.) this is a placeholder like `*bold
     * text*` — the caret lands in the middle so the next
     * keystroke starts inside the delimiters.
     */
    placeholder: string
    /**
     * Wrap `selection` in the tool's delimiters. Returns the
     * snippet the toolbar should splice into the buffer.
     */
    wrap: (selection: string) => string
}

/**
 * Bold: wrap selection in `*…*`. With no selection, insert
 * `*bold text*`. The caret lands in the middle (after `*`) so a
 * subsequent keystroke starts inside the markers.
 */
const boldTool: ToolbarTool = {
    label: 'Bold',
    kind: 'wrap',
    placeholder: '*bold text*',
    wrap: (selection) => `*${selection}*`,
}

/**
 * Italic: wrap selection in `_…_`. With no selection, insert
 * `_italic text_`.
 */
const italicTool: ToolbarTool = {
    label: 'Italic',
    kind: 'wrap',
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
    kind: 'wrap',
    placeholder: '#underline[underlined]',
    wrap: (selection) => `#underline[${selection}]`,
}

/**
 * Link: opens a small dialog with URL + label inputs. The
 * current selection pre-fills the label so the operator can
 * highlight some text, click Link, fill in the URL, and ship.
 * The toolbar dispatches this kind separately — see
 * `EditorToolbar.vue`.
 */
const linkTool: ToolbarTool = {
    label: 'Link',
    kind: 'link-dialog',
    placeholder: '',
    wrap: () => '',
}

/**
 * The four wrap + dialog formatting tools, in declaration
 * order. The toolbar renders these after the HeadingMenu (which
 * lives in its own slot since it needs a popover).
 */
export const FORMATTING_TOOLS: readonly ToolbarTool[] = [
    boldTool,
    italicTool,
    underlineTool,
    linkTool,
] as const

/**
 * Decide what to splice into the buffer when the operator
 * clicks a `wrap` tool. Mirrors how every common WYSIWYG
 * toolbar behaves:
 *
 *   - With a non-empty selection: call `tool.wrap(selection)`.
 *     The wrap function is responsible for adding delimiters.
 *   - With a collapsed caret: insert `tool.placeholder` at the
 *     caret. The placeholder's structure mirrors what the wrap
 *     function would have produced so the operator can type into
 *     it without re-typing markers.
 *
 * For `line-start` and `link-dialog` tools the caller uses a
 * different code path (insertAtLineStart for headings, the
 * dialog for links), so this helper only handles `wrap`.
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
 * at the end of the inserted prefix (caret lands after `= `).
 * Returning -1 signals "no preferred offset" so the toolbar
 * falls back to "caret at end of inserted text" (SourceEditor's
 * default behaviour).
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
