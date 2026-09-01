/**
 * Template API client.
 *
 * Wire shape matches `TypstExampleController` in the backend:
 *   GET    /typst/examples[?principal_id=N]  → { data: { templates: TemplateResource[] } }
 *   POST   /typst/examples                    body { name, content } → 201 + { data: { template: {...} } }
 *   DELETE /typst/examples/{name}             → 204
 *
 * The wire URL still says `/examples` — only the UI labels and types
 * are renamed to `templates`. Renaming the URL would be a much larger
 * PR with admin-only downstream migration cost (operator bookmarks,
 * the OpenAPI spec, the wire schemas in core's Media Archive), and the
 * user-facing concept ("Templates" in the UI vs "Examples" in the URL)
 * is invisible to operators after the rename.
 */
import { getApi } from './client'
import type { TemplateResource } from '../types'

export async function listTemplates(principalId?: number): Promise<TemplateResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/examples?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/examples'
    const result = await api.get<{ templates: TemplateResource[] }>(path)
    return result.templates
}

export async function uploadTemplate(name: string, content: string): Promise<TemplateResource> {
    const api = getApi()
    const result = await api.post<{ template: TemplateResource }>('/typst/examples', { name, content })
    return result.template
}

export async function deleteTemplate(name: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/examples/${encodeURIComponent(name)}`)
}
