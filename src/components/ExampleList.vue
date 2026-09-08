<script setup lang="ts">
/**
 * Examples tab — wraps the shared ResourceCardList and forwards the
 * `edit` + `render-example` + `open-in-editor` events to the parent
 * (TypstPage) so it can drive the edit modal, the example render
 * thumbnail, and the cross-tab prefill into the Editor.
 */
import ResourceCardList from './ResourceCardList.vue'

defineEmits<{
    (e: 'edit', payload: { name: string; kind: 'template' | 'example'; content: string }): void
    (e: 'render-example', payload: { name: string }): void
    (e: 'open-in-editor', payload: { name: string; content: string; filename: string }): void
}>()
</script>

<template>
    <ResourceCardList
        kind="example"
        empty-text="No example patterns yet."
        built-in-heading-text="Built-in"
        @edit="$emit('edit', $event)"
        @render-example="$emit('render-example', $event)"
        @open-in-editor="$emit('open-in-editor', $event)"
    />
</template>
