import type { Config } from 'tailwindcss'

/**
 * Tailwind config for the Typst plugin frontend.
 *
 * Mirrors `spora-plugin-memories-frontend/tailwind.config.ts` so the
 * plugin boundary is identical:
 *  - `corePlugins.preflight: false` — the host owns document-level
 *    resets; the plugin bundle omits them.
 *  - `important: '#spora-plugin-typst'` — every generated utility
 *    gets scoped beneath this selector so plugin classes can't leak
 *    into the host SPA or another plugin slot. The host SPA's
 *    PluginAppPage wraps the slot in `<div id="spora-plugin-typst">`
 *    on mount.
 *
 * Theme tokens mirror the host SPA's tokens (grey scale, indigo
 * accent for typst-700) so plugins render with the same design
 * language without the host needing to know the plugin's sources.
 */
export default {
    content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
    corePlugins: { preflight: false },
    important: '#spora-plugin-typst',
    theme: {
        extend: {
            fontFamily: {
                mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
            },
            colors: {
                typst: {
                    50: '#f5f7fb',
                    100: '#e8ecf4',
                    500: '#3a5c8c',
                    600: '#2c4773',
                    700: '#1f325a',
                    900: '#0e1a36',
                },
            },
        },
    },
    plugins: [],
} satisfies Config
