/**
 * Image library API client.
 *
 * Wire shape matches `TypstImageController` (filesystem-backed, no
 * `media_assets` rows). The basenameless shape mirrors the other
 * resource kinds (font / template / example): one canonical
 * filesystem row per basename, served via the plugin's own route.
 *
 *   GET    /typst/images[?principal_id=N]  → { data: { images: ImageResource[] } }
 *   POST   /typst/images[?principal_id=N]  body { filename, mime, content } → 201 + { data: { image: {...} } }
 *   GET    /typst/images/{name}[?principal_id=N] → raw bytes (Content-Type from the file's extension)
 *   DELETE /typst/images/{name}[?principal_id=N] → 204
 *
 * `content` is the raw bytes when the file is SVG / UTF-8 (text MIME)
 * and base64-encoded for binary uploads. The controller auto-detects
 * via the same heuristic as the earlier TypstFontController.
 *
 * `principalId` mirrors the chip-row selector on `?principal_id=N`.
 * All write/read methods accept it so uploads land in the scope
 * the operator is currently viewing — without it the backend pins
 * writes to the caller's user-principal and uploads in another
 * principal "vanish after reload".
 */
import { getApi, withPrincipal } from './client'
import type { ImageResource, UploadedImage } from '../types'

export async function listImages(principalId?: number): Promise<ImageResource[]> {
    const api = getApi()
    const result = await api.get<{ images: ImageResource[] }>(withPrincipal('/typst/images', principalId))
    return result.images
}

export async function uploadImage(filename: string, mime: string, content: string, principalId?: number): Promise<UploadedImage> {
    const api = getApi()
    const result = await api.post<{ image: UploadedImage }>(withPrincipal('/typst/images', principalId), { filename, mime, content })
    return result.image
}

export async function deleteImage(name: string, principalId?: number): Promise<void> {
    const api = getApi()
    await api.delete(withPrincipal(`/typst/images/${encodeURIComponent(name)}`, principalId))
}

/**
 * Read a file as base64. Used for binary uploads (PNG / JPEG / WebP).
 * The result is wrapped in `{ content: '...' }` so the caller can
 * decide whether to base64-encode again or send raw.
 */
export function readFileAsBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (): void => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('FileReader returned non-string result'))
                return
            }
            // Result is a data: URL — strip the prefix and the
            // comma-separated MIME block so the controller can
            // auto-detect.
            const commaIdx = result.indexOf(',')
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
        }
        reader.onerror = (): void => reject(new Error('FileReader failed'))
        reader.readAsDataURL(file)
    })
}
