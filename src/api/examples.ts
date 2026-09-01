/**
 * Example template API client.
 *
 * Wire shape matches `TypstExampleController` in the backend:
 *   GET    /typst/examples[?principal_id=N]  → { data: { examples: ExampleResource[] } }
 *   POST   /typst/examples                    body { name, content } → 201 + { data: { example: {...} } }
 *   DELETE /typst/examples/{name}             → 204
 *
 * `listExamples` accepts an optional `principalId` for the chip-row
 * selector (must be in the caller's visible principals).
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
