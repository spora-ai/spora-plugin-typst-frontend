/**
 * Tests for the formatting toolbar's tool dispatcher and caret
 * offset helper. The toolbar component itself is tested in
 * `EditorToolbar.test.ts`; these pure-function tests pin the
 * per-tool semantics so a future change to a tool's delimiters
 * (or wrap behaviour) fails loudly.
 */
import { describe, it, expect } from 'vitest'
import {
    FORMATTING_TOOLS,
    applyTool,
    caretOffsetForPlaceholder,
    type ToolbarTool,
} from '../../src/composables/useEditorToolbar'

function tool(label: string): ToolbarTool {
    const found = FORMATTING_TOOLS.find((t) => t.label === label)
    if (found === undefined) throw new Error(`tool ${label} not found`)
    return found
}

describe('FORMATTING_TOOLS', () => {
    it('exposes Bold, Italic, Underline, Link (Heading moved to <HeadingMenu>)', () => {
        expect(FORMATTING_TOOLS.map((t) => t.label)).toEqual([
            'Bold',
            'Italic',
            'Underline',
            'Link',
        ])
    })
})

describe('applyTool', () => {
    it('inserts the placeholder when no selection is active', () => {
        expect(applyTool(tool('Bold'), null)).toBe('*bold text*')
        expect(applyTool(tool('Italic'), '')).toBe('_italic text_')
    })

    it('wraps a non-empty selection with the tool delimiters', () => {
        expect(applyTool(tool('Bold'), 'hello')).toBe('*hello*')
        expect(applyTool(tool('Italic'), 'hello')).toBe('_hello_')
    })

    it('Underline wraps in #underline[…] (function-call form, not delimiter pair)', () => {
        expect(applyTool(tool('Underline'), 'hello')).toBe('#underline[hello]')
        expect(applyTool(tool('Underline'), null)).toBe('#underline[underlined]')
    })

    it('Link is a link-dialog tool — applyTool returns an empty string', () => {
        // The toolbar opens the dialog instead of inserting a
        // snippet, so applyTool's output is unused.
        expect(tool('Link').kind).toBe('link-dialog')
        expect(applyTool(tool('Link'), 'anything')).toBe('')
    })
})

describe('caretOffsetForPlaceholder', () => {
    it('returns the opening-marker length for symmetric tools', () => {
        expect(caretOffsetForPlaceholder('*bold text*')).toBe(1)
        expect(caretOffsetForPlaceholder('_italic text_')).toBe(1)
        expect(caretOffsetForPlaceholder('#underline[underlined]')).toBe(11)
        expect(caretOffsetForPlaceholder('#link("https://example.com")[label]')).toBe(29)
    })

    it('returns -1 when the placeholder is heading-shaped (caret at end)', () => {
        expect(caretOffsetForPlaceholder('= Heading\n')).toBe(-1)
    })
})
