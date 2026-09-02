/**
 * Template API client.
 *
 * Wire shape matches `TypstTemplateController`:
 *   GET    /typst/templates[?principal_id=N]  → { data: { templates: TemplateResource[] } }
 *   GET    /typst/templates/{name}            → text/plain body (the .typ source)
 *   POST   /typst/templates                    body { name, content } → 201 + { data: { template: {...} } }
 *   DELETE /typst/templates/{name}             → 204
 *
 * Templates are filesystem-backed UTF-8 source files under
 * `<storage>/typst/templates/<principal>/`. The wire URL is
 * `/typst/templates` (matching the backend controller). The plugin
 * keeps a parallel `/typst/examples` endpoint for the smaller
 * pattern-snippet kind — {@see ./examples}.
 */
import { getApi, fetchText } from './client'
import type { TemplateResource } from '../types'

export async function listTemplates(principalId?: number): Promise<TemplateResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/templates?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/templates'
    const result = await api.get<{ templates: TemplateResource[] }>(path)
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
export async function getTemplate(name: string): Promise<string> {
    return await fetchText(`/typst/templates/${encodeURIComponent(name)}`)
}

export async function uploadTemplate(name: string, content: string): Promise<TemplateResource> {
    const api = getApi()
    const result = await api.post<{ template: TemplateResource }>('/typst/templates', { name, content })
    return result.template
}

export async function deleteTemplate(name: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/templates/${encodeURIComponent(name)}`)
}
