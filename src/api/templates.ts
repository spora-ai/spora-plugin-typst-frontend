/**
 * Template API client.
 *
 * Wire shape matches `TypstTemplateController`:
 *   GET    /typst/templates[?principal_id=N]  → { data: { templates: TemplateResource[] } }
 *   GET    /typst/templates/{name}[?principal_id=N] → text/plain body (the .typ source)
 *   POST   /typst/templates[?principal_id=N]   body { name, content } → 201 + { data: { template: {...} } }
 *   PUT    /typst/templates/{name}[?principal_id=N] body { content } → 200 + { data: { template: {...} } }
 *   DELETE /typst/templates/{name}[?principal_id=N] → 204
 *
 * Templates are filesystem-backed UTF-8 source files under
 * `<storage>/typst/templates/<principal>/`. The wire URL is
 * `/typst/templates` (matching the backend controller). The plugin
 * keeps a parallel `/typst/examples` endpoint for the smaller
 * pattern-snippet kind — {@see ./examples}.
 *
 * `principalId` mirrors the chip-row selector on `?principal_id=N`.
 * All write/read methods accept it so uploads land in the scope
 * the operator is currently viewing — without it the backend pins
 * writes to the caller's user-principal and uploads in another
 * principal "vanish after reload".
 */
import { getApi, fetchText, withPrincipal } from './client'
import type { TemplateResource } from '../types'

export async function listTemplates(principalId?: number): Promise<TemplateResource[]> {
    const api = getApi()
    const result = await api.get<{ templates: TemplateResource[] }>(withPrincipal('/typst/templates', principalId))
    return result.templates
}

/**
 * Read a template's source bytes. The controller responds with
 * `Content-Type: text/plain; charset=utf-8` so we use {@see fetchText}
 * instead of `api.get<string>()` — the host's JSON parser would
 * otherwise synthesise an `INVALID_JSON` envelope and mask the
 * body. Used by the "View source" preview in the Templates card
 * list.
 */
export async function getTemplate(name: string, principalId?: number): Promise<string> {
    return await fetchText(withPrincipal(`/typst/templates/${encodeURIComponent(name)}`, principalId))
}

export async function uploadTemplate(name: string, content: string, principalId?: number): Promise<TemplateResource> {
    const api = getApi()
    const result = await api.post<{ template: TemplateResource }>(withPrincipal('/typst/templates', principalId), { name, content })
    return result.template
}

/**
 * Replace the contents of an existing principal-tier template. The
 * controller upserts on `(principal_id, name)`, so the row's `size`
 * and `modified_at` reflect the new bytes and `name` itself is
 * immutable on this path (rename is a delete + upload).
 */
export async function updateTemplate(name: string, content: string, principalId?: number): Promise<TemplateResource> {
    const api = getApi()
    const result = await api.put<{ template: TemplateResource }>(
        withPrincipal(`/typst/templates/${encodeURIComponent(name)}`, principalId),
        { content },
    )
    return result.template
}

export async function deleteTemplate(name: string, principalId?: number): Promise<void> {
    const api = getApi()
    await api.delete(withPrincipal(`/typst/templates/${encodeURIComponent(name)}`, principalId))
}
