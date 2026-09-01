/**
 * Example template API client.
 *
 * Wire shape matches `TypstExampleController` in the backend:
 *   GET    /typst/examples           → { data: { examples: ExampleResource[] } }
 *   POST   /typst/examples           body { name, content } → 201 + { data: { example: {...} } }
 *   DELETE /typst/examples/{name}    → 204
 */
import { getApi } from './client'
import type { ExampleResource } from '../types'

export async function listExamples(): Promise<ExampleResource[]> {
    const api = getApi()
    const result = await api.get<{ examples: ExampleResource[] }>('/typst/examples')
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
