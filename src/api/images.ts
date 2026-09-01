/**
 * Image library API client.
 *
 * Wire shape matches `TypstImageController` in the backend:
 *   GET    /typst/images[?principal_id=N]  → { data: { images: ImageResource[] } }
 *   POST   /typst/images                    body { filename, mime, content } → 201 + { data: { image: {...} } }
 *   DELETE /typst/images/{id}               → 204
 *
 * `content` is the raw bytes when the file is SVG / UTF-8 (text MIME)
 * and base64-encoded for binary uploads. The controller auto-detects.
 *
 * `listImages` accepts an optional `principalId` for the chip-row
 * selector (must be in the caller's visible principals).
 */
import { getApi } from './client'
import type { ImageResource, UploadedImage } from '../types'

export async function listImages(principalId?: number): Promise<ImageResource[]> {
    const api = getApi()
    const path = principalId !== undefined && principalId !== null
        ? `/typst/images?principal_id=${encodeURIComponent(String(principalId))}`
        : '/typst/images'
    const result = await api.get<{ images: ImageResource[] }>(path)
    return result.images
}

export async function uploadImage(filename: string, mime: string, content: string): Promise<UploadedImage> {
    const api = getApi()
    const result = await api.post<{ image: UploadedImage }>('/typst/images', { filename, mime, content })
    return result.image
}

export async function deleteImage(id: string): Promise<void> {
    const api = getApi()
    await api.delete(`/typst/images/${encodeURIComponent(id)}`)
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
