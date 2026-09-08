<script setup lang="ts">
/**
 * Templates tab — wraps the shared ResourceCardList and forwards
 * the `edit` event to the parent (TypstPage) so it can open the
 * TextResourceEditModal. The kind prop tells the card list which
 * snippet to render (`#import "templates/X.typ"`).
 */
import ResourceCardList from './ResourceCardList.vue'

defineEmits<{
    (e: 'edit', payload: { name: string; kind: 'template' | 'example'; content: string }): void
}>()
</script>

<template>
    <ResourceCardList
        kind="template"
        empty-text="No templates uploaded yet."
        built-in-heading-text="Built-in"
        @edit="$emit('edit', $event)"
    />
</template>
