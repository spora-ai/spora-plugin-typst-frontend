<script setup lang="ts">
/**
 * App.vue — single-page admin UI. The plugin mounts this under a
 * slot owned by the host's `PluginAppPage.vue`; `TypstPage.vue`
 * carries the actual tabbed UI.
 *
 * The `<div id="spora-plugin-typst">` root wrapper matches
 * `tailwind.config.ts → important: '#spora-plugin-typst'`, scoping
 * every Tailwind utility to this subtree so plugin classes can't
 * leak into the host SPA or sibling plugins. Mirrors the
 * memories/memories-frontend `id="spora-plugin-memories"`
 * wrapper (the host SPA's `PluginAppPage.vue` slot is just a plain
 * `<div ref="slotRef">` — no id — so the plugin owns the scope
 * boundary itself).
 *
 * `hostContext` is threaded through so pages can call back into the
 * host router if a future tab needs breadcrumb-style navigation.
 */
import TypstPage from './pages/TypstPage.vue'
import './style.css'

defineProps<{
    hostContext: import('./shims').PluginHostContext
}>()
</script>

<template>
    <div id="spora-plugin-typst">
        <TypstPage :host-context="hostContext" />
    </div>
</template>
