<script setup lang="ts">
/**
 * Card view of the principal's template library.
 *
 * Each card shows the basename + size + origin chip; an inline
 * `<details>` block reveals the source on click. Skill-shipped
 * templates (`origin: 'skill'`) render with the lock badge and a
 * disabled delete button — the API would 422 them anyway.
 *
 * Source-preview handling: when the user expands a card for the
 * first time, we fetch the bytes via {@see getTemplate} and cache
 * them in `sourceByName` so subsequent toggles don't re-fetch.
 * The previous shape called an `async` function inline as the
 * `<pre>`'s text content, which Vue stringifies to `[object Promise]`
 * because the function returns a Promise before the body resolves.
 */
import { onMounted, ref, watch } from 'vue'
import { ApiError } from '../api/client'
import { getTemplate } from '../api/templates'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()
const openId = ref<string | null>(null)
const sourceByName = ref<Record<string, string>>({})
const loadingName = ref<string | null>(null)
const loadError = ref<string | null>(null)

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

function togglePreview(name: string): void {
    openId.value = openId.value === name ? null : name
}

async function ensureSource(name: string): Promise<void> {
    if (sourceByName.value[name] !== undefined) return
    loadingName.value = name
    loadError.value = null
    try {
        sourceByName.value = { ...sourceByName.value, [name]: await getTemplate(name) }
    } catch (e) {
        loadError.value = e instanceof ApiError ? e.message : 'failed to read template'
    } finally {
        loadingName.value = null
    }
}

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return
    try {
        await store.removeTemplate(name)
        // Drop the cached source so a re-upload of the same name
        // re-fetches instead of showing the deleted file's body.
        const next = { ...sourceByName.value }
        delete next[name]
        sourceByName.value = next
        if (openId.value === name) openId.value = null
    } catch {
        // store.error already populated
    }
}

watch(openId, async (name) => {
    if (name !== null) {
        await ensureSource(name)
    }
})

onMounted(() => {
    if ((store.templates ?? []).length === 0) store.loadTemplates()
})
</script>

<template>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
            v-if="store.loading && (store.templates ?? []).length === 0"
            class="md:col-span-2 text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="(store.templates ?? []).length === 0"
            class="md:col-span-2 text-center text-muted-foreground py-6"
        >No templates uploaded yet.</div>
        <div
            v-for="template in (store.templates ?? [])"
            :key="template.name"
            class="rounded-lg border border-border bg-card p-4 space-y-2"
        >
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="font-mono text-sm text-foreground truncate">{{ template.name }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                        {{ formatBytes(template.size) }}
                        · <span class="text-muted-foreground/70">{{ template.origin === 'skill' ? 'Skill-shipped' : 'Principal' }}</span>
                    </div>
                </div>
                <button
                    v-if="template.origin === 'principal'"
                    type="button"
                    class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                    :disabled="store.uploading"
                    @click="confirmAndDelete(template.name)"
                >Delete</button>
                <span v-else class="text-xs text-muted-foreground">Built-in</span>
            </div>
            <details
                class="text-xs"
                :open="openId === template.name"
                @toggle="togglePreview(template.name)"
            >
                <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                <div v-if="openId === template.name" class="mt-2">
                    <div
                        v-if="loadingName === template.name"
                        class="p-2 text-muted-foreground"
                    >Loading…</div>
                    <div
                        v-else-if="loadError !== null"
                        class="p-2 text-destructive"
                    >{{ loadError }}</div>
                    <pre
                        v-else-if="sourceByName[template.name] !== undefined"
                        class="p-2 bg-muted rounded text-[11px] overflow-x-auto font-mono whitespace-pre"
                    >{{ sourceByName[template.name] }}</pre>
                </div>
            </details>
        </div>
    </div>
</template>
