/**
 * Example API client.
 *
 * Wire shape matches `TypstExampleController`:
 *   GET    /typst/examples[?principal_id=N]  → { data: { examples: ExampleResource[] } }
 *   POST   /typst/examples                    body { name, content } → 201 + { data: { example: {...} } }
 *   GET    /typst/examples/{name}             → text/plain
 *   DELETE /typst/examples/{name}             → 204
 *
 * Examples are filesystem-backed UTF-8 source files under
 * `<storage>/typst/examples/<principal>/`. The wire URL says
 * `/typst/examples` (matching the backend controller) — operators
 * only see the distinction via the UI's separate "Examples" tab.
 */
import { getApi } from './client'
import type { ExampleResource } from '../types'

export async function listExamples(principalId?: number): Promise<ExampleResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/examples?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/examples'
    const result = await api.get<{ examples: ExampleResource[] }>(path)
    return result.examples
}

export async function uploadExample(name: string, content: string): Promise<ExampleResource> {
    const api = getApi()
    const result = await api.post<{ example: ExampleResource }>('/typst/examples', { name, content })
    return result.example
}

export async function deleteExample(name: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/examples/${encodeURIComponent(name)}`)
}

/**
 * Read an example's source bytes. The controller responds with
 * `Content-Type: text/plain; charset=utf-8` so the typed `get<string>`
 * returns the file body directly. Used by the "View source" preview
 * in the Examples card list.
 */
export async function getExample(name: string): Promise<string> {
    const api = getApi()
    return await api.get<string>(`/typst/examples/${encodeURIComponent(name)}`)
}
