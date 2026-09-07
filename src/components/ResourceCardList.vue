<script setup lang="ts">
/**
 * Card grid shared by the Templates and Examples panels.
 *
 * Skill-shipped entries (`origin: 'skill'`) render read-only on a
 * muted background; principal uploads are editable. Principal
 * items are listed first, then a divider, then the skill-shipped
 * built-ins — the layout mirrors the directory partition in the
 * composable's principal/skill computeds.
 */
import { useResourceStore } from '../stores/resources'
import { useResourceCardList, type ResourceKind } from '../composables/useResourceCardList'

const props = defineProps<{
    kind: ResourceKind
    emptyText: string
    builtInHeadingText: string
}>()

const store = useResourceStore()
const {
    openNames,
    highlightedByName,
    loadingName,
    loadError,
    principalItems,
    skillItems,
    hasItems,
    formatBytes,
    onToggle,
    confirmAndDelete,
} = useResourceCardList(props.kind)
</script>

<template>
    <div class="space-y-4">
        <div
            v-if="store.loading && !hasItems"
            class="text-center text-muted-foreground py-6"
        >Loading…</div>
        <div
            v-else-if="!hasItems"
            class="text-center text-muted-foreground py-6"
        >{{ emptyText }}</div>
        <template v-else>
            <div
                v-if="principalItems.length > 0"
                class="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
                <article
                    v-for="item in principalItems"
                    :key="item.name"
                    :class="[
                        'rounded-lg border border-border bg-card p-4 space-y-2',
                        openNames.has(item.name) ? 'md:col-span-2' : '',
                    ]"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="font-mono text-sm text-foreground truncate">{{ item.name }}</div>
                            <div class="text-xs text-muted-foreground mt-0.5">
                                {{ formatBytes(item.size) }}
                                · <span class="text-muted-foreground/70">Your upload</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                            :disabled="store.uploading"
                            @click="confirmAndDelete(item.name)"
                        >Delete</button>
                    </div>
                    <details
                        class="text-xs"
                        @toggle="onToggle(item.name, $event)"
                    >
                        <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                        <div v-if="openNames.has(item.name)" class="mt-2">
                            <div
                                v-if="loadingName === item.name"
                                class="p-2 text-muted-foreground"
                            >Loading…</div>
                            <div
                                v-else-if="loadError !== null"
                                class="p-2 text-destructive"
                            >{{ loadError }}</div>
                            <pre
                                v-else-if="highlightedByName[item.name] !== undefined"
                                class="p-3 bg-muted rounded text-xs overflow-x-auto max-h-[32rem] overflow-y-auto"
                            ><code class="hljs language-typst" v-html="highlightedByName[item.name]"></code></pre>
                        </div>
                    </details>
                </article>
            </div>
            <div
                v-if="skillItems.length > 0"
                class="space-y-3"
            >
                <div
                    v-if="principalItems.length > 0"
                    class="flex items-center gap-3 pt-1"
                >
                    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ builtInHeadingText }}</span>
                    <span class="flex-1 border-t border-border" />
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <article
                        v-for="item in skillItems"
                        :key="item.name"
                        :class="[
                            'rounded-lg border border-border bg-muted/40 p-4 space-y-2',
                            openNames.has(item.name) ? 'md:col-span-2' : '',
                        ]"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="font-mono text-sm text-foreground truncate">{{ item.name }}</div>
                                <div class="text-xs text-muted-foreground mt-0.5">
                                    {{ formatBytes(item.size) }}
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
                            @toggle="onToggle(item.name, $event)"
                        >
                            <summary class="cursor-pointer text-primary hover:text-primary/80 select-none">View source</summary>
                            <div v-if="openNames.has(item.name)" class="mt-2">
                                <div
                                    v-if="loadingName === item.name"
                                    class="p-2 text-muted-foreground"
                                >Loading…</div>
                                <div
                                    v-else-if="loadError !== null"
                                    class="p-2 text-destructive"
                                >{{ loadError }}</div>
                                <pre
                                    v-else-if="highlightedByName[item.name] !== undefined"
                                    class="p-3 bg-background rounded text-xs overflow-x-auto max-h-[32rem] overflow-y-auto"
                                ><code class="hljs language-typst" v-html="highlightedByName[item.name]"></code></pre>
                            </div>
                        </details>
                    </article>
                </div>
            </div>
        </template>
    </div>
</template>
