import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Vite config for the Typst IIFE bundle.
 *
 * Mirrors `spora-plugin-memories-frontend/vite.config.ts`:
 *  - `build.lib.formats: ['iife']` — single self-contained script the
 *    host SPA can dynamic `import()`.
 *  - `build.lib.name: 'SporaAppTypst'` — matches the PascalCase slug
 *    convention in the host's `apps/registry.ts → globalFor()`.
 *  - `build.rollupOptions.external: ['vue', 'pinia', 'vue-router']`
 *    keeps heavy / shared libraries out of the bundle so the host
 *    SPA's instances are shared.
 *
 * `build.outDir: '.'` writes `main.js` + `style.css` directly into this
 * repo's root (where the `frontend/` symlink target lives); the host's
 * `SporaPluginFrontendInstaller` copies that tree into
 * `public/plugins/<slug>/`.
 */
export default defineConfig({
    plugins: [vue()],
    // Mirror the host's plugin dev-proxy prefix — must match
    // `SPORA_PLUGIN_DEV_PORTS=typst:5176` on the host.
    base: '/plugins/typst/',
    build: {
        outDir: 'frontend',
        emptyOutDir: false,
        lib: {
            entry: 'src/main.ts',
            formats: ['iife'],
            name: 'SporaAppTypst',
            fileName: () => 'main.js',
        },
        rollupOptions: {
            external: ['vue', 'pinia', 'vue-router', 'lucide-vue-next'],
            output: {
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'style.css'
                    }
                    return assetInfo.name ?? 'asset'
                },
            },
        },
    },
    server: {
        port: 5176,
        strictPort: false,
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['tests/**/*.{test,spec}.{js,ts}'],
    },
})
