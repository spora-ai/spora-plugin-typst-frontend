/**
 * Media-archive image client (cross-plugin).
 *
 * Operators can pick any media-archive image into the Typst
 * playground's image picker — the LLM pastes the
 * `/api/v1/assets/<uuid>.<ext>` URL it gets back into
 * `#image("…")`. Distinct from the plugin's own filesystem image
 * library (`api/images.ts`); the picker surfaces both.
 *
 * Endpoint: `GET /api/v1/media?types=image[&principal_id=N]`
 * Response: `{ data: { assets: MediaAsset[] } }` — we map it down
 * to the plugin's {@see MediaArchiveImage} type for the UI.
 */
import { getApi } from './client'
import type { MediaArchiveImage } from '../types'

export async function listMediaArchiveImages(principalId?: number): Promise<MediaArchiveImage[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/media?types=image&principal_id=${encodeURIComponent(String(principalId))}`
        : '/media?types=image'
    const result = await api.get<{ assets: MediaArchiveImage[] }>(path)
    return result.assets
}
