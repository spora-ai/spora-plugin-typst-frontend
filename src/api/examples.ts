/**
 * Example API client.
 *
 * Wire shape matches `TypstExampleController`:
 *   GET    /typst/examples[?principal_id=N]  → { data: { examples: ExampleResource[] } }
 *   POST   /typst/examples[?principal_id=N]   body { name, content } → 201 + { data: { example: {...} } }
 *   PUT    /typst/examples/{name}[?principal_id=N] body { content } → 200 + { data: { example: {...} } }
 *   GET    /typst/examples/{name}[?principal_id=N] → text/plain
 *   DELETE /typst/examples/{name}[?principal_id=N] → 204
 *
 * Examples are filesystem-backed UTF-8 source files under
 * `<storage>/typst/examples/<principal>/`. The wire URL says
 * `/typst/examples` (matching the backend controller) — operators
 * only see the distinction via the UI's separate "Examples" tab.
 *
 * `principalId` mirrors the chip-row selector on `?principal_id=N`.
 * All write/read methods accept it so uploads land in the scope
 * the operator is currently viewing — without it the backend pins
 * writes to the caller's user-principal and uploads in another
 * principal "vanish after reload".
 */
import { getApi, fetchText, withPrincipal } from './client'
import type { ExampleResource } from '../types'

export async function listExamples(principalId?: number): Promise<ExampleResource[]> {
    const api = getApi()
    const result = await api.get<{ examples: ExampleResource[] }>(withPrincipal('/typst/examples', principalId))
    return result.examples
}

export async function uploadExample(name: string, content: string, principalId?: number): Promise<ExampleResource> {
    const api = getApi()
    const result = await api.post<{ example: ExampleResource }>(withPrincipal('/typst/examples', principalId), { name, content })
    return result.example
}

/**
 * Replace the contents of an existing principal-tier example. The
 * controller upserts on `(principal_id, name)`, so the row's `size`
 * and `modified_at` reflect the new bytes and `name` itself is
 * immutable on this path (rename is a delete + upload).
 */
export async function updateExample(name: string, content: string, principalId?: number): Promise<ExampleResource> {
    const api = getApi()
    const result = await api.put<{ example: ExampleResource }>(
        withPrincipal(`/typst/examples/${encodeURIComponent(name)}`, principalId),
        { content },
    )
    return result.example
}

export async function deleteExample(name: string, principalId?: number): Promise<void> {
    const api = getApi()
    await api.delete(withPrincipal(`/typst/examples/${encodeURIComponent(name)}`, principalId))
}

/**
 * Read an example's source bytes. The controller responds with
 * `Content-Type: text/plain; charset=utf-8` so we use {@see fetchText}
 * instead of `api.get<string>()` — the host's JSON parser would
 * otherwise synthesise an `INVALID_JSON` envelope and mask the
 * body. Used by the "View source" preview in the Examples card list.
 */
export async function getExample(name: string, principalId?: number): Promise<string> {
    return await fetchText(withPrincipal(`/typst/examples/${encodeURIComponent(name)}`, principalId))
}
