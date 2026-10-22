/**
 * Plugin-local bridge to the host's typed REST client.
 *
 * The host's `apps/registry.ts` passes a `PluginHostContext` to
 * `mount()`, and that context carries the host's API client. The host's
 * client knows about CSRF tokens, the `/api/v1` base and the
 * `{ data: T }` envelope unwrap — we don't recreate any of that here,
 * we just hand the passed-in instance back to the rest of the plugin.
 *
 * `setApi()` is called once per `mount()`; `getApi()` is then used by
 * every API module and by the plugin-local fetch helper. Tests can
 * either `vi.mock()` this module directly or re-`setApi()` with a stub.
 *
 * `fetchText` is a plugin-local helper for the .typ source endpoints
 * (Templates, Examples) that respond with `text/plain` — the host's
 * `api.get<T>()` always `JSON.parse()`s the body and synthesises an
 * `INVALID_JSON` error envelope on non-JSON payloads, which would mask
 * a perfectly fine text response. The helper uses `globalThis.fetch`
 * directly because:
 *   - GET requests don't need a CSRF token (state-changing methods only).
 *   - Session cookies are sent via `credentials: 'include'`, the same
 *     flag the host's client uses.
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

/**
 * The plugin's own error type — thrown by `fetchText` and matched by the
 * stores' `e instanceof ApiError` branch.
 *
 * It is a different class from the host's `ApiError`: the host's client
 * throws its own, so the `instanceof` check only ever matches a failure
 * that came through `fetchText` (reading a template's or an example's
 * source). Everything the host's client throws takes the store's own
 * fallback sentence instead.
 */
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

/**
 * Append `?principal_id=N` to a path when the caller passed one.
 *
 * Centralised so every API client stays in lockstep on the
 * principal-scoping wire shape.
 */
export function withPrincipal(path: string, principalId: number | null | undefined): string {
    if (principalId === undefined || principalId === null) {
        return path
    }
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}principal_id=${encodeURIComponent(String(principalId))}`
}
