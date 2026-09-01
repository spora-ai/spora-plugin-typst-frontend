/**
 * Font API client.
 *
 * Routes through `getApi()` at call-time so `api/client.ts` is the
 * single point of contact with the host's typed REST client.
 *
 * Wire shape matches `TypstFontController` in the backend plugin:
 *   GET    /typst/fonts           → { data: { fonts: FontResource[] } }
 *   POST   /typst/fonts           body { name, content (base64) } → 201 + { data: { font: {...} } }
 *   DELETE /typst/fonts/{name}    → 204
 */
import { getApi } from './client'
import type { FontResource } from '../types'

export async function listFonts(): Promise<FontResource[]> {
    const api = getApi()
    const result = await api.get<{ fonts: FontResource[] }>('/typst/fonts')
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
