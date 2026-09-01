/**
 * Font API client.
 *
 * Routes through `getApi()` at call-time so `api/client.ts` is the
 * single point of contact with the host's typed REST client.
 *
 * Wire shape matches `TypstFontController` in the backend plugin:
 *   GET    /typst/fonts[?principal_id=N]  → { data: { fonts: FontResource[] } }
 *   POST   /typst/fonts                    body { name, content (base64) } → 201 + { data: { font: {...} } }
 *   DELETE /typst/fonts/{name}             → 204
 *
 * `listFonts` accepts an optional `principalId` — when set, the
 * backend scopes the listing to that principal (must be in the
 * caller's visible principals). POST stays tied to the caller's
 * own principal (uploads are always owner's).
 */
import { getApi } from './client'
import type { FontResource } from '../types'

export async function listFonts(principalId?: number): Promise<FontResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/fonts?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/fonts'
    const result = await api.get<{ fonts: FontResource[] }>(path)
    return result.fonts
}

export async function uploadFont(name: string, content: string): Promise<FontResource> {
    const api = getApi()
    const result = await api.post<{ font: FontResource }>('/typst/fonts', { name, content })
    return result.font
}

export async function deleteFont(name: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/fonts/${encodeURIComponent(name)}`)
}

