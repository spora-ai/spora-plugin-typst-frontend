<script setup lang="ts">
/**
 * Examples tab — wraps the shared ResourceCardList and forwards
 * the `open-in-editor` event to the parent (TypstPage) so it can
 * route through `useTabsStore().goToEditor()`. Edit is handled
 * in-place inside the overlay. The overlay also owns the
 * example render thumbnail, so the parent no longer needs to
 * coordinate `render-example` either — kept as a no-op
 * telemetry signal.
 */
import ResourceCardList from './ResourceCardList.vue'

defineEmits<{
    (e: 'open-in-editor', payload: { name: string; content: string; filename: string }): void
}>()
</script>

<template>
    <ResourceCardList
        kind="example"
        empty-text="No example patterns yet."
        built-in-heading-text="Built-in"
        @open-in-editor="$emit('open-in-editor', $event)"
    />
</template>
