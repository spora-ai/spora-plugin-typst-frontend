import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Vite config for a Spora plugin IIFE bundle.
 *
 * The bundle must be a single self-contained script the host SPA can
 * `import()`. The lib `name` (`SporaAppTypst`) must match the PascalCase
 * slug the host registers in `apps/registry.ts → globalFor()`. Externals
 * stay out of the bundle so the host's instances are shared —
 * `output.globals` maps each external to the host's `window.*` publisher
 * in `publishPluginGlobals()`.
 */
export default defineConfig({
    plugins: [vue()],
    // Must match the host's SPORA_PLUGIN_DEV_PORTS=typst:5176 for dev-proxy.
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
            external: ['vue', 'pinia', 'vue-router'],
            output: {
                // Bare identifiers aren't free variables in module scope; the IIFE
                // wrapper needs window.* so the host publishes the globals via
                // publishPluginGlobals().
                globals: {
                    vue: 'window.Vue',
                    pinia: 'window.Pinia',
                    'vue-router': 'window.VueRouter',
                },
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
            // lcov for SonarCloud; html for the PR comment.
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            reportsDirectory: './coverage',
            // Mirrors sonar.coverage.exclusions — excludes Vue SFCs / type-only files
            // so the coverage number reflects exercised code, not an inflated denominator.
            include: ['src/api/**/*.ts', 'src/stores/**/*.ts', 'src/composables/**/*.ts'],
            exclude: ['src/main.ts', 'src/dev-main.ts', 'src/shims.d.ts', 'src/types.ts', 'src/**/*.{vue,css}'],
        },
    },
})
