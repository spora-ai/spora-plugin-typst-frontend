<script setup lang="ts">
/**
 * Playground: paste Typst source, click Render, see the result.
 *
 * Backend path: `POST /api/v1/typst/compile` (TypstCompileController
 * in the plugin) — same producer / derivative pipeline the agent's
 * `typst_render` tool uses, but called directly from the SPA for a
 * synchronous operator-facing render.
 *
 * Render targets:
 *   - PDF  → `<iframe>` of the asset_url, with a first-page PNG
 *            preview alongside (the controller returns `preview_url`
 *            in the same response so we don't pay a second round-trip).
 *   - PNG  → `<img>` of the asset_url.
 *   - SVG  → `<img>` of the asset_url.
 *
 * The result panel also exposes the canonical asset_url (the
 * `/api/v1/assets/<uuid>.<ext>` form) with a copy button. For PNG
 * outputs there's a second button that copies a `#image()` snippet
 * so the operator can drop the result straight back into Typst
 * source.
 *
 * The placeholder source ships with a commented `#image("/api/v1/...")`
 * line so the URL convention is visible on first open — the
 * canonical asset URL is the same shape the playground returns.
 */
import { ref } from 'vue'
import { ApiError } from '../api/client'
import { compileTypst, imageSnippet } from '../api/compile'
import type { CompileResult } from '../types'

defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const STARTER = `= Hello, Typst!

#let name = "World"
This is rendered by ext-typst #v(0.5em) via the plugin.

== Section

- bullet 1
- bullet 2
- bullet 3

#table(
  columns: 3,
  [a], [b], [c],
  [1], [2], [3],
)

// Reference an image you uploaded via the Images tab — the
// canonical URL is /api/v1/assets/<uuid>.<ext>. Drop one in here
// after uploading:
// #image("/api/v1/assets/REPLACE-WITH-UUID.png", width: 80%)
`

const source = ref(STARTER)
const format = ref<'pdf' | 'png' | 'svg'>('pdf')
const busy = ref(false)
const result = ref<CompileResult | null>(null)
const error = ref<string | null>(null)
const diagnostics = ref<string[] | null>(null)

async function render(): Promise<void> {
    busy.value = true
    error.value = null
    diagnostics.value = null
    result.value = null
    try {
        result.value = await compileTypst({ source: source.value, format: format.value })
    } catch (e) {
        if (e instanceof ApiError && e.code === 'COMPILATION_FAILED') {
            const parsed = parseDiagnostics(e.message)
            error.value = 'Compilation failed — see diagnostics below.'
            diagnostics.value = parsed
        } else {
            error.value = e instanceof Error ? e.message : 'Render failed.'
        }
    } finally {
        busy.value = false
    }
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // Fallback path mirrors ImageList's approach.
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

async function copyImageSnippet(): Promise<void> {
    if (!result.value || result.value.format !== 'png') return
    await copyToClipboard(imageSnippet(result.value.asset_url))
}

async function copyAssetUrl(): Promise<void> {
    if (!result.value) return
    await copyToClipboard(result.value.asset_url)
}

/**
 * Parse the controller's COMPILATION_FAILED message. The envelope is
 * `{ error: { code, message, diagnostics: [{ message }] } }`. The
 * client surfaces only `error.message`, so the structured diagnostics
 * come back as a JSON blob inside it — parse it back out so the UI
 * can render the same list the controller returns.
 */
function parseDiagnostics(message: string): string[] {
    try {
        const obj = JSON.parse(message) as { diagnostics?: Array<{ message?: string }> }
        if (Array.isArray(obj.diagnostics)) {
            return obj.diagnostics.map((d) => d.message ?? '').filter((s) => s !== '')
        }
    } catch {
        // not JSON — fall through
    }
    return [message]
}

function isPngOutput(r: CompileResult | null): boolean {
    return r?.format === 'png'
}
</script>

<template>
    <div class="space-y-4">
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
            <div class="flex items-baseline justify-between">
                <label for="typst-source" class="block text-sm font-medium text-foreground">Typst source</label>
                <span class="text-xs text-muted-foreground">
                    Compiled by <code class="font-mono">POST /api/v1/typst/compile</code>
                </span>
            </div>
            <textarea
                id="typst-source"
                v-model="source"
                rows="14"
                class="w-full font-mono text-xs leading-snug p-3 rounded-md border border-input bg-background text-foreground focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                spellcheck="false"
                autocomplete="off"
            ></textarea>
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <fieldset class="flex items-center gap-3 text-sm">
                    <legend class="sr-only">Format</legend>
                    <label
                        v-for="opt in (['pdf', 'png', 'svg'] as const)"
                        :key="opt"
                        class="inline-flex items-center gap-1.5"
                    >
                        <input
                            type="radio"
                            :value="opt"
                            v-model="format"
                            class="text-primary focus:ring-ring"
                        />
                        <span class="uppercase text-xs font-medium">{{ opt }}</span>
                    </label>
                </fieldset>
                <button
                    type="button"
                    class="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    :disabled="busy"
                    @click="render"
                >
                    {{ busy ? 'Rendering…' : 'Render' }}
                </button>
            </div>
        </div>

        <div
            v-if="error"
            class="rounded-md px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/30"
        >
            <div class="font-medium">{{ error }}</div>
            <ul v-if="diagnostics && diagnostics.length > 0" class="mt-2 list-disc list-inside space-y-1 font-mono text-xs">
                <li v-for="(line, idx) in diagnostics" :key="idx">{{ line }}</li>
            </ul>
        </div>

        <div v-if="result" class="rounded-lg border border-border bg-card p-4 space-y-3">
            <div class="text-sm text-foreground">
                Rendered <code class="font-mono">{{ result.format }}</code>
                · <span class="tabular-nums">{{ result.size }}</span> bytes
                <span v-if="result.width && result.height">
                    · {{ result.width }}×{{ result.height }}px
                </span>
            </div>
            <div class="text-xs text-muted-foreground truncate flex items-center gap-3 flex-wrap">
                <a
                    :href="result.asset_url"
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:text-primary/80 underline font-mono"
                >{{ result.asset_url }}</a>
                <button
                    type="button"
                    class="text-xs font-medium text-muted-foreground hover:text-foreground"
                    @click="copyAssetUrl"
                >Copy URL</button>
                <button
                    v-if="isPngOutput(result)"
                    type="button"
                    class="text-xs font-medium text-primary hover:text-primary/80"
                    @click="copyImageSnippet"
                >Copy as <code class="font-mono">#image()</code></button>
            </div>
            <div v-if="result.format === 'pdf'" class="space-y-3">
                <div class="bg-muted rounded p-2">
                    <iframe
                        :src="result.asset_url"
                        title="Typst PDF render"
                        class="w-full h-96 border border-border rounded"
                    />
                </div>
                <div v-if="result.preview_url" class="bg-muted rounded p-2">
                    <p class="text-xs text-muted-foreground mb-1">First-page preview (PNG)</p>
                    <img :src="result.preview_url" :alt="`Typst render ${result.format} preview`" class="max-w-full h-auto mx-auto" />
                </div>
            </div>
            <div v-else-if="result.mime.startsWith('image/')">
                <img :src="result.asset_url" :alt="`Typst render ${result.format}`" class="max-w-full h-auto mx-auto" />
            </div>
        </div>
    </div>
</template>
