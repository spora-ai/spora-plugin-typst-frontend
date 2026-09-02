import { describe, it, expect } from 'vitest'
import { highlightTypst, isTypstReady } from '../src/typst-highlight'

/**
 * Smoke + tokenisation tests for the custom Typst highlight
 * grammar. We don't assert on the exact span sequence (hljs's
 * internals shift between versions); we assert on the
 * token-class surfaces - `typst-keyword`, `typst-string`,
 * `typst-comment`, `typst-number`, `typst-built_in`,
 * `typst-function`, `typst-title` - that the UI theme targets.
 *
 * hljs escapes its input by default, so we also lock in the
 * XSS safety property: user-supplied `<script>` and `<img on=>`
 * come back as escaped text inside spans, not raw markup.
 */
describe('typst-highlight', () => {
    it('registers on first call', () => {
        expect(isTypstReady()).toBe(false)
        highlightTypst('= hi')
        expect(isTypstReady()).toBe(true)
        // Re-calls don't re-register.
        highlightTypst('= hi again')
        expect(isTypstReady()).toBe(true)
    })

    it('colours line comments as .typst-comment', () => {
        const html = highlightTypst('// a comment\n= heading')
        expect(html).toContain('<span class="hljs-comment">// a comment</span>')
    })

    it('colours block comments as .typst-comment', () => {
        const html = highlightTypst('/* block */')
        expect(html).toContain('<span class="hljs-comment">/* block */</span>')
    })

    it('colours strings as .typst-string', () => {
        const html = highlightTypst('#let name = "Acme Corp."')
        // hljs escapes the inner " as &quot; inside the span.
        expect(html).toMatch(/<span class="hljs-string">&quot;Acme Corp\.&quot;<\/span>/)
    })

    it('colours numbers (plain + decimal + unit-suffixed) as .typst-number', () => {
        const cases = [
            '#let x = 42',
            '#let pi = 3.14',
            '#set text(size: 12pt)',
            'width: 50%',
            '#rotate(45deg)',
        ]
        for (const src of cases) {
            const html = highlightTypst(src)
            expect(html, src).toMatch(/<span class="hljs-number">[\d.]+(pt|em|rem|px|deg|rad|fr|%)?<\/span>/)
        }
    })

    it('colours keywords (let, if, for, set, show, import, include, as, in)', () => {
        const cases = ['#let x = 1', '#if x > 0', '#for i in range(5)', '#set text(size: 12pt)', '#show heading: it', '#import "x.typ": a', '#include "y.typ"', '#let f = (a) => a']
        for (const src of cases) {
            const html = highlightTypst(src)
            expect(html, src).toMatch(/<span class="hljs-keyword">/)
        }
    })

    it('colours literals (true, false, none, auto) as .typst-literal', () => {
        const cases = ['#let a = true', '#let b = false', '#let c = none', '#set text(fill: auto)']
        for (const src of cases) {
            const html = highlightTypst(src)
            expect(html, src).toMatch(/<span class="hljs-literal">(true|false|none|auto)<\/span>/)
        }
    })

    it('colours built-in functions (align, block, table, image) as .typst-built_in', () => {
        const cases = [
            '#align(center)[hi]',
            '#block(fill: red)[x]',
            '#table(columns: 3, [a], [b])',
            '#image("foo.png")',
            '#figure([caption])',
            '#link("https://typst.app")',
        ]
        for (const src of cases) {
            const html = highlightTypst(src)
            expect(html, src).toMatch(/<span class="hljs-built_in">(align|block|table|image|figure|link)<\/span>/)
        }
    })

    it('colours code-mode identifiers after # as .typst-function', () => {
        const html = highlightTypst('#customFunc()')
        expect(html).toContain('<span class="hljs-function">#customFunc</span>')
    })

    it('colours line-start = headings as .typst-title', () => {
        const html = highlightTypst('= Heading 1\n== Heading 2\n=== Heading 3')
        expect(html).toMatch(/<span class="hljs-title">= Heading 1<\/span>/)
        expect(html).toMatch(/<span class="hljs-title">== Heading 2<\/span>/)
    })

    it('colours $-math as .typst-meta', () => {
        const html = highlightTypst('Inline $x + y$ math.')
        expect(html).toMatch(/<span class="hljs-meta">\$[^$]*\$<\/span>/)
    })

    it('escapes user-supplied HTML inside strings (XSS safety)', () => {
        const html = highlightTypst('#let x = "<script>alert(1)</script>"')
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
        // The dangerous tag is contained inside a string span
        // (hljs escapes the inner " as &quot;).
        expect(html).toMatch(/<span class="hljs-string">&quot;&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;<\/span>/)
    })

    it('escapes user-supplied HTML in markup mode (XSS safety)', () => {
        const html = highlightTypst('Hello <img src=x onerror=alert(1)> world')
        // The < and > are escaped so the user-supplied tag
        // can't be parsed as markup. The attribute-like text
        // is safe to leave as-is because the surrounding
        // < and > are escaped.
        expect(html).not.toContain('<img')
        expect(html).toContain('&lt;img')
        expect(html).toContain('&gt;')
    })

    it('preserves newlines so the result is renderable in a <pre>', () => {
        const src = '= H1\n\nbody\n\n= H2'
        const html = highlightTypst(src)
        // hljs keeps the literal \n in the output (it doesn't
        // collapse whitespace), so a <pre> renders them as
        // line breaks.
        expect(html.split('\n').length).toBe(src.split('\n').length)
    })

    it('returns the source unchanged visually for empty input', () => {
        const html = highlightTypst('')
        // Either empty or wraps empty string in a span - both
        // are safe to render. We just assert no exception.
        expect(typeof html).toBe('string')
    })

    it('handles a typical document end-to-end (sample invoice.typ)', () => {
        const src = `// Starter invoice
#let invoice(recipient: "Acme Corp.", total: 420) = {
    set text(size: 12pt)
    [Invoice for #recipient - #total EUR]
}

#invoice(total: 500)`
        const html = highlightTypst(src)
        // Top-level surfaces should all light up.
        expect(html).toContain('hljs-comment') // // Starter invoice
        expect(html).toContain('hljs-keyword') // let
        expect(html).toContain('hljs-built_in') // set, text
        expect(html).toContain('hljs-string') // "Acme Corp."
        expect(html).toContain('hljs-number') // 420, 12pt
        expect(html).toContain('hljs-function') // #invoice
    })
})
