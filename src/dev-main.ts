import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createPluginI18n } from './i18n'

/**
 * Dev-mode entry. The production mount/unmount contract lives in
 * `main.ts` (which the host's registry consumes via
 * `window.SporaAppTypst`). For `npm run dev` we mount directly
 * under `#app` and stub `hostContext.api` with a no-op fetch — the
 * pages render the chrome and stores stay in their loading state.
 *
 * To exercise the real wire surface, run the host SPA's plugin
 * dev-proxy (`SPORA_PLUGIN_DEV_PORTS=typst:5176 npm run dev` in
 * `spora-frontend`) and visit `/apps/typst`.
 *
 * The language follows `?locale=de` so the German catalogue can be
 * checked by hand; the default is English.
 */

function devStubData(path: string): Record<string, unknown> {
    if (path === '/typst/fonts') return { fonts: [] }
    if (path === '/typst/examples') return { templates: [] }
    return { images: [] }
}

const devApi = {
    get: async (path: string): Promise<unknown> => ({ data: devStubData(path) }),
    post: async (): Promise<unknown> => ({ data: {} }),
    put: async (): Promise<unknown> => ({ data: {} }),
    patch: async (): Promise<unknown> => ({ data: {} }),
    delete: async (): Promise<unknown> => undefined,
}

const locale = new URLSearchParams(location.search).get('locale') ?? 'en'

const hostContext = {
    api: devApi,
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: null,
    locale,
}

const app = createApp(App, { hostContext })
app.use(createPinia())
app.use(createPluginI18n(locale))
app.mount('#app')
