/**
 * Plugin-host bridge contract.
 *
 * The host's `apps/registry.ts` hands the plugin this context at mount.
 * The Typst plugin reads `api` (through `api/client.ts → getApi()`) and
 * `locale`; the remaining fields are declared so this file stays a
 * faithful, deliberately smaller view of what the host builds.
 *
 *   - `api`     — typed REST client (CSRF tokens, `/api/v1` base,
 *                `{ data: T }` envelope unwrap).
 *   - `pinia`   — the host's Pinia instance. We install a local Pinia
 *                for plugin-only state and do NOT call
 *                `setActivePinia(host.pinia)` — that would collide with
 *                the host's stores.
 *   - `theme`   — `'light' | 'dark'` snapshot at mount.
 *   - `route`   — the host's current route.
 *   - `router`  — the host's Vue Router instance.
 *   - `locale`  — the host's active interface language, e.g. `'de'`.
 */
export interface PluginHostContext {
    api: {
        get: <T = unknown>(path: string) => Promise<T>
        post: <T = unknown>(path: string, body: unknown) => Promise<T>
        put: <T = unknown>(path: string, body: unknown) => Promise<T>
        patch: <T = unknown>(path: string, body: unknown) => Promise<T>
        delete: <T = unknown>(path: string) => Promise<T>
    }
    pinia: unknown
    theme: 'light' | 'dark'
    route: { path: string; params: Record<string, unknown>; query: Record<string, unknown> } | null
    router: {
        push: (to: string) => Promise<unknown>
        currentRoute: { value: { path: string; params?: Record<string, unknown>; query?: Record<string, unknown> } }
    } | null
    /**
     * The host's active interface language, e.g. `'de'`.
     *
     * The plugin builds its own i18n instance from its own catalogue and
     * initialises it with this.
     */
    locale: string
}

declare global {
    interface Window {
        SporaAppTypst?: {
            mount: (target: HTMLElement, ctx: PluginHostContext) => void | Promise<void>
            unmount?: (target: HTMLElement) => void
        }
    }
}

export {}
