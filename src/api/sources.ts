/**
 * Playground source API client.
 *
 * Wire shape matches `TypstPlaygroundSourceController`:
 *   GET    /typst/sources[?principal_id=N&kind=…]
 *                                              → { data: { sources: PlaygroundSourceSummary[] } }
 *   POST   /typst/sources[?principal_id=N]         body { filename, content } → { data: { id, filename, byte_size, created_at, updated_at } }
 *   GET    /typst/sources/{id}[?principal_id=N]    → { data: PlaygroundSource }
 *   PUT    /typst/sources/{id}[?principal_id=N]    body { content } → { data: { id, filename, byte_size, updated_at } }
 *   DELETE /typst/sources/{id}[?principal_id=N]    → 204
 *
 * The compile endpoint (`POST /api/v1/typst/compile`) materialises
 * the parent row as a side-effect; this client is the user-facing
 * counterpart that lets the operator UI list / open / create /
 * edit / delete those rows without going through the media archive
 * plugin.
 *
 * The `?principal_id=N` query param mirrors the other resource
 * controllers (fonts/templates/examples/images) so the chip row in
 * the page can scope the open picker to whichever principal the
 * operator has selected.
 *
 * The `?kind=saved|generated|uploaded|all` query param scopes the
 * listing to one of the three `.typ` row pools; `all` (the default)
 * returns the union. The backend rejects anything outside the
 * allow-list with a 422.
 */
import { getApi } from './client'
import type { PlaygroundSource, PlaygroundSourceKind, PlaygroundSourceSummary } from '../types'

function withPrincipal(path: string, principalId?: number | null): string {
    return principalId !== undefined && principalId !== null
        ? `${path}?principal_id=${encodeURIComponent(String(principalId))}`
        : path
}

function withKind(path: string, kind?: PlaygroundSourceKind | 'all' | null): string {
    if (kind === undefined || kind === null || kind === 'all') {
        return path
    }
    const sep = path.includes('?') ? '&' : '?'
    return `${path}${sep}kind=${encodeURIComponent(kind)}`
}

function withPrincipalAndKind(
    path: string,
    principalId?: number | null,
    kind?: PlaygroundSourceKind | 'all' | null,
): string {
    return withKind(withPrincipal(path, principalId), kind)
}

export async function listSources(
    principalId?: number | null,
    kind?: PlaygroundSourceKind | 'all' | null,
): Promise<PlaygroundSourceSummary[]> {
    const api = getApi()
    const result = await api.get<{ sources: PlaygroundSourceSummary[] }>(
        withPrincipalAndKind('/typst/sources', principalId, kind),
    )
    return result.sources
}

/**
 * Create a new playground source row without compiling. Returns the
 * freshly minted row's id so the caller can wire subsequent edits
 * through `updateSource(id, ...)`. The controller used to reject
 * with 409 CONFLICT on filename collisions; the current contract
 * is to create a sibling row, so this call only fails on validation
 * errors (bad filename, missing content).
 */
export async function createSource(
    filename: string,
    content: string,
    principalId?: number | null,
): Promise<PlaygroundSourceSummary> {
    const api = getApi()
    return await api.post<PlaygroundSourceSummary>(
        withPrincipal('/typst/sources', principalId),
        { filename, content },
    )
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
