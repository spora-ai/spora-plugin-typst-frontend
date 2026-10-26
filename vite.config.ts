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
    define: {
        // The plugin uses vue-i18n's Composition API only, so the
        // Legacy API does not need to ship. `__INTLIFY_DROP_MESSAGE_COMPILER__`
        // is deliberately NOT set: the message compiler is what turns
        // `{name}` into a parameter lookup, and dropping it would make
        // every interpolated message render its own source.
        __VUE_I18N_FULL_INSTALL__: 'false',
        __VUE_I18N_LEGACY_API__: 'false',
        __INTLIFY_PROD_DEVTOOLS__: 'false',

        // `process.env.NODE_ENV` has to be replaced at build time.
        //
        // Vite replaces it for an *app* build, but not for a **library** build —
        // and this is a library build (`build.lib.formats: ['iife']`). So the
        // `process.env.NODE_ENV` inside vue-i18n survives into the bundle, and
        // `process` does not exist in a browser: the panel dies on load with
        // "process is not defined" before it renders a single string.
        //
        // vue-i18n only uses it to decide whether to *warn* — every use is a
        // `!== 'production'` guard — so replacing it with the real build mode
        // removes the development warnings and changes nothing else. The host
        // SPA gets the same replacement for free, which is why the bug only
        // shows up in a plugin bundle.
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
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
        // Installs the i18n instance on every mounted component — the
        // components translate their copy through `t()`.
        setupFiles: ['tests/setup.ts'],
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
            // Every directory SonarCloud expects coverage for must appear here,
            // or the quality gate reports "no data" instead of a percentage.
            // `src/constants` was missing — `sonar.coverage.exclusions` does not
            // exclude it, so SonarCloud counted its lines as new code while the
            // report said nothing about them.
            include: [
                'src/api/**/*.ts',
                'src/stores/**/*.ts',
                'src/composables/**/*.ts',
                'src/i18n/**/*.ts',
                'src/constants/**/*.ts',
            ],
            exclude: ['src/main.ts', 'src/dev-main.ts', 'src/shims.d.ts', 'src/types.ts', 'src/**/*.{vue,css}'],
        },
    },
})
