<script setup lang="ts">
/**
 * App.vue — single-page admin UI. The plugin mounts this under a
 * slot owned by the host's `PluginAppPage.vue`; `TypstPage.vue`
 * carries the actual tabbed UI.
 *
 * We pass `hostContext` through so pages can call back into the
 * host router if a future tab needs breadcrumb-style navigation
 * back to `/apps/<other>`. Currently the playground doesn't use
 * it but the prop is part of the contract.
 */
import TypstPage from './pages/TypstPage.vue'
import './style.css'

defineProps<{
    hostContext: import('./shims').PluginHostContext
}>()
</script>

<template>
    <TypstPage :host-context="hostContext" />
</template>
