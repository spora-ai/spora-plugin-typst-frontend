<script setup lang="ts">
/**
 * Card view of the principal's example pattern library.
 *
 * Same shape as {@see TemplateList}: card with basename + size +
 * origin chip + inline `<details>` source preview. Skill-shipped
 * examples (`origin: 'skill'`) render with the lock badge and a
 * disabled delete button.
 */
import { onMounted, ref } from 'vue'
import { useResourceStore } from '../stores/resources'
import type { ExampleResource } from '../types'

const store = useResourceStore()
const openId = ref<string | null>(null)

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

function togglePreview(name: string): void {
    openId.value = openId.value === name ? null : name
}

function readExample(name: string): Promise<string> {
    return import('../api/client').then(async ({ getApi }) => {
        const api = getApi() as unknown as { hostFetch?: typeof fetch }
        const hostFetch = api.hostFetch ?? globalThis.fetch
        const res = await hostFetch(`/api/v1/typst/examples/${encodeURIComponent(name)}`, {
            headers: { Accept: 'text/plain' },
            credentials: 'include',
        })
        if (!res.ok) throw new Error(`Read example ${name} failed: ${res.status}`)
        return res.text()
    })
}

async function ensurePreview(example: ExampleResource): Promise<string> {
    if (!openId.value) return ''
    try {
        return await readExample(example.name)
    } catch (e) {
        return `(failed to read: ${e instanceof Error ? e.message : 'unknown'})`
    }
}

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete example "${name}"? This cannot be undone.`)) return
    try {
        await store.removeExample(name)
    } catch {
        // store.error already populated
    }
}

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
                <pre v-if="openId === example.name" class="mt-2 p-2 bg-muted rounded text-[11px] overflow-x-auto font-mono whitespace-pre">{{ ensurePreview(example) }}</pre>
            </details>
        </div>
    </div>
</template>
