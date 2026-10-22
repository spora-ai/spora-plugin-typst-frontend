/**
 * What a tool does when the operator clicks it.
 *
 * - `wrap` — wraps the selection in the tool's delimiters, or inserts
 *   the placeholder when nothing is selected.
 * - `link-dialog` — the toolbar opens a modal asking for URL + label
 *   and inserts nothing itself.
 */
export type ToolKind = 'wrap' | 'link-dialog'

/**
 * The catalogue keys of the formatting tools.
 *
 * The toolbar resolves each key with `t()`, so this union is what its
 * label map is typed over: a tool whose label is missing from the map
 * is a compile error rather than an `undefined` that reaches the DOM.
 */
export type ToolbarToolKey = 'Bold' | 'Italic' | 'Underline' | 'Link'

export interface ToolbarTool {
    /**
     * Catalogue key — the English source string of the button label.
     *
     * The toolbar resolves it with `t()`, so the visible label follows
     * the panel's language while this stays a stable identifier (the
     * `data-testid` is derived from it).
     */
    key: ToolbarToolKey
    kind: ToolKind
    /**
     * Snippet that lands in the buffer when the operator clicks the
     * tool without a selection. For symmetric wrap tools (Bold, Italic,
     * etc.) this is a placeholder like `*bold text*` — the caret lands
     * in the middle so the next keystroke starts inside the delimiters.
     *
     * Typst markup, not copy: it goes into the operator's document, so
     * it is not translated.
     */
    snippet: string
    wrap: (selection: string) => string
}

const boldTool: ToolbarTool = {
    key: 'Bold',
    kind: 'wrap',
    snippet: '*bold text*',
    wrap: (selection) => `*${selection}*`,
}

const italicTool: ToolbarTool = {
    key: 'Italic',
    kind: 'wrap',
    snippet: '_italic text_',
    wrap: (selection) => `_${selection}_`,
}

// Typst's underline is a function call rather than a delimiter pair —
// the `#` and `[]` bracket the text.
const underlineTool: ToolbarTool = {
    key: 'Underline',
    kind: 'wrap',
    snippet: '#underline[underlined]',
    wrap: (selection) => `#underline[${selection}]`,
}

const linkTool: ToolbarTool = {
    key: 'Link',
    kind: 'link-dialog',
    snippet: '',
    wrap: () => '',
}

export const FORMATTING_TOOLS: readonly ToolbarTool[] = [
    boldTool,
    italicTool,
    underlineTool,
    linkTool,
] as const

/**
 * What to splice into the buffer when the operator clicks a `wrap`
 * tool: the wrapped selection, or the tool's placeholder when nothing
 * is selected.
 *
 * Hoisted to module scope so the toolbar component can call it from its
 * click handler without dragging a per-tool `if/else` ladder into the
 * template.
 */
export function applyTool(tool: ToolbarTool, selection: string | null): string {
    if (selection !== null && selection !== '') {
        return tool.wrap(selection)
    }
    return tool.snippet
}

/**
 * Where the caret belongs inside an inserted placeholder — the offset
 * just past the opening marker, so the next keystroke lands inside it.
 *
 * Returns -1 when the placeholder has no opening marker; the toolbar
 * then falls back to "caret at end of inserted text".
 */
export function caretOffsetForPlaceholder(placeholder: string): number {
    // The link marker matches its literal example URL only, so a link
    // with a real URL has no offset.
    for (const open of ['*', '_', '#underline[', '#link("https://example.com")[']) {
        if (placeholder.startsWith(open)) {
            return open.length
        }
    }
    return -1
}
