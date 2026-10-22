<script setup lang="ts">
/**
 * App.vue — the plugin's root component. The host mounts it under the
 * slot in `PluginAppPage.vue`; `TypstPage.vue` carries the tabbed UI.
 *
 * The `<div id="spora-plugin-typst">` root wrapper matches
 * `tailwind.config.ts → important: '#spora-plugin-typst'`, scoping
 * every Tailwind utility to this subtree so plugin classes can't
 * leak into the host SPA or sibling plugins. The host's slot is just
 * a plain `<div ref="slotRef">` — no id — so the plugin owns the
 * scope boundary itself (the memories plugin does the same with
 * `id="spora-plugin-memories"`).
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
