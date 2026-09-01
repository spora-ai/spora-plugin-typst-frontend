import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setApi } from './api/client'
import type { PluginHostContext } from './shims'

/**
 * Plugin mount/unmount contract.
 *
 * The IIFE lib wrapper installs this on `window.SporaAppTypst`.
 * The host's `apps/registry.ts` reads `window.SporaAppTypst.mount`
 * and `unmount` and calls them when `/apps/typst` is mounted/
 * unmounted.
 *
 * Mirrors `spora-plugin-memories-frontend/src/main.ts` byte-for-byte
 * for the mount/unmount shape; only the lib name and the routed
 * page differ.
 *
 * Plugin-local Pinia (for the resource / image stores) is installed
 * here. Host services (auth, theme) are reached via the passed-in
 * `hostContext.api`; `setApi(...)` initialises the bridge.
 */
interface MountContract {
    mount: (target: HTMLElement, hostContext: PluginHostContext) => void | Promise<void>
    unmount: (target: HTMLElement) => void
}

interface MountTarget extends HTMLElement {
    __sporaApp?: { unmount: () => void; app: import('vue').App }
}

const SporaApp: MountContract = {
    mount(target: HTMLElement, hostContext: PluginHostContext): void {
        setApi(hostContext.api)

        const app = createApp(App, { hostContext })
        app.use(createPinia())
        app.mount(target)

        const typedTarget = target as MountTarget
        typedTarget.__sporaApp = {
            app,
            unmount: () => {
                app.unmount()
            },
        }
    },

    unmount(target: HTMLElement): void {
        const typedTarget = target as MountTarget
        if (typedTarget.__sporaApp) {
            typedTarget.__sporaApp.unmount()
            delete typedTarget.__sporaApp
        }
    },
}

window.SporaAppTypst = SporaApp

export default SporaApp
