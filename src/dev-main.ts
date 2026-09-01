import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

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
 */

const devApi = {
    get: async (path: string): Promise<unknown> => ({ data: path === '/typst/fonts' ? { fonts: [] } : path === '/typst/examples' ? { examples: [] } : { images: [] } }),
    post: async (): Promise<unknown> => ({ data: {} }),
    put: async (): Promise<unknown> => ({ data: {} }),
    patch: async (): Promise<unknown> => ({ data: {} }),
    delete: async (): Promise<unknown> => undefined,
}

const hostContext = {
    api: devApi,
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: null,
}

const app = createApp(App, { hostContext })
app.use(createPinia())
app.mount('#app')
