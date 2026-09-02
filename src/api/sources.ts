/**
 * Playground source API client.
 *
 * Wire shape matches `TypstPlaygroundSourceController`:
 *   GET    /typst/sources                        → { data: { sources: PlaygroundSourceSummary[] } }
 *   GET    /typst/sources/{id}                   → { data: PlaygroundSource }
 *   PUT    /typst/sources/{id}   body { content } → { data: { id, filename, byte_size, updated_at } }
 *   DELETE /typst/sources/{id}                   → 204
 *
 * The compile endpoint (`POST /api/v1/typst/compile`) materialises
 * the parent row as a side-effect; this client is the user-facing
 * counterpart that lets the operator UI open / edit / delete those
 * rows without going through the media archive plugin.
 */
import { getApi } from './client'
import type { PlaygroundSource, PlaygroundSourceSummary } from '../types'

export async function listSources(): Promise<PlaygroundSourceSummary[]> {
    const api = getApi()
    const result = await api.get<{ sources: PlaygroundSourceSummary[] }>('/typst/sources')
    return result.sources
}

export async function getSource(id: string): Promise<PlaygroundSource> {
    const api = getApi()
    return await api.get<PlaygroundSource>(`/typst/sources/${encodeURIComponent(id)}`)
}

export async function updateSource(id: string, content: string): Promise<PlaygroundSource> {
    const api = getApi()
    return await api.put<PlaygroundSource>(`/typst/sources/${encodeURIComponent(id)}`, { content })
}

export async function deleteSource(id: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/sources/${encodeURIComponent(id)}`)
}
