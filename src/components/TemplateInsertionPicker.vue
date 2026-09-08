<script setup lang="ts">
/**
 * Template insertion picker — inline panel for the playground's
 * Editor tab. Mirrors the image picker's UX (panel, grid of
 * cards, click to insert) so the operator's mental model stays
 * uniform: pick a name, the right `#import "templates/<name>"`
 * snippet lands at the caret.
 *
 * Why a panel and not a modal: the playground's editor is one
 * tab in a multi-tab form. A modal would steal focus and force
 * the operator to dismiss it before continuing to type. The
 * panel sits inside the Editor card, scoped to the row that
 * triggered it, and closes on insert.
 *
 * The picker deliberately emits `insert` with just the name and
 * lets the parent (CompileForm) build the snippet. The backend's
 * `templates/<principal>/<name>` partition is the source of
 * truth for what's importable; emitting the name keeps the
 * picker ignorant of that path and lets the parent decide
 * whether to write `#import "templates/X.typ"`,
 * `#import "templates/X.typ": *`, or something else in the
 * future.
 */
import type { TemplateResource } from '../types'

withDefaults(defineProps<{
    open: boolean
    templates: TemplateResource[]
    loading?: boolean
    ariaLabel?: string
}>(), {
    loading: false,
    ariaLabel: 'Insert template',
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', payload: { name: string }): void
}>()

function close(): void {
    emit('close')
}

function onTemplateClick(name: string): void {
    emit('insert', { name })
}
</script>

<template>
    <div
        v-if="open"
        class="rounded-md border border-border bg-background p-3 space-y-2"
        :aria-label="ariaLabel"
        data-testid="template-insertion-picker"
    >
        <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-foreground">Templates ({{ templates.length }})</span>
            <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground"
                data-testid="template-insertion-close"
                @click="close"
            >Close</button>
        </div>
        <div
            v-if="loading"
            class="text-xs text-muted-foreground py-3 text-center"
        >Loading…</div>
        <div
            v-else-if="templates.length === 0"
            class="text-xs text-muted-foreground py-3 text-center"
        >No templates uploaded yet. Upload some via the Templates tab first.</div>
        <div
            v-else
            class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto"
        >
            <button
                v-for="template in templates"
                :key="template.name"
                type="button"
                class="border border-border rounded-md p-2 bg-card hover:border-primary transition-colors text-left"
                :data-testid="`template-insertion-card-${template.name}`"
                @click="onTemplateClick(template.name)"
            >
                <div
                    class="font-mono text-xs text-foreground truncate"
                    :title="template.name"
                >{{ template.name }}</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Click to insert</div>
            </button>
        </div>
    </div>
</template>
