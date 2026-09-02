/**
 * Wire shape for Typst plugin resources.
 *
 * Three kinds, all filesystem-backed. Templates and Examples are
 * essentially the same wire shape (UTF-8 source bytes, basename
 * addressable) — they're separated on the wire only so the admin UI
 * can give them distinct tabs.
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

export interface ExampleResource {
    name: string
    kind: 'example'
    origin: 'skill' | 'principal'
    size: number
    modified_at: number
}

/**
 * Image library entry. Replaces the earlier `media_assets`-backed
 * shape — images are now plain files under
 * `<storage>/typst/images/<principal>/<name>`, served via
 * `/api/v1/typst/images/{name}`. The `url` field is the canonical
 * reference the LLM pastes into `#image("…")`.
 */
export interface ImageResource {
    name: string
    mime: string
    size: number
    modified_at: number
    url: string
}

export interface UploadedImage {
    name: string
    mime: string
    size: number
    modified_at: number
    url: string
}

export type ResourceKind = 'font' | 'template' | 'example' | 'image'

/**
 * Result of the playground compile call. Mirrors the controller's
 * response envelope — the playground calls `POST /api/v1/typst/compile`
 * and gets a media-derivative row back, with the canonical
 * `/api/v1/assets/<uuid>.<ext>` URL the chat UI knows how to embed.
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

/**
 * Media-archive image — the cross-plugin image pool. Operators can
 * pick any of these in the playground's image picker; the LLM
 * receives a `/api/v1/assets/<uuid>.<ext>` URL it pastes into
 * `#image("…")`. Distinct from {@see ImageResource} (which is the
 * plugin's own filesystem-backed library).
 */
export interface MediaArchiveImage {
    id: string
    filename: string
    mime_type: string
    byte_size: number
    asset_url: string
    created_at: string
}
