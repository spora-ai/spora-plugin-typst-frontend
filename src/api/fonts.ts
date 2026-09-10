/**
 * Font API client.
 *
 * Routes through `getApi()` at call-time so `api/client.ts` is the
 * single point of contact with the host's typed REST client.
 *
 * Wire shape matches `TypstFontController` in the backend plugin:
 *   GET    /typst/fonts[?principal_id=N]  → { data: { fonts: FontResource[] } }
 *   POST   /typst/fonts[?principal_id=N]  body { name, content (base64) } → 201 + { data: { font: {...} } }
 *   DELETE /typst/fonts/{name}[?principal_id=N] → 204
 *
 * `principalId` mirrors the chip-row selector on `?principal_id=N`.
 * All write/read methods accept it so uploads land in the scope
 * the operator is currently viewing — without it the backend pins
 * writes to the caller's user-principal and uploads in another
 * principal "vanish after reload".
 */
import { getApi, withPrincipal } from './client'
import type { FontResource } from '../types'

export async function listFonts(principalId?: number): Promise<FontResource[]> {
    const api = getApi()
    const result = await api.get<{ fonts: FontResource[] }>(withPrincipal('/typst/fonts', principalId))
    return result.fonts
}

export async function uploadFont(name: string, content: string, principalId?: number): Promise<FontResource> {
    const api = getApi()
    const result = await api.post<{ font: FontResource }>(withPrincipal('/typst/fonts', principalId), { name, content })
    return result.font
}

export async function deleteFont(name: string, principalId?: number): Promise<void> {
    const api = getApi()
    await api.delete(withPrincipal(`/typst/fonts/${encodeURIComponent(name)}`, principalId))
}

