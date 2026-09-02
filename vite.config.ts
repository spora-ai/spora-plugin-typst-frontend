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
                    if (assetInfo.name?.endsWith('.css')) {
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
        reporters: process.env.CI
            ? [
                ['default'],
                [
                    'junit',
                    {
                        outputFile: './coverage/test-report.xml',
                    },
                ],
            ]
            : ['default'],
        coverage: {
            // SonarCloud expects `coverage/lcov.info` from the JS/TS
            // scanner; html is convenient for the PR comment.
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            reportsDirectory: './coverage',
            // Only the TS modules currently exercised by tests are
            // included; Vue SFCs and the few type-only files are
            // excluded so the coverage number reflects real exercised
            // code rather than a denominator inflated by untested
            // components. Mirrors `sonar.coverage.exclusions`.
            include: ['src/api/**/*.ts', 'src/stores/**/*.ts'],
            exclude: ['src/main.ts', 'src/dev-main.ts', 'src/shims.d.ts', 'src/types.ts', 'src/**/*.{vue,css}'],
        },
    },
})
