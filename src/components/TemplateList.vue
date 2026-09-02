<script setup lang="ts">
/**
 * Card view of the principal's template library.
 *
 * Each card shows the basename + size + origin chip; an inline
 * `<details>` block reveals the source on click. Skill-shipped
 * templates (`origin: 'skill'`) render with the lock badge and a
 * disabled delete button — the API would 422 them anyway.
 */
import { onMounted, ref } from 'vue'
import { useResourceStore } from '../stores/resources'
import type { TemplateResource } from '../types'

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

function readTemplate(name: string): Promise<string> {
    return import('../api/client').then(async ({ getApi }) => {
        const api = getApi() as unknown as { hostFetch?: typeof fetch }
        const hostFetch = api.hostFetch ?? globalThis.fetch
        const res = await hostFetch(`/api/v1/typst/examples/${encodeURIComponent(name)}`, {
            headers: { Accept: 'text/plain' },
            credentials: 'include',
        })
        if (!res.ok) throw new Error(`Read template ${name} failed: ${res.status}`)
        return res.text()
    })
}

async function ensurePreview(template: TemplateResource): Promise<string> {
    if (!openId.value) return ''
    try {
        return await readTemplate(template.name)
    } catch (e) {
        return `(failed to read: ${e instanceof Error ? e.message : 'unknown'})`
    }
}

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return
    try {
        await store.removeTemplate(name)
    } catch {
        // store.error already populated
    }
}

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
                <pre v-if="openId === template.name" class="mt-2 p-2 bg-muted rounded text-[11px] overflow-x-auto font-mono whitespace-pre">{{ ensurePreview(template) }}</pre>
            </details>
        </div>
    </div>
</template>
