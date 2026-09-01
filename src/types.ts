/**
 * Wire shape for Typst plugin resources.
 *
 * The three kinds are read via different endpoints but the rows are
 * rendered together on the admin panel — each kind carries its own
 * discriminating fields (mime_type vs storage_mode, id vs basename).
 */

export interface FontResource {
    name: string
    kind: 'font'
    origin: 'skill' | 'principal'
    size: number
    modified_at: number
}

export interface TemplateResource {
    name: string
    kind: 'template'
    origin: 'skill' | 'principal'
    size: number
    modified_at: number
}

export interface ImageResource {
    id: string
    filename: string
    mime_type: string
    byte_size: number
    asset_url: string
    created_at: string
}

export interface UploadedImage {
    id: string
    filename: string
    mime_type: string
    byte_size: number
    asset_url: string
    created_at: string
}

export type ResourceKind = 'font' | 'template' | 'image'

/**
 * Result of the playground compile call. Mirrors the controller's
 * response envelope — the server-side `compile` endpoint is not yet
 * shipped, so the playground degrades gracefully when the endpoint
 * 404s (the api/compile.ts caller surfaces an `endpointAvailable`
 * flag rather than a hard error).
 */
export interface CompileResult {
    derivative_id: string
    asset_url: string
    format: 'pdf' | 'png' | 'svg'
    mime: string
    size: number
    width: number | null
    height: number | null
    preview_url: string | null
}
