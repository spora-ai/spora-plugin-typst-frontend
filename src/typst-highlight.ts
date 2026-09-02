/**
 * Plugin-local syntax highlighter for Typst source.
 *
 * Wraps `highlight.js` (the host's markdown code-block highlighter
 * - see `spora-frontend/src/composables/useMarkdown.ts`) with a
 * custom Typst language. We pull in only the `highlight.js/lib/core`
 * runtime and register one language, so the bundle cost is the
 * core (~10KB gzipped) plus the grammar below.
 *
 * The host's own hljs theme is too high-contrast for the plugin's
 * muted card chrome; the plugin ships its own theme in
 * `style.css .typst-...` selectors that match the plugin's
 * Tailwind palette.
 *
 * API:
 *   highlightTypst(source) - HTML string with <span class="typst-...">
 *                            tokens, safe to insert with v-html
 *                            because hljs escapes attribute and
 *                            text content of every emitted span.
 *   isTypstReady()        - boolean, false until the first call
 *                            kicks off registration. The first
 *                            call to highlightTypst is a sync
 *                            initialisation so the result is
 *                            ready by the time a card opens.
 */
import TYPST from './typst-language'
import hljs from 'highlight.js/lib/core'

let registered = false

function ensureRegistered(): void {
    if (registered) return
    hljs.registerLanguage('typst', TYPST)
    registered = true
}

/**
 * Highlight a Typst source string. Returns the highlighted HTML
 * (span.typst-... tokens inside a span.hljs root). Safe to render
 * with v-html: highlight.js escapes the text it wraps, so
 * user-supplied source bytes cannot inject markup.
 */
export function highlightTypst(source: string): string {
    ensureRegistered()
    return hljs.highlight(source, { language: 'typst', ignoreIllegals: true }).value
}

/** True once the language has been registered. */
export function isTypstReady(): boolean {
    return registered
}
