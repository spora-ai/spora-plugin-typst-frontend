/**
 * Playground source API client.
 *
 * Wire shape matches `TypstPlaygroundSourceController`:
 *   GET    /typst/sources[?principal_id=N]         → { data: { sources: PlaygroundSourceSummary[] } }
 *   GET    /typst/sources/{id}[?principal_id=N]    → { data: PlaygroundSource }
 *   PUT    /typst/sources/{id}[?principal_id=N]    body { content } → { data: { id, filename, byte_size, updated_at } }
 *   DELETE /typst/sources/{id}[?principal_id=N]    → 204
 *
 * The compile endpoint (`POST /api/v1/typst/compile`) materialises
 * the parent row as a side-effect; this client is the user-facing
 * counterpart that lets the operator UI open / edit / delete those
 * rows without going through the media archive plugin.
 *
 * The `?principal_id=N` query param mirrors the other resource
 * controllers (fonts/templates/examples/images) so the chip row in
 * the page can scope the open picker to whichever principal the
 * operator has selected.
 */
import { getApi } from './client'
import type { PlaygroundSource, PlaygroundSourceSummary } from '../types'

function withPrincipal(path: string, principalId?: number | null): string {
    return principalId !== undefined && principalId !== null
        ? `${path}?principal_id=${encodeURIComponent(String(principalId))}`
        : path
}

export async function listSources(principalId?: number | null): Promise<PlaygroundSourceSummary[]> {
    const api = getApi()
    const result = await api.get<{ sources: PlaygroundSourceSummary[] }>(withPrincipal('/typst/sources', principalId))
    return result.sources
}

export async function getSource(id: string, principalId?: number | null): Promise<PlaygroundSource> {
    const api = getApi()
    return await api.get<PlaygroundSource>(withPrincipal(`/typst/sources/${encodeURIComponent(id)}`, principalId))
}

export async function updateSource(id: string, content: string, principalId?: number | null): Promise<PlaygroundSource> {
    const api = getApi()
    return await api.put<PlaygroundSource>(
        withPrincipal(`/typst/sources/${encodeURIComponent(id)}`, principalId),
        { content },
    )
}

export async function deleteSource(id: string, principalId?: number | null): Promise<void> {
    const api = getApi()
    await api.delete(withPrincipal(`/typst/sources/${encodeURIComponent(id)}`, principalId))
}
