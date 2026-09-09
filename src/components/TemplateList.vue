<script setup lang="ts">
/**
 * Templates tab — wraps the shared ResourceCardList and forwards
 * the `open-in-editor` event to the parent (TypstPage) so it can
 * route through `useTabsStore().goToEditor()`. Edit is handled
 * in-place inside the overlay (no parent coordination needed).
 * The kind prop tells the card list which snippet to render
 * (`#import "templates/X.typ"`).
 */
import ResourceCardList from './ResourceCardList.vue'

defineEmits<{
    (e: 'open-in-editor', payload: { name: string; content: string; filename: string }): void
}>()
</script>

<template>
    <ResourceCardList
        kind="template"
        empty-text="No templates uploaded yet."
        built-in-heading-text="Built-in"
        @open-in-editor="$emit('open-in-editor', $event)"
    />
</template>
