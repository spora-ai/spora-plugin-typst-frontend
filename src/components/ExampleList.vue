<script setup lang="ts">
/**
 * Card view of the principal's example pattern library.
 *
 * Mirrors {@see TemplateList}: skill-shipped entries are read-only;
 * `<details>` is browser-native and Vue mirrors the open set into a
 * `Set<string>` so we get the `md:col-span-2` styling without
 * driving `:open` (which would ping-pong with `@toggle`).
 */
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { getExample } from '../api/examples'
import { highlightTypst } from 'highlightjs-typst/highlight'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()
const openNames = ref<Set<string>>(new Set())
const sourceByName = ref<Record<string, string>>({})
const highlightedByName = ref<Record<string, string>>({})
const loadingName = ref<string | null>(null)
const loadError = ref<string | null>(null)

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / (1024 * 1024)).toFixed(2)} MiB`
}

const principalExamples = computed(() =>
    (store.examples ?? [])
        .filter((e) => e.origin === 'principal')
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
)
const skillExamples = computed(() =>
    (store.examples ?? [])
        .filter((e) => e.origin === 'skill')
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
)

function onToggle(name: string, event: Event): void {
    const target = event.target as HTMLDetailsElement
    const wasOpen = openNames.value.has(name)
    const next = new Set(openNames.value)
    if (target.open) next.add(name)
    else next.delete(name)
    openNames.value = next
    if (target.open && !wasOpen) {
        // First expand only — re-opens skip the fetch because
        // `sourceByName` is cached.
        void ensureSource(name)
    }
}

async function ensureSource(name: string): Promise<void> {
    if (sourceByName.value[name] !== undefined) return
    loadingName.value = name
    loadError.value = null
    try {
        const source = await getExample(name)
        sourceByName.value = { ...sourceByName.value, [name]: source }
        highlightedByName.value = {
            ...highlightedByName.value,
            [name]: highlightTypst(source),
        }
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
        const nextSource = { ...sourceByName.value }
        delete nextSource[name]
        sourceByName.value = nextSource
        const nextHighlighted = { ...highlightedByName.value }
        delete nextHighlighted[name]
        highlightedByName.value = nextHighlighted
        if (openNames.value.has(name)) {
            const nextOpen = new Set(openNames.value)
            nextOpen.delete(name)
            openNames.value = nextOpen
        }
    } catch {
        // store.error already populated
    }
}

const hasExamples = computed(() => (store.examples ?? []).length > 0)

onMounted(() => {
    if ((store.examples ?? []).length === 0) store.loadExamples()
})
</script>

<template>
    <div class="space-y-4">
        <div
            v-if="store.loading && !hasExamples"
            class="text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="!hasExamples"
            class="text-center text-muted-foreground py-6"
        >No example patterns yet.</div>
        <template v-else>
            <div
                v-if="principalExamples.length > 0"
                class="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
                <div
                    v-for="example in principalExamples"
                    :key="example.name"
                    :class="[
                        'rounded-lg border border-border bg-card p-4 space-y-2',
                        openNames.has(example.name) ? 'md:col-span-2' : '',
                    ]"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="font-mono text-sm text-foreground truncate">{{ example.name }}</div>
                            <div class="text-xs text-muted-foreground mt-0.5">
                                {{ formatBytes(example.size) }}
                                · <span class="text-muted-foreground/70">Your upload</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                            :disabled="store.uploading"
                            @click="confirmAndDelete(example.name)"
                        >Delete</button>
                    </div>
                    <details
                        class="text-xs"
                        @toggle="onToggle(example.name, $event)"
                    >
                        <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                        <div v-if="openNames.has(example.name)" class="mt-2">
                            <div
                                v-if="loadingName === example.name"
                                class="p-2 text-muted-foreground"
                            >Loading…</div>
                            <div
                                v-else-if="loadError !== null"
                                class="p-2 text-destructive"
                            >{{ loadError }}</div>
                            <pre
                                v-else-if="highlightedByName[example.name] !== undefined"
                                class="p-3 bg-muted rounded text-xs overflow-x-auto max-h-[32rem] overflow-y-auto"
                            ><code class="hljs language-typst" v-html="highlightedByName[example.name]"></code></pre>
                        </div>
                    </details>
                </div>
            </div>
            <div
                v-if="skillExamples.length > 0"
                class="space-y-3"
            >
                <div
                    v-if="principalExamples.length > 0"
                    class="flex items-center gap-3 pt-1"
                >
                    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Built-in</span>
                    <span class="flex-1 border-t border-border" />
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
<div
                            v-for="example in skillExamples"
                            :key="example.name"
                            :class="[
                                'rounded-lg border border-border bg-muted/40 p-4 space-y-2',
                                openNames.has(example.name) ? 'md:col-span-2' : '',
                            ]"
                        >
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="font-mono text-sm text-foreground truncate">{{ example.name }}</div>
                                <div class="text-xs text-muted-foreground mt-0.5">
                                    {{ formatBytes(example.size) }}
                                    · <span class="inline-flex items-center gap-1 text-muted-foreground/70">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        Built-in
                                    </span>
                                </div>
                            </div>
                            <span class="text-xs text-muted-foreground/70">Read-only</span>
                        </div>
                        <details
                            class="text-xs"
                            @toggle="onToggle(example.name, $event)"
                        >
                            <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                            <div v-if="openNames.has(example.name)" class="mt-2">
                                <div
                                    v-if="loadingName === example.name"
                                    class="p-2 text-muted-foreground"
                                >Loading…</div>
                                <div
                                    v-else-if="loadError !== null"
                                    class="p-2 text-destructive"
                                >{{ loadError }}</div>
                                <pre
                                    v-else-if="highlightedByName[example.name] !== undefined"
                                    class="p-3 bg-background rounded text-xs overflow-x-auto max-h-[32rem] overflow-y-auto"
                                ><code class="hljs language-typst" v-html="highlightedByName[example.name]"></code></pre>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
