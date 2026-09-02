<script setup lang="ts">
/**
 * Card view of the principal's example pattern library.
 *
 * Same shape as {@see TemplateList}: card with basename + size +
 * origin chip + inline `<details>` source preview. Skill-shipped
 * examples (`origin: 'skill'`) render with the lock badge and a
 * disabled delete button.
 *
 * Source-preview handling mirrors TemplateList: cache the fetched
 * bytes in `sourceByName` and only fetch on first expand.
 */
import { onMounted, ref, watch } from 'vue'
import { ApiError } from '../api/client'
import { getExample } from '../api/examples'
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
        sourceByName.value = { ...sourceByName.value, [name]: await getExample(name) }
    } catch (e) {
        loadError.value = e instanceof ApiError ? e.message : 'failed to read example'
    } finally {
        loadingName.value = null
    }
}

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete example "${name}"? This cannot be undone.`)) return
    try {
        await store.removeExample(name)
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
    if ((store.examples ?? []).length === 0) store.loadExamples()
})
</script>

<template>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
            v-if="store.loading && (store.examples ?? []).length === 0"
            class="md:col-span-2 text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="(store.examples ?? []).length === 0"
            class="md:col-span-2 text-center text-muted-foreground py-6"
        >No example patterns yet.</div>
        <div
            v-for="example in (store.examples ?? [])"
            :key="example.name"
            class="rounded-lg border border-border bg-card p-4 space-y-2"
        >
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="font-mono text-sm text-foreground truncate">{{ example.name }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                        {{ formatBytes(example.size) }}
                        · <span class="text-muted-foreground/70">{{ example.origin === 'skill' ? 'Skill-shipped' : 'Principal' }}</span>
                    </div>
                </div>
                <button
                    v-if="example.origin === 'principal'"
                    type="button"
                    class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                    :disabled="store.uploading"
                    @click="confirmAndDelete(example.name)"
                >Delete</button>
                <span v-else class="text-xs text-muted-foreground">Built-in</span>
            </div>
            <details
                class="text-xs"
                :open="openId === example.name"
                @toggle="togglePreview(example.name)"
            >
                <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                <div v-if="openId === example.name" class="mt-2">
                    <div
                        v-if="loadingName === example.name"
                        class="p-2 text-muted-foreground"
                    >Loading…</div>
                    <div
                        v-else-if="loadError !== null"
                        class="p-2 text-destructive"
                    >{{ loadError }}</div>
                    <pre
                        v-else-if="sourceByName[example.name] !== undefined"
                        class="p-2 bg-muted rounded text-[11px] overflow-x-auto font-mono whitespace-pre"
                    >{{ sourceByName[example.name] }}</pre>
                </div>
            </details>
        </div>
    </div>
</template>
