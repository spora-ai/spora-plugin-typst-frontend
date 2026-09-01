/**
 * Playground compile API client.
 *
 * Wire shape matches `TypstCompileController` in the backend:
 *   POST /typst/compile
 *     body { source, format?, page?, dpi? }
 *     → 200 + { data: CompileResult }
 *     → 422 { error: { code, message, diagnostics? } }
 *     → 401 / 503 on auth / producer-missing.
 *
 * The controller and endpoint are now shipped (this client is the
 * SPA's bridge into it). Earlier versions of `CompileForm.vue`
 * attempted endpoint detection — that dance is gone, this module is
 * the single source of truth for the request shape.
 */
import { getApi } from './client'
import type { CompileResult } from '../types'

export async function compileTypst(opts: {
    source: string
    format?: 'pdf' | 'png' | 'svg'
    page?: number
    dpi?: number
}): Promise<CompileResult> {
    const api = getApi()
    const result = await api.post<CompileResult>('/typst/compile', {
        source: opts.source,
        format: opts.format ?? 'pdf',
        page: opts.page,
        dpi: opts.dpi,
    })
    return result
}

/**
 * Snippet emitted by the "Copy as `#image()`" button on the
 * Playground's PDF result panel. PNG derivatives are the natural
 * target for `#image()`; SVG would call for `#image("…svg")` with
 * the same body but a different MIME, and PDF has no `#image()`
 * equivalent at all (the playground renders PDFs in an iframe).
 *
 * `width: 80%` mirrors the playground's own default sizing so the
 * pasted snippet drops in without further editing.
 */
export function imageSnippet(assetUrl: string): string {
    return `#image("${assetUrl}", width: 80%)`
}
