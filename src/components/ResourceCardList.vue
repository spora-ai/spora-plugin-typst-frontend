<script lang="ts">
/**
 * Type-only block so the `edit` event payload can be imported
 * by parents (e.g. TypstPage.vue) without re-declaring the
 * shape. Vue's `<script setup>` strips non-macro exports at
 * runtime, so we keep this in a non-setup sibling block — both
 * blocks share the same module.
 */
import type { ResourceKind } from '../composables/useResourceCardList'

export interface EditEventPayload {
    name: string
    kind: ResourceKind
    content: string
}
</script>

<script setup lang="ts">
/**
 * Card grid shared by the Templates and Examples panels.
 *
 * Skill-shipped entries (`origin: 'skill'`) render read-only on a
 * muted background; principal uploads are editable. Principal
 * items are listed first, then a divider, then the skill-shipped
 * built-ins — the layout mirrors the directory partition in the
 * composable's principal/skill computeds.
 *
 * Three affordances live on each principal-tier card, mirroring
 * {@see FontList}:
 *   - "Copy" next to a `#import` / `#include` snippet so the
 *     operator can paste the reference straight into Typst.
 *   - "Edit" emits `edit` with `{ name, kind, content }`; the
 *     parent (TypstPage) opens the TextResourceEditModal.
 *   - For examples, "Render" calls the composable's `renderExample`
 *     (which decodes the `/preview` base64 payload into an inline
 *     thumbnail). Source is fetched first if the card hasn't been
 *     expanded yet — the render needs the bytes.
 */
import { ref } from 'vue'
import { useResourceStore } from '../stores/resources'
import { useResourceCardList } from '../composables/useResourceCardList'

const props = defineProps<{
    kind: ResourceKind
    emptyText: string
    builtInHeadingText: string
}>()

const emit = defineEmits<{
    (e: 'edit', payload: EditEventPayload): void
    (e: 'render-example', payload: { name: string }): void
    (e: 'open-in-editor', payload: { name: string; content: string; filename: string }): void
}>()

const store = useResourceStore()
const {
    openNames,
    sourceByName,
    highlightedByName,
    loadingName,
    loadError,
    principalItems,
    skillItems,
    hasItems,
    formatBytes,
    onToggle,
    ensureSource,
    confirmAndDelete,
    renderingName,
    renderError,
    renderedByName,
    renderExample,
} = useResourceCardList(props.kind)

function snippetFor(name: string): string {
    return props.kind === 'template'
        ? `#import "templates/${name}"`
        : `#include "examples/${name}"`
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Non-HTTPS contexts (e.g. local dev without TLS) block
        // `navigator.clipboard`. Fall back to a hidden textarea +
        // `execCommand('copy')` so the affordance still works.
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
            return document.execCommand('copy')
        } catch {
            return false
        } finally {
            textarea.remove()
        }
    }
}

const copiedName = ref<string | null>(null)
const copyError = ref<string | null>(null)

async function copySnippet(name: string): Promise<void> {
    copyError.value = null
    const ok = await copyToClipboard(snippetFor(name))
    if (ok) {
        copiedName.value = name
        setTimeout(() => {
            if (copiedName.value === name) copiedName.value = null
        }, 1500)
    } else {
        copyError.value = name
    }
}

function onEdit(name: string): void {
    // The modal needs the source bytes — fall back to an empty
    // string if the operator hasn't opened the card yet. The
    // parent can re-fetch via the composable's ensureSource()
    // before opening if it wants the real bytes.
    const content = sourceByName.value[name] ?? ''
    emit('edit', { name, kind: props.kind, content })
}

async function onRenderExample(name: string): Promise<void> {
    // The preview bridge needs the source bytes; ensure they're
    // loaded (the composable's cache short-circuits re-opens).
    if (sourceByName.value[name] === undefined) {
        await ensureSource(name)
    }
    const content = sourceByName.value[name]
    if (content === undefined) return
    emit('render-example', { name })
    await renderExample(name, content)
}

/**
 * Open the Editor tab with this example's source pre-filled. Used
 * for the "Open in Editor" affordance on example cards — the parent
 * (TypstPage) routes this through `useTabsStore().goToEditor()` so
 * the Editor can consume the prefill on its next mount.
 */
async function onOpenInEditor(name: string): Promise<void> {
    if (sourceByName.value[name] === undefined) {
        await ensureSource(name)
    }
    const content = sourceByName.value[name]
    if (content === undefined) return
    // Strip the `.typ` extension; the Editor's filename field is
    // a stem, not a full basename. The `-copy` suffix signals the
    // new origin so the operator doesn't accidentally overwrite
    // the original example on Save.
    const stem = name.replace(/\.typ$/, '')
    emit('open-in-editor', {
        name,
        content,
        filename: `${stem}-copy.typ`,
    })
}
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
                        <div class="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                class="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40"
                                :disabled="store.uploading"
                                @click="onEdit(item.name)"
                            >Edit</button>
                            <button
                                type="button"
                                class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                                :disabled="store.uploading"
                                @click="confirmAndDelete(item.name)"
                            >Delete</button>
                        </div>
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
                    <div class="flex items-center gap-2 pt-1">
                        <span class="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Use in Typst</span>
                        <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground truncate inline-block min-w-0 flex-1">{{ snippetFor(item.name) }}</code>
                        <button
                            type="button"
                            :class="[
                                'shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                copiedName === item.name
                                    ? 'bg-primary/10 text-primary'
                                    : copyError === item.name
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            ]"
                            :aria-label="`Copy Typst snippet for ${item.name}`"
                            @click="copySnippet(item.name)"
                        >{{ copiedName === item.name ? 'Copied' : 'Copy' }}</button>
                    </div>
                    <div
                        v-if="props.kind === 'example'"
                        class="flex items-center gap-2 pt-1"
                    >
                        <button
                            type="button"
                            class="rounded border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                            :disabled="renderingName === item.name"
                            @click="onRenderExample(item.name)"
                        >{{ renderingName === item.name ? 'Rendering…' : 'Render' }}</button>
                        <button
                            type="button"
                            class="rounded border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                            @click="onOpenInEditor(item.name)"
                        >Open in Editor</button>
                    </div>
                    <div
                        v-if="props.kind === 'example' && renderError !== null"
                        class="text-xs text-destructive"
                    >{{ renderError }}</div>
                    <div
                        v-if="props.kind === 'example' && renderedByName[item.name] !== undefined"
                        class="pt-2 border-t border-border"
                    >
                        <img
                            v-if="renderedByName[item.name].format === 'png' || renderedByName[item.name].format === 'svg'"
                            :src="renderedByName[item.name].blobUrl"
                            :alt="item.name"
                            class="max-h-32 mx-auto"
                        >
                        <a
                            v-else-if="renderedByName[item.name].format === 'pdf'"
                            :href="renderedByName[item.name].blobUrl"
                            target="_blank"
                            rel="noopener"
                            class="text-xs font-medium text-primary hover:text-primary/80"
                        >Open PDF</a>
                    </div>
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
                        <div class="flex items-center gap-2 pt-1">
                            <span class="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Use in Typst</span>
                            <code class="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground truncate inline-block min-w-0 flex-1">{{ snippetFor(item.name) }}</code>
                            <button
                                type="button"
                                :class="[
                                    'shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                    copiedName === item.name
                                        ? 'bg-primary/10 text-primary'
                                        : copyError === item.name
                                            ? 'bg-destructive/10 text-destructive'
                                            : 'text-muted-foreground hover:bg-background hover:text-foreground',
                                ]"
                                :aria-label="`Copy Typst snippet for ${item.name}`"
                                @click="copySnippet(item.name)"
                            >{{ copiedName === item.name ? 'Copied' : 'Copy' }}</button>
                        </div>
                        <div
                            v-if="props.kind === 'example'"
                            class="flex items-center gap-2 pt-1"
                        >
                            <button
                                type="button"
                                class="rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                                :disabled="renderingName === item.name"
                                @click="onRenderExample(item.name)"
                            >{{ renderingName === item.name ? 'Rendering…' : 'Render' }}</button>
                            <button
                                type="button"
                                class="rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                                @click="onOpenInEditor(item.name)"
                            >Open in Editor</button>
                        </div>
                        <div
                            v-if="props.kind === 'example' && renderError !== null"
                            class="text-xs text-destructive"
                        >{{ renderError }}</div>
                        <div
                            v-if="props.kind === 'example' && renderedByName[item.name] !== undefined"
                            class="pt-2 border-t border-border"
                        >
                            <img
                                v-if="renderedByName[item.name].format === 'png' || renderedByName[item.name].format === 'svg'"
                                :src="renderedByName[item.name].blobUrl"
                                :alt="item.name"
                                class="max-h-32 mx-auto"
                            >
                            <a
                                v-else-if="renderedByName[item.name].format === 'pdf'"
                                :href="renderedByName[item.name].blobUrl"
                                target="_blank"
                                rel="noopener"
                                class="text-xs font-medium text-primary hover:text-primary/80"
                            >Open PDF</a>
                        </div>
                    </article>
                </div>
            </div>
        </template>
    </div>
</template>
