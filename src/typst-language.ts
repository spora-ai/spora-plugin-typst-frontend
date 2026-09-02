/**
 * Custom highlight.js language definition for Typst.
 *
 * Typst is a markup-and-code hybrid: documents start in markup
 * mode (e.g. an "=" heading, an "*bold*" span, a "- list" item)
 * and switch into code mode when the author types "#" (e.g.
 * "#let x = 1", "#if cond { ... }", "#func(arg: val)"). Markup
 * and code can be nested inside each other via brackets: "[...]"
 * are content blocks, "(...)" group code expressions, "{...}"
 * are code blocks. Strings live in code mode only.
 *
 * We don't try to be a complete parser - hljs's regex modes are
 * greedy and ambiguity is fine for "make this readable". The goal
 * is to colour:
 *   - comments (line "//", block slash-star)
 *   - strings (double-quoted, with backslash escapes)
 *   - numbers (incl. unit suffixes like 12pt, 50%, 1.5em)
 *   - markup markers (=, +, -, /, *, _, ~) at line start or
 *     after whitespace
 *   - math (single-dollar inline, double-dollar block)
 *   - code-mode function calls (#identifier) and keywords
 *     (let, if, for, set, show, import, include, as, in,
 *     return, not, and, or, true, false, none, auto, while,
 *     break, continue, else)
 *   - built-in functions (align, block, text, grid, table,
 *     figure, image, link, list, enum, raw, par, emph, strong,
 *     underline, strike, highlight, pad, place, v, h, box,
 *     stack, terms, footnote, cite, bibliography, outline,
 *     query, counter, state, context, measure, page, line,
 *     parbreak, sequence)
 *
 * The grammar is intentionally a single self-contained function
 * so we don't pull in a TextMate runtime. highlight.js's core
 * (~10KB gzipped) is the only runtime cost.
 *
 * References:
 *   - Typst reference: https://typst.app/docs/reference/
 *   - hljs custom-language docs:
 *     https://highlightjs.readthedocs.io/en/latest/mode-reference.html
 */
import type { HLJSApi, LanguageFn } from 'highlight.js'

const KEYWORDS = [
    'let',
    'if',
    'else',
    'for',
    'in',
    'while',
    'break',
    'continue',
    'return',
    'import',
    'include',
    'as',
    'set',
    'show',
    'context',
    'not',
    'and',
    'or',
]

const LITERALS = ['true', 'false', 'none', 'auto']

const BUILT_INS = [
    'align',
    'block',
    'box',
    'cite',
    'colbreak',
    'column',
    'columns',
    'counter',
    'datum',
    'emph',
    'enum',
    'figure',
    'footnote',
    'grid',
    'h',
    'highlight',
    'hline',
    'image',
    'line',
    'link',
    'list',
    'measure',
    'outline',
    'overbrace',
    'page',
    'pagebreak',
    'pages',
    'pad',
    'par',
    'parbreak',
    'place',
    'quote',
    'raw',
    'rect',
    'ref',
    'repeat',
    'rotate',
    'scale',
    'sequence',
    'stack',
    'state',
    'strong',
    'strike',
    'stroke',
    'table',
    'terms',
    'text',
    'underline',
    'underbracket',
    'v',
    'vbreak',
    'vline',
    'bibliography',
    'component',
    'locate',
    'query',
    'selector',
    'style',
    'numbering',
    'layout',
    'move',
    'scope',
    'transform',
    'circle',
    'ellipse',
    'path',
    'polygon',
    'curve',
    'line',
]

const TYPST: LanguageFn = (h: HLJSApi) => {
    // Build a single negative-lookahead alternation for the
    // function-call rule so it doesn't steal colouring from
    // the keyword / built-in rules. The union of the two
    // word lists matters here — if a built-in slips through,
    // it gets coloured as a regular function call and the
    // palette loses the "this is a standard library function"
    // cue.
    const reservedWords = [...KEYWORDS, ...LITERALS, ...BUILT_INS]
    const reservedAlt = reservedWords
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')

    return {
        name: 'Typst',
        aliases: ['typst'],
        case_insensitive: false,
        keywords: {
            keyword: KEYWORDS,
            literal: LITERALS,
            built_in: BUILT_INS,
        },
        contains: [
            // Line comment (`// ...` to end of line)
            h.COMMENT('//', '$', { relevance: 0 }),

            // Block comment (`/* ... */`)
            h.COMMENT('/\\*', '\\*/', { relevance: 0 }),

            // Strings (double-quoted, with backslash escapes).
            // Typst also supports line-broken strings via `\` at
            // end of line — accept the literal newline so the
            // string terminates correctly on the next physical
            // line.
            {
                className: 'string',
                begin: '"',
                end: '"',
                contains: [{ begin: '\\\\(?:.|$)' }],
                relevance: 0,
            },

            // Numbers with optional unit suffix.
            //   42, 3.14, 1e3, 50%, 12pt, 1.5em, 90deg
            {
                className: 'number',
                begin:
                    '\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?(?:pt|mm|cm|in|em|rem|px|deg|rad|fr|%)?\\b',
                relevance: 0,
            },

            // Math: `$...$` (inline) and `$ ... $` (block).
            // A single `$` followed by space starts block math.
            {
                className: 'meta',
                begin: '\\$\\$',
                end: '\\$\\$',
            },
            {
                className: 'meta',
                begin: '\\$',
                end: '\\$',
                relevance: 0,
            },

            // Markup-mode section headings at line start:
            // `=`, `==`, `===` (up to 5). Only at the beginning of
            // a line, so we don't catch assignment `==` in code.
            {
                className: 'title',
                begin: '^={1,5}\\s',
                end: '$',
                relevance: 0,
                contains: [{ className: 'meta', begin: '^={1,5}' }],
            },

            // Markup-mode list / term / enum markers at line start.
            // `- foo`, `+ foo`, `/ foo`, `+ bar` (terms).
            {
                className: 'bullet',
                begin: '^[+\\-/]\\s',
                relevance: 0,
            },

            // Markup-mode strong / emph / sub / sup markers.
            // We don't try to be exhaustive (nested * and _ is
            // ambiguous) — just colour the opening character so
            // the visual cue lands.
            {
                className: 'emphasis',
                begin: '(?<![*_~])\\*[^*\\s]',
                end: '[^*\\s]\\*(?![*_~])',
                relevance: 0,
            },
            {
                className: 'emphasis',
                begin: '(?<![*_~])_[^_\\s]',
                end: '[^_\\s]_(?![*_~])',
                relevance: 0,
            },
            {
                className: 'emphasis',
                begin: '\\b~',
                end: '~\\b',
                relevance: 0,
            },

            // Code-mode function call: `#identifier` (or
            // `#identifier{...}` for code blocks). We don't try
            // to balance braces — we just colour the head and
            // let the body fall through to other rules.
            //
            // The negative lookahead skips the language
            // keywords and built-ins so they fall through to
            // the keyword rule above and get their own colour
            // instead of being painted as a regular function.
            {
                className: 'function',
                begin: `#(?!${reservedAlt}\\b)[a-zA-Z_][a-zA-Z0-9_\\-]*`,
                relevance: 0,
            },

            // Code-mode variable references inside an expression.
            // Identifiers that look like a normal variable name
            // (no `#` prefix). We only catch them when they're
            // surrounded by typical code-mode punctuation
            // (`(`, `,`, `=`, `:`) so markup words like `Hello`
            // in a paragraph don't get coloured.
            {
                className: 'variable',
                begin: '(?<=[(,=:])[a-zA-Z_][a-zA-Z0-9_\\-]*(?=\\s*[,)=:])',
                relevance: 0,
            },

            // Punctuation / brackets — light, just enough to
            // visually anchor blocks. hljs has a default for
            // brackets but listing it explicitly here keeps the
            // palette stable.
            {
                className: 'punctuation',
                begin: '[][(){}]',
                relevance: 0,
            },
        ],
    }
}

export default TYPST
