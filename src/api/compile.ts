/**
 * Playground compile API client.
 *
 * Wire shape matches `TypstCompileController` in the backend:
 *   POST /typst/compile[?principal_id=N]
 *     body { source, name?, format?, page?, dpi? }
 *     → 200 + { data: CompileResult }
 *     → 422 { error: { code, message, diagnostics? } }
 *     → 401 / 503 on auth / producer-missing.
 *
 * `name` is the user-chosen filename. The controller inserts a
 * fresh `media_assets` row per call (sibling-row semantics on
 * filename collisions), then keys the `media_derivatives` join off
 * that row's id. The returned `source_id` is stable for the
 * lifetime of the file.
 *
 * `principalId` threads the chip-row's selected principal onto the
 * URL as `?principal_id=N`. Without it the backend falls back to
 * the caller — fine for the user-principal default, wrong for
 * group-scoped renders where `#include "templates/foo.typ"` should
 * resolve against the group's storage.
 */
import { getApi, withPrincipal } from './client'
import type { CompileResult } from '../types'

export async function compileTypst(opts: {
    source: string
    name?: string
    format?: 'pdf' | 'png' | 'svg'
    page?: number
    dpi?: number
    principalId?: number | null
}): Promise<CompileResult> {
    const api = getApi()
    const result = await api.post<CompileResult>(
        withPrincipal('/typst/compile', opts.principalId),
        {
            source: opts.source,
            name: opts.name,
            format: opts.format ?? 'pdf',
            page: opts.page,
            dpi: opts.dpi,
        },
    )
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
