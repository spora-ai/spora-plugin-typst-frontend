/**
 * Template API client.
 *
 * Wire shape matches `TypstTemplateController`:
 *   GET    /typst/templates[?principal_id=N]  → { data: { templates: TemplateResource[] } }
 *   POST   /typst/templates                    body { name, content } → 201 + { data: { template: {...} } }
 *   DELETE /typst/templates/{name}             → 204
 *
 * Templates are filesystem-backed UTF-8 source files under
 * `<storage>/typst/templates/<principal>/`. The wire URL is
 * `/typst/templates` (matching the backend controller). The plugin
 * keeps a parallel `/typst/examples` endpoint for the smaller
 * pattern-snippet kind — {@see ./examples}.
 */
import { getApi } from './client'
import type { TemplateResource } from '../types'

export async function listTemplates(principalId?: number): Promise<TemplateResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/templates?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/templates'
    const result = await api.get<{ templates: TemplateResource[] }>(path)
    return result.templates
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
