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
 * The image picker pulls from two sources:
 *   - **Plugin images** (`/api/v1/typst/images/{name}`) — the
 *     principal's filesystem-backed library
 *   - **Media archive** (`/api/v1/assets/{uuid}.{ext}`) — images
 *     uploaded by any plugin/agent
 * Picking either inserts the right `#image("…")` URL at the cursor.
 *
 * Files (the "Open" picker + Save):
 *   The source lives in `media_assets` rows tagged
 *   `tool_name='typst.playground'`, `mime_type='text/x-typst'`,
 *   `filename=<user-chosen>`. The compile endpoint upserts the
 *   parent row by `(principal_id, tool_name, filename)`, so a
 *   second compile of the same name overwrites the parent in
 *   place — the `source_id` is stable for the lifetime of the
 *   file. "Save" persists source edits without re-rendering and
 *   strips stale derivatives so the next render is fresh.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '../api/client'
import { compileTypst, imageSnippet } from '../api/compile'
import { listImages } from '../api/images'
import { listMediaArchiveImages } from '../api/media-archive'
import { highlightTypst } from 'highlightjs-typst/highlight'
import { usePrincipalsStore } from '../stores/principals'
import { useSourcesStore } from '../stores/sources'
import type { CompileResult, ImageResource, MediaArchiveImage, PlaygroundSourceSummary } from '../types'

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
// canonical URL is /api/v1/typst/images/<basename>.<ext>.
// Drop one in here after uploading:
// #image("/api/v1/typst/images/REPLACE-WITH-NAME.png", width: 80%)

// Or reference a media-archive image (cross-plugin). The
// /api/v1/assets/<uuid>.<ext> URL is what #image() consumes:
// #image("/api/v1/assets/REPLACE-WITH-UUID.png", width: 80%)
`

const STARTER_NAME = 'playground.typ'

const source = ref(STARTER)
const filename = ref(STARTER_NAME)
const currentSourceId = ref<string | null>(null)
const currentSourceIsDirty = ref(false)
const format = ref<'pdf' | 'png' | 'svg'>('pdf')
const busy = ref(false)
const result = ref<CompileResult | null>(null)
const error = ref<string | null>(null)
const diagnostics = ref<string[] | null>(null)

const principalsStore = usePrincipalsStore()
const sourcesStore = useSourcesStore()

// Image picker state
const pickerOpen = ref(false)
const pickerTab = ref<'plugin' | 'media'>('plugin')
const pickerLoading = ref(false)
const pluginImages = ref<ImageResource[]>([])
const mediaImages = ref<MediaArchiveImage[]>([])
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const highlightRef = ref<HTMLPreElement | null>(null)

/**
 * Typst source, syntax-highlighted for the editor overlay. The
 * editor is a transparent `<textarea>` stacked on top of a
 * `<pre>` containing this HTML; both share font + padding +
 * line-height so the highlighted glyphs line up under the
 * caret. hljs escapes its output, so `v-html` is XSS-safe.
 *
 * Trailing newline: hljs strips a final newline, which makes
 * the last line shorter than the textarea's last line. We
 * always append `\n` so the caret on an empty last line still
 * lines up.
 */
const highlightedSource = computed(() => highlightTypst(source.value) + '\n')

// Open picker (existing files)
const openPickerOpen = ref(false)

async function loadPickerImages(): Promise<void> {
    pickerLoading.value = true
    try {
        const principalId = principalsStore.selectedPrincipalId ?? undefined
        const [plugin, media] = await Promise.all([
            listImages(principalId).catch(() => []),
            listMediaArchiveImages(principalId).catch(() => []),
        ])
        pluginImages.value = plugin
        mediaImages.value = media
    } finally {
        pickerLoading.value = false
    }
}

async function openImagePicker(): Promise<void> {
    pickerOpen.value = !pickerOpen.value
    openPickerOpen.value = false
    if (pickerOpen.value) {
        await loadPickerImages()
    }
}

function closeImagePicker(): void {
    pickerOpen.value = false
}

function insertAtCursor(snippet: string): void {
    const ta = textareaRef.value
    if (!ta) {
        // Fallback: append to end
        source.value = source.value + '\n' + snippet + '\n'
        return
    }
    const start = ta.selectionStart ?? source.value.length
    const end = ta.selectionEnd ?? source.value.length
    source.value = source.value.slice(0, start) + snippet + source.value.slice(end)
    // Restore caret just after the inserted text
    requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(start + snippet.length, start + snippet.length)
    })
}

/**
 * Mirror the textarea's scroll position onto the highlighted
 * `<pre>` so they stay in lockstep. Both elements share the
 * same width and the `<pre>` is `pointer-events: none` so it
 * only scrolls via this handler.
 */
function onEditorScroll(): void {
    const ta = textareaRef.value
    const pre = highlightRef.value
    if (ta === null || pre === null) return
    pre.scrollTop = ta.scrollTop
    pre.scrollLeft = ta.scrollLeft
}

function pickPluginImage(img: ImageResource): void {
    insertAtCursor(`#image("${img.url}", width: 80%)\n`)
    closeImagePicker()
}

function pickMediaImage(img: MediaArchiveImage): void {
    insertAtCursor(`#image("${img.asset_url}", width: 80%)\n`)
    closeImagePicker()
}

async function toggleOpenPicker(): Promise<void> {
    if (openPickerOpen.value) {
        openPickerOpen.value = false
        return
    }
    openPickerOpen.value = true
    pickerOpen.value = false
    if (sourcesStore.sources.length === 0) {
        await sourcesStore.loadSources()
    }
}

function closeOpenPicker(): void {
    openPickerOpen.value = false
}

async function pickExistingSource(summary: PlaygroundSourceSummary): Promise<void> {
    const source_ = await sourcesStore.openSource(summary.id)
    if (source_ === null) {
        error.value = sourcesStore.error ?? 'Failed to open source.'
        closeOpenPicker()
        return
    }
    source.value = source_.content
    filename.value = source_.filename
    currentSourceId.value = source_.id
    currentSourceIsDirty.value = false
    result.value = null
    error.value = null
    diagnostics.value = null
    closeOpenPicker()
}

function startNewSource(): void {
    source.value = STARTER
    filename.value = STARTER_NAME
    currentSourceId.value = null
    currentSourceIsDirty.value = false
    result.value = null
    error.value = null
    diagnostics.value = null
}

async function saveCurrent(): Promise<void> {
    if (currentSourceId.value === null) {
        // No open file — "Save" is a no-op without a compile. Tell
        // the user; they can rename + render to create the row.
        error.value = 'No file is open. Use Render to create a new file, or Open to edit an existing one.'
        return
    }
    const saved = await sourcesStore.saveSource(currentSourceId.value, source.value)
    if (saved !== null) {
        currentSourceIsDirty.value = false
        // Stale derivatives for this source were just deleted server-side;
        // drop the local result so the next render starts from a known state.
        result.value = null
    } else {
        error.value = sourcesStore.error ?? 'Failed to save.'
    }
}

async function deleteCurrent(): Promise<void> {
    if (currentSourceId.value === null) return
    const confirmed = window.confirm(`Delete "${filename.value}" from the media archive? This cannot be undone.`)
    if (!confirmed) return
    try {
        await sourcesStore.removeSource(currentSourceId.value)
    } catch {
        error.value = sourcesStore.error ?? 'Failed to delete.'
        return
    }
    startNewSource()
}

async function render(): Promise<void> {
    busy.value = true
    error.value = null
    diagnostics.value = null
    result.value = null
    try {
        const compiled = await compileTypst({
            source: source.value,
            name: filename.value,
            format: format.value,
        })
        result.value = compiled
        currentSourceId.value = compiled.source_id
        currentSourceIsDirty.value = false
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

const hasOpenFile = computed(() => currentSourceId.value !== null)

// Track in-editor edits so the Save button reflects "dirty" state.
watch(source, () => {
    if (currentSourceId.value !== null) {
        currentSourceIsDirty.value = true
    }
})
// Filename change also marks dirty: if the user renames a file
// without compiling, the local source_id still points at the old
// name and the save would overwrite the wrong row.
watch(filename, () => {
    if (currentSourceId.value !== null) {
        currentSourceIsDirty.value = true
    }
})

onMounted(() => {
    // Eagerly fetch the image picker so the first click is snappy.
    // The picker only opens on user click; this is just a prefetch.
    loadPickerImages().catch(() => { /* ignored — picker re-fetches on open */ })
    // Eagerly fetch the open-picker too so the dropdown has content
    // even on the first click. Filename-based "Open" is the new flow.
    sourcesStore.loadSources().catch(() => { /* ignored — picker re-fetches on open */ })
})
</script>

<template>
    <div class="space-y-4">
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
                <label for="typst-filename" class="block text-sm font-medium text-foreground">Filename</label>
                <span class="text-xs text-muted-foreground">
                    Compiled by <code class="font-mono">POST /api/v1/typst/compile</code>
                </span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <input
                    id="typst-filename"
                    v-model="filename"
                    type="text"
                    placeholder="playground.typ"
                    class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                    spellcheck="false"
                    autocomplete="off"
                />
                <div class="relative">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="sourcesStore.loading"
                        @click="toggleOpenPicker"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        </svg>
                        Open
                        <span class="text-xs text-muted-foreground">({{ sourcesStore.sources.length }})</span>
                    </button>
                    <div
                        v-if="openPickerOpen"
                        class="absolute right-0 z-10 mt-1 w-72 rounded-md border border-border bg-card shadow-lg max-h-64 overflow-y-auto"
                    >
                        <div
                            v-if="sourcesStore.loading"
                            class="px-3 py-2 text-xs text-muted-foreground"
                        >Loading…</div>
                        <div
                            v-else-if="sourcesStore.sources.length === 0"
                            class="px-3 py-2 text-xs text-muted-foreground"
                        >No saved playground files yet. Render once to create one.</div>
                        <button
                            v-for="s in sourcesStore.sources"
                            :key="s.id"
                            type="button"
                            class="block w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-b-0"
                            @click="pickExistingSource(s)"
                        >
                            <div class="font-mono truncate">{{ s.filename }}</div>
                            <div class="text-[10px] text-muted-foreground tabular-nums">
                                {{ s.byte_size }} bytes
                                <span v-if="s.updated_at"> · updated {{ s.updated_at }}</span>
                            </div>
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted"
                    @click="startNewSource"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    New
                </button>
                <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                    :disabled="!hasOpenFile || sourcesStore.saving"
                    :title="hasOpenFile ? 'Persist source edits without re-rendering' : 'Open an existing file to save'"
                    @click="saveCurrent"
                >
                    {{ sourcesStore.saving ? 'Saving…' : 'Save' }}
                    <span v-if="hasOpenFile && currentSourceIsDirty" class="text-primary">●</span>
                </button>
                <button
                    v-if="hasOpenFile"
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/10"
                    @click="deleteCurrent"
                >
                    Delete
                </button>
            </div>
            <div v-if="hasOpenFile" class="text-[10px] text-muted-foreground font-mono truncate">
                id: {{ currentSourceId }}
            </div>

            <label for="typst-source" class="block text-sm font-medium text-foreground pt-2">Typst source</label>
            <div class="typst-editor rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <pre
                    ref="highlightRef"
                    class="typst-editor__highlight"
                    aria-hidden="true"
                ><code class="hljs language-typst" v-html="highlightedSource"></code></pre>
                <textarea
                    id="typst-source"
                    ref="textareaRef"
                    v-model="source"
                    rows="18"
                    class="typst-editor__textarea"
                    spellcheck="false"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    @scroll="onEditorScroll"
                ></textarea>
            </div>
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
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="busy"
                        @click="openImagePicker"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Insert image
                    </button>
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
            <div v-if="pickerOpen" class="rounded-md border border-border bg-background p-3 space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex gap-1">
                        <button
                            type="button"
                            :class="[
                                'px-3 py-1 text-xs rounded-md transition-colors',
                                pickerTab === 'plugin'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground',
                            ]"
                            @click="pickerTab = 'plugin'"
                        >Plugin images ({{ pluginImages.length }})</button>
                        <button
                            type="button"
                            :class="[
                                'px-3 py-1 text-xs rounded-md transition-colors',
                                pickerTab === 'media'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground',
                            ]"
                            @click="pickerTab = 'media'"
                        >Media archive ({{ mediaImages.length }})</button>
                    </div>
                    <button
                        type="button"
                        class="text-xs text-muted-foreground hover:text-foreground"
                        @click="closeImagePicker"
                    >Close</button>
                </div>
                <div v-if="pickerLoading" class="text-xs text-muted-foreground py-3 text-center">Loading…</div>
                <div v-else-if="pickerTab === 'plugin' && pluginImages.length === 0" class="text-xs text-muted-foreground py-3 text-center">
                    No plugin images. Upload some via the Images tab first.
                </div>
                <div v-else-if="pickerTab === 'media' && mediaImages.length === 0" class="text-xs text-muted-foreground py-3 text-center">
                    No media-archive images visible to the current principal.
                </div>
                <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                    <button
                        v-for="img in (pickerTab === 'plugin' ? pluginImages : mediaImages)"
                        :key="(img as ImageResource).name ?? (img as MediaArchiveImage).id"
                        type="button"
                        class="border border-border rounded-md overflow-hidden bg-card hover:border-primary transition-colors text-left"
                        @click="pickerTab === 'plugin'
                            ? pickPluginImage(img as ImageResource)
                            : pickMediaImage(img as MediaArchiveImage)"
                    >
                        <div class="aspect-square bg-muted flex items-center justify-center">
                            <img
                                :src="pickerTab === 'plugin' ? (img as ImageResource).url : (img as MediaArchiveImage).asset_url"
                                :alt="(img as ImageResource).name ?? (img as MediaArchiveImage).filename"
                                class="max-w-full max-h-full object-contain"
                                loading="lazy"
                            />
                        </div>
                        <div class="p-1.5 text-[10px] font-mono truncate" :title="(img as ImageResource).name ?? (img as MediaArchiveImage).filename">
                            {{ (img as ImageResource).name ?? (img as MediaArchiveImage).filename }}
                        </div>
                    </button>
                </div>
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
