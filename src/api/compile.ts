/**
 * Playground compile API client.
 *
 * Wire shape matches `TypstCompileController` in the backend:
 *   POST /typst/compile
 *     body { source, name?, format?, page?, dpi? }
 *     → 200 + { data: CompileResult }
 *     → 422 { error: { code, message, diagnostics? } }
 *     → 401 / 503 on auth / producer-missing.
 *
 * `name` is the user-chosen filename. The controller upserts the
 * parent row by `(principal_id, tool_name='typst.playground', filename)`,
 * so a second compile of the same name overwrites the parent in
 * place rather than stacking a fresh row in the media archive. The
 * returned `source_id` is stable for the lifetime of the file.
 */
import { getApi } from './client'
import type { CompileResult } from '../types'

export async function compileTypst(opts: {
    source: string
    name?: string
    format?: 'pdf' | 'png' | 'svg'
    page?: number
    dpi?: number
}): Promise<CompileResult> {
    const api = getApi()
    const result = await api.post<CompileResult>('/typst/compile', {
        source: opts.source,
        name: opts.name,
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
