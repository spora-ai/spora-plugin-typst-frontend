/**
 * PostCSS config — runs Tailwind through PostCSS for the plugin's
 * own utility classes. Mirrors `spora-plugin-memories-frontend/postcss.config.js`.
 */
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
}
