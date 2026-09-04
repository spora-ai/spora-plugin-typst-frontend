<script setup lang="ts">
/**
 * Table view of the principal's font library.
 *
 * Two-section partition mirrors {@see TemplateList} / {@see ExampleList}:
 * the operator's uploads (`origin: 'principal'`) sit on top with a
 * default card background; the plugin-shipped built-ins (`origin: 'skill'`)
 * follow a "Built-in" divider row on a muted background. Skill-shipped
 * fonts render the delete affordance as "Built-in" text instead of a
 * destructive button — the API would 422 them anyway, but greying the
 * affordance saves the operator a round-trip.
 *
 * The "Use in Typst" column shows how to wire the font into a Typst
 * document. The plugin's font_dirs covers both tiers, so the operator
 * references the font by its basename (no extension, no path):
 *
 *   #set text(font: "DMSerifDisplay-Regular")
 *
 * Bundled fonts accept the family name too (e.g. `font: "Inter"`), but
 * the basename works for every upload regardless of the font's metadata
 * `name` table — keeping a single hint format across both tiers.
 *
 * The copy button uses {@see copyToClipboard} (with the textarea
 * fallback for non-HTTPS contexts where `navigator.clipboard` is
 * blocked). The button briefly flips to "Copied!" on success.
 */
import { computed, onMounted, ref } from 'vue'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

// Drop the file extension so the hint matches Typst's `font: "<basename>"`
// syntax — the font_dirs already include the directory, so the operator
// just references the stem.
function fontReference(name: string): string {
    return name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '')
}

function fontSnippet(reference: string): string {
    return `#set text(font: "${reference}")`
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
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

async function copySnippet(name: string, reference: string): Promise<void> {
    copyError.value = null
    const ok = await copyToClipboard(fontSnippet(reference))
    if (ok) {
        copiedName.value = name
        setTimeout(() => {
            if (copiedName.value === name) copiedName.value = null
        }, 1500)
    } else {
        copyError.value = name
    }
}

// Two-section partition so the operator's uploads always sit ABOVE the
// built-ins. Both lists are stable-sorted by basename so the order
// doesn't jitter on reload.
const principalFonts = computed(() =>
    (store.fonts ?? [])
        .filter((f) => f.origin === 'principal')
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
)
const skillFonts = computed(() =>
    (store.fonts ?? [])
        .filter((f) => f.origin === 'skill')
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
)

const hasFonts = computed(() => (store.fonts ?? []).length > 0)
const hasBothSections = computed(
    () => principalFonts.value.length > 0 && skillFonts.value.length > 0,
)

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete font "${name}"? This cannot be undone.`)) return
    try {
        await store.removeFont(name)
    } catch {
        // store.error already populated
    }
}

onMounted(() => {
    if ((store.fonts ?? []).length === 0) store.loadFonts()
})
</script>

<template>
    <div class="rounded-lg border border-border overflow-hidden">
        <table class="min-w-full divide-y divide-border text-sm">
            <thead class="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                    <th scope="col" class="px-4 py-2">Name</th>
                    <th scope="col" class="px-4 py-2">Origin</th>
                    <th scope="col" class="px-4 py-2">Use in Typst</th>
                    <th scope="col" class="px-4 py-2 text-right">Size</th>
                    <th scope="col" class="px-4 py-2 text-right">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-border">
                <tr v-if="store.loading && !hasFonts">
                    <td colspan="5" class="px-4 py-6 text-center text-muted-foreground bg-card">Loading…</td>
                </tr>
                <tr v-else-if="!hasFonts">
                    <td colspan="5" class="px-4 py-6 text-center text-muted-foreground bg-card">
                        No fonts uploaded yet. Drop a .ttf / .otf / .woff / .woff2 file above.
                    </td>
                </tr>
                <template v-else>
                    <tr
                        v-for="font in principalFonts"
                        :key="font.name"
                        class="bg-card"
                    >
                        <td class="px-4 py-2 font-mono text-foreground">{{ font.name }}</td>
                        <td class="px-4 py-2">
                            <span
                                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground"
                            >Principal</span>
                        </td>
                        <td class="px-4 py-2">
                            <div class="flex items-center gap-2">
                                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground truncate max-w-[16rem] inline-block">{{ fontSnippet(fontReference(font.name)) }}</code>
                                <button
                                    type="button"
                                    :class="[
                                        'shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                        copiedName === font.name
                                            ? 'bg-primary/10 text-primary'
                                            : copyError === font.name
                                                ? 'bg-destructive/10 text-destructive'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    ]"
                                    :aria-label="`Copy Typst snippet for ${font.name}`"
                                    @click="copySnippet(font.name, fontReference(font.name))"
                                >{{ copiedName === font.name ? 'Copied' : 'Copy' }}</button>
                            </div>
                        </td>
                        <td class="px-4 py-2 text-right tabular-nums text-foreground">{{ formatBytes(font.size) }}</td>
                        <td class="px-4 py-2 text-right">
                            <button
                                type="button"
                                class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                                :disabled="store.uploading"
                                @click="confirmAndDelete(font.name)"
                            >Delete</button>
                        </td>
                    </tr>
                    <tr v-if="hasBothSections">
                        <td colspan="5" class="bg-card px-4 py-2">
                            <div class="flex items-center gap-3">
                                <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    Built-in
                                </span>
                                <span class="flex-1 border-t border-border" />
                            </div>
                        </td>
                    </tr>
                    <tr
                        v-for="font in skillFonts"
                        :key="font.name"
                        class="bg-muted/40"
                    >
                        <td class="px-4 py-2 font-mono text-foreground">{{ font.name }}</td>
                        <td class="px-4 py-2">
                            <span
                                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-accent text-accent-foreground"
                            >Skill-shipped</span>
                        </td>
                        <td class="px-4 py-2">
                            <div class="flex items-center gap-2">
                                <code class="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground truncate max-w-[16rem] inline-block">{{ fontSnippet(fontReference(font.name)) }}</code>
                                <button
                                    type="button"
                                    :class="[
                                        'shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                        copiedName === font.name
                                            ? 'bg-primary/10 text-primary'
                                            : copyError === font.name
                                                ? 'bg-destructive/10 text-destructive'
                                                : 'text-muted-foreground hover:bg-background hover:text-foreground',
                                    ]"
                                    :aria-label="`Copy Typst snippet for ${font.name}`"
                                    @click="copySnippet(font.name, fontReference(font.name))"
                                >{{ copiedName === font.name ? 'Copied' : 'Copy' }}</button>
                            </div>
                        </td>
                        <td class="px-4 py-2 text-right tabular-nums text-foreground">{{ formatBytes(font.size) }}</td>
                        <td class="px-4 py-2 text-right text-xs text-muted-foreground">Built-in</td>
                    </tr>
                </template>
            </tbody>
        </table>
    </div>
</template>
