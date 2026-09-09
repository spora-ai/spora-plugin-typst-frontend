<script setup lang="ts">
/**
 * Editor: paste Typst source, click Render, see the result. No DB
 * writes on render — every render is ephemeral so iterating on a
 * document doesn't fill the media archive with parent rows.
 *
 * Backend path: `POST /api/v1/typst/preview` (TypstPreviewController
 * in the plugin) — same compile + render pipeline the agent's
 * `typst_compile` tool uses, but called from the SPA for a
 * synchronous operator-facing render. The preview returns base64
 * bytes inline; we decode them to a Blob URL for the result panel.
 *
 * Render targets:
 *   - PDF  → <iframe> of the Blob URL
 *   - PNG  → <img> of the Blob URL (with PPI selector — only the
 *            PNG format has raster density)
 *   - SVG  → <img> of the Blob URL
 *
 * The Editor is source-only — Save persists the source as a
 * `media_assets` row tagged `tool_name='typst.playground'`, but it
 * never creates a derivative. The LLM tool's `typst_compile` still
 * uses `/compile` for production renders that need a persistent
 * output row.
 *
 * Pickers:
 *   - **Image picker** — inserts `#image("…")` at the cursor from
 *     the plugin's image library or the media archive.
 *   - **Template picker** — inserts `#import "templates/X.typ"` at
 *     the cursor. Closes the loop on the file-not-found diagnostic
 *     hint: operators no longer have to type the `templates/`
 *     prefix manually.
 *
 * Cross-tab prefill:
 *   The Examples tab's "Open Copy in Editor" button (and the same
 *   affordance on the Templates tab) calls
 *   `useTabsStore().goToEditor({ source, filename })`. The Editor
 *   reads that prefill on mount via the tabs store and clears it
 *   after consumption.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '../api/client'
import { previewTypst, type PreviewResult } from '../api/preview'
import { listImages } from '../api/images'
import { listMediaArchiveImages } from '../api/media-archive'
import { usePrincipalsStore } from '../stores/principals'
import { useResourceStore } from '../stores/resources'
import { useSourcesStore, type SourcesKindFilter } from '../stores/sources'
import { useTabsStore } from '../stores/tabs'
import { DEFAULT_PPI, PPI_OPTIONS } from '../constants/ppi'
import type { ImageResource, MediaArchiveImage, PlaygroundSourceSummary, TemplateResource } from '../types'
import OpenPickerModal from './OpenPickerModal.vue'
import SourceEditor from './SourceEditor.vue'
import TemplateInsertionPicker from './TemplateInsertionPicker.vue'

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

// Or import a template uploaded via the Templates tab:
// #import "templates/foo.typ": bar
`

const STARTER_NAME = 'editor.typ'

const source = ref('')
const filename = ref('')
const currentSourceId = ref<string | null>(null)
const currentSourceIsDirty = ref(false)
const format = ref<'pdf' | 'png' | 'svg'>('pdf')
const ppi = ref<number>(DEFAULT_PPI)
const busy = ref(false)
const result = ref<PreviewResult | null>(null)
const resultBlobUrl = ref<string | null>(null)
const error = ref<string | null>(null)
const diagnostics = ref<ParsedDiagnostic[] | null>(null)

interface ParsedDiagnostic {
    message: string
    severity: 'error' | 'warning'
    hint?: string
}

const principalsStore = usePrincipalsStore()
const sourcesStore = useSourcesStore()
const resourcesStore = useResourceStore()
const tabsStore = useTabsStore()

// Image picker state
const pickerOpen = ref(false)
const pickerTab = ref<'plugin' | 'media'>('plugin')
const pickerLoading = ref(false)
const pluginImages = ref<ImageResource[]>([])
const mediaImages = ref<MediaArchiveImage[]>([])
// Template picker state
const templatePickerOpen = ref(false)
const templatePickerLoading = ref(false)
const templates = ref<TemplateResource[]>([])
// SourceEditor instance — exposes focus() + the underlying textarea
// (cursor-aware insert after picking an image from the picker).
const editorRef = ref<InstanceType<typeof SourceEditor> | null>(null)

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

async function loadTemplatePickerTemplates(): Promise<void> {
    templatePickerLoading.value = true
    try {
        const principalId = principalsStore.selectedPrincipalId ?? undefined
        templates.value = await resourcesStore.templates.length > 0
            ? resourcesStore.templates
            : await import('../api/templates').then((m) => m.listTemplates(principalId ?? undefined))
    } catch {
        templates.value = []
    } finally {
        templatePickerLoading.value = false
    }
}

async function openImagePicker(): Promise<void> {
    pickerOpen.value = !pickerOpen.value
    openPickerOpen.value = false
    templatePickerOpen.value = false
    if (pickerOpen.value) {
        await loadPickerImages()
    }
}

function closeImagePicker(): void {
    pickerOpen.value = false
}

async function openTemplatePicker(): Promise<void> {
    templatePickerOpen.value = !templatePickerOpen.value
    openPickerOpen.value = false
    pickerOpen.value = false
    if (templatePickerOpen.value) {
        await loadTemplatePickerTemplates()
    }
}

function closeTemplatePicker(): void {
    templatePickerOpen.value = false
}

function insertAtCursor(snippet: string): void {
    const ta = editorRef.value?.textarea ?? null
    if (ta === null) {
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

function pickPluginImage(img: ImageResource): void {
    insertAtCursor(`#image("${img.url}", width: 80%)\n`)
    closeImagePicker()
}

function pickMediaImage(img: MediaArchiveImage): void {
    insertAtCursor(`#image("${img.asset_url}", width: 80%)\n`)
    closeImagePicker()
}

function pickTemplate(payload: { name: string }): void {
    insertAtCursor(`#import "templates/${payload.name}"\n`)
    closeTemplatePicker()
}

async function openPicker(): Promise<void> {
    openPickerOpen.value = true
    pickerOpen.value = false
    templatePickerOpen.value = false
    if (sourcesStore.sources.length === 0) {
        await sourcesStore.loadSources()
    }
}

function closeOpenPicker(): void {
    openPickerOpen.value = false
}

function onChangePickerKind(kind: SourcesKindFilter): void {
    sourcesStore.setKind(kind)
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
    revokeResultBlob()
    error.value = null
    diagnostics.value = null
    closeOpenPicker()
}

function startNewSource(): void {
    // Clear the buffer rather than pre-filling with the starter
    // example — the user might want to start from scratch, and
    // "Load example" is one click away when they don't. The
    // empty state surfaces the Load-example button in the
    // editor area so the path forward is still obvious.
    source.value = ''
    filename.value = ''
    currentSourceId.value = null
    currentSourceIsDirty.value = false
    result.value = null
    revokeResultBlob()
    error.value = null
    diagnostics.value = null
}

function loadStarter(): void {
    source.value = STARTER
    filename.value = STARTER_NAME
    currentSourceId.value = null
    currentSourceIsDirty.value = false
    result.value = null
    revokeResultBlob()
    error.value = null
    diagnostics.value = null
    // Focus the editor so the user can immediately start editing.
    requestAnimationFrame(() => editorRef.value?.focus())
}

/**
 * Revoke any previously-allocated Blob objectURL so we don't leak
 * memory on every render. Called whenever a new render starts or
 * the buffer resets. Without this, every render adds a dangling
 * Blob URL until the tab is closed.
 */
function revokeResultBlob(): void {
    if (resultBlobUrl.value !== null) {
        URL.revokeObjectURL(resultBlobUrl.value)
        resultBlobUrl.value = null
    }
}

function base64ToBlob(base64: string, mime: string): Blob {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
        arr[i] = bytes.charCodeAt(i)
    }
    return new Blob([arr], { type: mime })
}

async function saveCurrent(): Promise<void> {
    if (currentSourceId.value === null) {
        // No row yet — the user has typed into a fresh buffer
        // (clicked "New" or just landed on the page). Persist via
        // the create endpoint without paying for a compile.
        // Conflict (409, same filename) surfaces as a normal
        // error; the user can rename and try again.
        const created = await sourcesStore.createSource(filename.value, source.value)
        if (created !== null) {
            currentSourceId.value = created.id
            currentSourceIsDirty.value = false
            result.value = null
            revokeResultBlob()
        } else {
            error.value = sourcesStore.error ?? 'Failed to save.'
        }
        return
    }
    const saved = await sourcesStore.saveSource(currentSourceId.value, source.value)
    if (saved !== null) {
        currentSourceIsDirty.value = false
        result.value = null
        revokeResultBlob()
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
    } catch (e) {
        if (e instanceof ApiError) {
            error.value = e.message
        } else {
            const raw = e instanceof Error ? e.message : String(e)
            error.value = `Could not reach the server to delete the file (${raw}). Check the browser console for the full request log.`
            console.error('typst editor: delete failed', e)
        }
        return
    }
    startNewSource()
}

async function render(): Promise<void> {
    busy.value = true
    error.value = null
    diagnostics.value = null
    revokeResultBlob()
    result.value = null
    try {
        const preview = await previewTypst({
            source: source.value,
            name: filename.value,
            format: format.value,
            ppi: format.value === 'png' ? ppi.value : undefined,
        })
        result.value = preview
        const blob = base64ToBlob(preview.bytes, preview.mime)
        resultBlobUrl.value = URL.createObjectURL(blob)
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

/**
 * Parse the controller's COMPILATION_FAILED message. The envelope is
 * `{ error: { code, message, diagnostics: [{ message, severity, hint? }] } }`.
 * The client surfaces only `error.message` (the entire JSON blob as a
 * string), so we parse it back out into a typed structure the result
 * panel can render with severity-aware styling and hint callouts.
 *
 * Falls back to a single error entry when the message isn't a parseable
 * envelope — the operator still sees SOMETHING rather than an empty
 * diagnostics panel.
 */
function parseDiagnostics(message: string): ParsedDiagnostic[] {
    try {
        const obj = JSON.parse(message) as {
            diagnostics?: Array<{ message?: string; severity?: string; hint?: string }>
        }
        if (Array.isArray(obj.diagnostics)) {
            const out: ParsedDiagnostic[] = []
            for (const d of obj.diagnostics) {
                const msg = d.message ?? ''
                if (msg === '') continue
                const severity = d.severity === 'warning' ? 'warning' : 'error'
                const entry: ParsedDiagnostic = { message: msg, severity }
                if (typeof d.hint === 'string' && d.hint !== '') {
                    entry.hint = d.hint
                }
                out.push(entry)
            }
            return out
        }
    } catch {
        // not JSON — fall through
    }
    return [{ message, severity: 'error' }]
}

function downloadRender(): void {
    const r = result.value
    const url = resultBlobUrl.value
    if (r === null || url === null) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${r.source_name.replace(/\.typ$/, '')}.${r.format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
}

const hasOpenFile = computed(() => currentSourceId.value !== null)

const hasUnsavedChanges = computed<boolean>(() => {
    if (currentSourceId.value === null) {
        return source.value.trim() !== '' || filename.value.trim() !== ''
    }
    return currentSourceIsDirty.value
})

// Track in-editor edits so the Save button reflects "dirty" state.
watch(source, () => {
    if (currentSourceId.value !== null) {
        currentSourceIsDirty.value = true
    }
})
// Filename change also marks dirty: if the operator renames a file
// without compiling, the local source_id still points at the old
// name and the save would overwrite the wrong row.
watch(filename, () => {
    if (currentSourceId.value !== null) {
        currentSourceIsDirty.value = true
    }
})

onMounted(() => {
    // Eagerly fetch the image picker so the first click is snappy.
    loadPickerImages().catch(() => { /* ignored — picker re-fetches on open */ })
    sourcesStore.loadSources().catch(() => { /* ignored — picker re-fetches on open */ })
    resourcesStore.loadTemplates().catch(() => { /* ignored — picker re-fetches on open */ })

    // Cross-tab prefill: when an Example card opens the Editor via
    // the tabs store, consume the prefill here. Cleared after
    // consumption so a tab switch back to the Editor doesn't
    // re-populate the buffer.
    const prefill = tabsStore.editorPrefill
    if (prefill !== null) {
        if (prefill.source !== '') {
            source.value = prefill.source
        }
        if (prefill.filename !== '') {
            filename.value = prefill.filename
        }
        tabsStore.clearEditorPrefill()
    }
})
</script>

<template>
    <div class="space-y-4">
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
                <div class="flex items-baseline gap-2">
                    <label for="typst-filename" class="block text-sm font-medium text-foreground">Filename</label>
                    <span
                        v-if="hasUnsavedChanges"
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded border border-amber-500/40 text-amber-700 bg-amber-500/10 dark:text-amber-300"
                        title="This buffer is not saved yet"
                    >
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        Unsaved
                    </span>
                    <span
                        v-else-if="hasOpenFile"
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded border border-emerald-500/40 text-emerald-700 bg-emerald-500/10 dark:text-emerald-300"
                        title="This buffer is saved"
                    >
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                        Saved
                    </span>
                </div>
                <span class="text-xs text-muted-foreground">
                    Rendered by <code class="font-mono">POST /api/v1/typst/preview</code> — no DB writes
                </span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <input
                    id="typst-filename"
                    v-model="filename"
                    type="text"
                    placeholder="editor.typ"
                    class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                    spellcheck="false"
                    autocomplete="off"
                />
                <div class="relative">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="sourcesStore.loading"
                        @click="openPicker"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        </svg>
                        Open
                        <span class="text-xs text-muted-foreground">({{ sourcesStore.sources.length }})</span>
                    </button>
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
                    :disabled="sourcesStore.saving"
                    :title="hasOpenFile ? 'Persist source edits without re-rendering' : 'Save the current buffer as a new editor file'"
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
            <div class="relative">
                <SourceEditor
                    ref="editorRef"
                    v-model="source"
                    :rows="18"
                    placeholder="Type Typst markup, or click ‘Load example’ to start from a template…"
                    aria-label="Typst source"
                />
                <div
                    v-if="source === '' && filename === '' && !result"
                    class="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                    <div class="pointer-events-auto flex flex-col items-center gap-2 px-4 py-3 rounded-md border border-border bg-card/95 shadow-sm">
                        <p class="text-xs text-muted-foreground text-center">Empty editor buffer.</p>
                        <button
                            type="button"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted"
                            @click="loadStarter"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="9" y1="13" x2="15" y2="13" />
                                <line x1="9" y1="17" x2="13" y2="17" />
                            </svg>
                            Load example
                        </button>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-3 flex-wrap text-sm">
                    <fieldset class="flex items-center gap-3">
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
                    <label
                        v-if="format === 'png'"
                        class="inline-flex items-center gap-1.5"
                    >
                        <span class="text-xs text-muted-foreground">PPI</span>
                        <select
                            v-model.number="ppi"
                            class="px-2 py-1 rounded-md border border-input bg-background text-foreground text-xs font-mono focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                            aria-label="Raster resolution (PPI)"
                        >
                            <option v-for="opt in PPI_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                    </label>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="busy"
                        @click="openImagePicker"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" height="18" width="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Insert image
                    </button>
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="busy"
                        @click="openTemplatePicker"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="9" y1="13" x2="13" y2="13" />
                            <line x1="11" y1="17" x2="15" y2="17" />
                        </svg>
                        Insert template
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
            <TemplateInsertionPicker
                :open="templatePickerOpen"
                :templates="templates"
                :loading="templatePickerLoading"
                @close="closeTemplatePicker"
                @insert="pickTemplate"
            />
        </div>

        <OpenPickerModal
            :open="openPickerOpen"
            :sources="sourcesStore.sources"
            :loading="sourcesStore.loading"
            :kind="sourcesStore.kind"
            :kind-counts="sourcesStore.kindCounts"
            @close="closeOpenPicker"
            @pick="pickExistingSource"
            @change-kind="onChangePickerKind"
        />

        <div
            v-if="error"
            class="rounded-md px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/30 space-y-2"
        >
            <div class="font-medium">{{ error }}</div>
            <ul v-if="diagnostics && diagnostics.length > 0" class="space-y-2 font-mono text-xs">
                <li
                    v-for="(d, idx) in diagnostics"
                    :key="idx"
                    :class="[
                        'rounded-md border px-3 py-2',
                        d.severity === 'warning'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'border-destructive/40 bg-destructive/10 text-destructive',
                    ]"
                >
                    <div class="flex items-baseline gap-2">
                        <span
                            class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded"
                            :class="d.severity === 'warning' ? 'bg-amber-500/20' : 'bg-destructive/20'"
                        >{{ d.severity }}</span>
                        <span>{{ d.message }}</span>
                    </div>
                    <div
                        v-if="d.hint"
                        class="mt-1.5 pl-1 border-l-2 border-current/30 text-foreground/80"
                    >
                        <span class="text-[10px] uppercase tracking-wide opacity-70">Hint</span>
                        <span class="ml-2">{{ d.hint }}</span>
                    </div>
                </li>
            </ul>
        </div>

        <div v-if="result && resultBlobUrl" class="rounded-lg border border-border bg-card p-4 space-y-3">
            <div class="text-sm text-foreground flex items-baseline justify-between flex-wrap gap-2">
                <div>
                    Rendered <code class="font-mono">{{ result.format }}</code>
                    <span v-if="result.width !== null && result.height !== null">
                        · {{ result.width }}×{{ result.height }}px
                    </span>
                    <span v-if="format === 'png'" class="text-muted-foreground">
                        · {{ ppi }} PPI
                    </span>
                </div>
                <span class="text-xs text-muted-foreground">
                    Ephemeral — nothing saved
                </span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    class="text-xs font-medium text-muted-foreground hover:text-foreground"
                    @click="downloadRender"
                >Download</button>
                <span class="text-xs text-muted-foreground">
                    Re-render after Save to refresh.
                </span>
            </div>
            <div v-if="result.format === 'pdf'">
                <iframe
                    :src="resultBlobUrl"
                    title="Typst PDF render"
                    class="w-full h-96 border border-border rounded"
                />
            </div>
            <div v-else-if="result.mime.startsWith('image/')">
                <img :src="resultBlobUrl" :alt="`Typst render ${result.format}`" class="max-w-full h-auto mx-auto" />
            </div>
        </div>
    </div>
</template>
