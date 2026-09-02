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
 *
 * `source_id` / `source_name` are the parent row's id + filename
 * so the editor can keep the open file's identity across compiles
 * (a second compile of the same name overwrites the parent in
 * place, so `source_id` stays stable for the lifetime of the
 * session).
 */
export interface CompileResult {
    derivative_id: string
    asset_url: string
    source_id: string
    source_name: string
    format: 'pdf' | 'png' | 'svg'
    mime: string
    size: number
    width: number | null
    height: number | null
    preview_url: string | null
}

/**
 * A single playground source row in the media archive. The list
 * endpoint returns these so the open picker can show "what files
 * already exist", and the show endpoint returns the full content
 * when the operator picks one.
 */
export interface PlaygroundSource {
    id: string
    filename: string
    byte_size: number
    mime: string
    content: string
    created_at: string | null
    updated_at: string | null
}

/**
 * Slim listing entry for the playground source picker. Excludes
 * `content` (the body) so the picker can render hundreds of files
 * without dragging every .typ source down the wire. The full body
 * is fetched on demand via the show endpoint when the operator
 * picks one.
 */
export interface PlaygroundSourceSummary {
    id: string
    filename: string
    byte_size: number
    created_at: string | null
    updated_at: string | null
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
