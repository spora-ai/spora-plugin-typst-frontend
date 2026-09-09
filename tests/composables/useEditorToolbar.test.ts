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
    it('exposes Heading, Bold, Italic, Underline, Link in that order', () => {
        expect(FORMATTING_TOOLS.map((t) => t.label)).toEqual([
            'Heading',
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

    it('Link wraps as #link("…")[…] with a placeholder URL', () => {
        expect(applyTool(tool('Link'), 'click me')).toBe(
            '#link("https://example.com")[click me]',
        )
        expect(applyTool(tool('Link'), null)).toBe(
            '#link("https://example.com")[label]',
        )
    })

    it('Heading prefixes every selected line with "= "', () => {
        expect(applyTool(tool('Heading'), 'first')).toBe('= first')
        expect(applyTool(tool('Heading'), 'first\nsecond')).toBe('= first\n= second')
    })

    it('Heading leaves blank lines as a bare "= " marker', () => {
        // The wrap function emits '= ' (no trailing text) for empty
        // lines so a blank line in the source still receives a
        // heading marker when the operator transforms a multi-line
        // block.
        expect(applyTool(tool('Heading'), '\n')).toBe('= \n= ')
    })

    it('Heading with no selection inserts a level-1 placeholder', () => {
        expect(applyTool(tool('Heading'), null)).toBe('= Heading\n')
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
