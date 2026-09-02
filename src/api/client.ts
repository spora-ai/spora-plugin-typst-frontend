/**
 * Plugin-local bridge to the host's typed REST client.
 *
 * Mirrors `spora-plugin-memories-frontend/src/api/client.ts`. The
 * bundle is mounted by `spora-frontend`'s `apps/registry.ts` which
 * passes a `PluginHostContext` to `mount()`. The host's API client
 * knows about CSRF tokens, the `/api/v1` base, and the
 * `{ data: T }` envelope unwrap — we don't recreate any of that here,
 * we just hand the passed-in instance back to the rest of the plugin.
 *
 * `setApi()` is called once per `mount()`; `getApi()` is then used by
 * `api/{fonts,examples,images,compile}.ts` and any plugin-local fetch
 * helper. Tests can either `vi.mock()` this module directly or
 * re-`setApi()` with a stub.
 *
 * `ApiError` mirrors the host's `spora-frontend/src/api/client.ts →
 * ApiError` shape: `{ message, code, status }`. Plugin code only
 * reads `message` (for surfacing errors in the store's loading flags).
 *
 * `fetchText` is a plugin-local helper for the .typ source endpoints
 * (Templates, Examples, Fonts preview) that respond with
 * `text/plain` — the host's `api.get<T>()` always `JSON.parse()`s
 * the body and synthesises an `INVALID_JSON` error envelope on
 * non-JSON payloads, which would mask a perfectly fine text
 * response. The helper uses `globalThis.fetch` directly because:
 *   - GET requests don't need a CSRF token (state-changing methods
 *     only — see the host's `STATE_CHANGING_METHODS` set).
 *   - Session cookies are sent via `credentials: 'include'`, the
 *     same flag the host's client uses.
 *   - The response is read with `.text()` rather than the host's
 *     `.json()`, which avoids the synthetic-error trap.
 */
import type { PluginHostContext } from '../shims'

let _api: PluginHostContext['api'] | null = null

export function setApi(api: PluginHostContext['api']): void {
    _api = api
}

export function getApi(): PluginHostContext['api'] {
    if (_api === null) {
        throw new Error('Plugin API not initialized — call setApi() in main.ts before mounting the plugin.')
    }
    return _api
}

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly status: number,
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

/**
 * Fetch a path and return the response body as text.
 *
 * The host's API client is JSON-only: its `parseBody()` helper
 * synthesises `{ error: { code: 'INVALID_JSON', message: … } }`
 * when the body isn't valid JSON, which swallows the actual text
 * from the .typ source endpoints. This helper is the text-shaped
 * counterpart — same auth (session cookie via `credentials:
 * 'include'`, no CSRF for GET), same `/api/v1` prefix, but
 * `.text()` for the body.
 *
 * Errors surface as `ApiError` so the calling store's
 * `try { … } catch (ApiError)` shape stays uniform.
 */
export async function fetchText(path: string): Promise<string> {
    const response = await fetch(`/api/v1${path}`, {
        credentials: 'include',
        headers: { Accept: 'text/plain' },
    })
    if (!response.ok) {
        // Best-effort: try to surface the server's structured
        // error message; fall back to the status line.
        let body: Record<string, unknown> | null = null
        try {
            const text = await response.text()
            body = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null
        } catch {
            // not JSON — leave body as null
        }
        const err = body?.error as Record<string, string> | undefined
        const code = err?.code ?? 'HTTP_ERROR'
        const message = err?.message ?? `HTTP ${response.status}`
        throw new ApiError(message, code, response.status)
    }
    return await response.text()
}
