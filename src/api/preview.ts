/**
 * Ephemeral preview client for the Editor tab.
 *
 * Wire shape matches `TypstPreviewController`:
 *   POST /typst/preview  body { source, name?, format?, page?, ppi? }
 *                       → 200 + { data: PreviewResult } | 422 + { error: { code, diagnostics[] } }
 *
 * `POST /typst/compile` persists a media_assets + media_derivatives
 * row, so iterating on a document fills the operator's media archive
 * with parent rows they didn't ask to keep. `/preview` skips the DB
 * entirely — the bytes come back inline as base64 and the frontend
 * decodes them into a Blob URL for the result panel.
 *
 * The shape of `PreviewResult.bytes` is intentionally base64 (not a
 * data: URL) so the JSON envelope stays uniform with the rest of the
 * API. The frontend's `bytes → Blob → objectURL` round-trip is the
 * one place the conversion happens.
 */
import { getApi } from './client'

export interface PreviewResult {
    /** Base64-encoded bytes of the rendered file (PDF / PNG / SVG). */
    bytes: string
    /** MIME type — `application/pdf`, `image/png`, or `image/svg+xml`. */
    mime: string
    /** Format label — `pdf`, `png`, or `svg`. */
    format: 'pdf' | 'png' | 'svg'
    /** Echoed back so the result panel can show the source's filename. */
    source_name: string
    /** Pixel width for PNG; null for PDF/SVG. */
    width: number | null
    /** Pixel height for PNG; null for PDF/SVG. */
    height: number | null
}

export interface PreviewRequest {
    source: string
    name?: string
    format?: 'pdf' | 'png' | 'svg'
    page?: number
    ppi?: number
}

/**
 * Compile inline Typst source and return the rendered bytes inline.
 *
 * Throws {@link import('./client').ApiError} on 4xx / 5xx; the
 * controller's 422 path carries the structured `diagnostics` array
 * the frontend's error panel renders (severity + optional hint per
 * entry). See `TypstDiagnosticFormatter` for the envelope shape.
 */
export async function previewTypst(request: PreviewRequest): Promise<PreviewResult> {
    const api = getApi()
    return await api.post<PreviewResult>('/typst/preview', {
        source: request.source,
        name: request.name,
        format: request.format ?? 'pdf',
        page: request.page,
        ppi: request.ppi,
    })
}
