<script setup lang="ts">
/**
 * Editor: paste Typst source, click Preview / Save & Render, see
 * the result. No DB writes on render — every render is ephemeral
 * so iterating on a document doesn't fill the media archive with
 * parent rows.
 *
 * Action buttons (footer):
 *   - **Preview** — POST /preview only. Ephemeral, no DB writes.
 *     Use this when iterating without committing.
 *   - **Save & Render** — POST /sources to persist the buffer
 *     first, then POST /preview against the same source. One
 *     click = save + see result. The Save Source button is gone
 *     — Save & Render covers the "save then look" path; if the
 *     operator just wants to save, the Open picker dropdown
 *     surfaces every saved source for re-opening.
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
 * Toolbar (above editor):
 *   - **Formatting tools** — Heading, Bold, Italic, Underline,
 *     Link. Lives in `<EditorToolbar>` (a separate component);
 *     each tool reads the current selection and either wraps it
 *     or inserts a placeholder. See `useEditorToolbar.ts` for the
 *     per-tool dispatch logic.
 *   - **Insert Template / Insert Image** (trailing slot of the
 *     toolbar) — these trigger `<TemplateInsertionPicker>` and
 *     `<ImageInsertModal>` respectively. Both are modals now
 *     (the previous inline panels pushed other affordances off
 *     screen as the source grew).
 *
 * Cross-tab prefill:
 *   The Examples tab's "Open Copy in Editor" button (and the same
 *   affordance on the Templates tab) calls
 *   `useTabsStore().goToEditor({ source, filename })`. The Editor
 *   reads that prefill on mount via the tabs store and clears it
 *   after consumption. Prefill takes precedence over the
 *   sessionStorage buffer (see below) — the operator's explicit
 *   "start from this template" action wins over the persisted
 *   draft.
 *
 * Buffer persistence:
 *   The source + filename are mirrored to `sessionStorage` under
 *   `spora.typst.editor.buffer.<principal_id>` whenever they
 *   change (300ms debounced). The buffer survives page reloads
 *   within the same browser tab. Switching principals loads the
 *   buffer for the new principal.
 *   The Clear button (next to New) wipes both the in-memory
 *   buffer AND the sessionStorage entry for the current
 *   principal. New leaves the sessionStorage entry alone — the
 *   next page reload restores it, so an accidental click
 *   doesn't lose work.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, withPrincipal } from '../api/client'
import { previewTypst, type PreviewResult } from '../api/preview'
import { listImages } from '../api/images'
import { listMediaArchiveImages } from '../api/media-archive'
import { listTemplates } from '../api/templates'
import { usePrincipalsStore } from '../stores/principals'
import { useResourceStore } from '../stores/resources'
import { useSourcesStore, type SourcesKindFilter } from '../stores/sources'
import { useTabsStore } from '../stores/tabs'
import { DEFAULT_PPI, PPI_OPTIONS } from '../constants/ppi'
import type { ImageResource, MediaArchiveImage, PlaygroundSourceSummary, TemplateResource } from '../types'
import OpenPickerModal from './OpenPickerModal.vue'
import SourceEditor from './SourceEditor.vue'
import TemplateInsertionPicker from './TemplateInsertionPicker.vue'
import ImageInsertModal from './ImageInsertModal.vue'
import EditorToolbar from './EditorToolbar.vue'

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

/**
 * sessionStorage key for the per-principal editor buffer.
 * One buffer per principal so admins switching between
 * principals (the chip row in the tab header) keep separate
 * drafts. Storage is session-scoped (cleared when the browser
 * tab closes) — not local — so we don't keep stale drafts on
 * shared machines.
 */
const BUFFER_STORAGE_PREFIX = 'spora.typst.editor.buffer.'

function bufferStorageKey(principalId: number | null): string | null {
    if (principalId === null) return null
    return `${BUFFER_STORAGE_PREFIX}${principalId}`
}

interface StoredBuffer {
    source: string
    filename: string
}

function loadStoredBuffer(principalId: number | null): StoredBuffer | null {
    const key = bufferStorageKey(principalId)
    if (key === null) return null
    try {
        const raw = sessionStorage.getItem(key)
        if (raw === null) return null
        const parsed = JSON.parse(raw) as { source?: unknown; filename?: unknown }
        if (typeof parsed.source === 'string' && typeof parsed.filename === 'string') {
            return { source: parsed.source, filename: parsed.filename }
        }
    } catch {
        // Corrupt entry — ignore so the editor still mounts.
    }
    return null
}

function persistBuffer(principalId: number | null, src: string, fname: string): void {
    const key = bufferStorageKey(principalId)
    if (key === null) return
    try {
        sessionStorage.setItem(key, JSON.stringify({ source: src, filename: fname }))
    } catch {
        // Quota exceeded or storage disabled — silently drop the
        // persistence. The in-memory buffer still works.
    }
}

function clearStoredBuffer(principalId: number | null): void {
    const key = bufferStorageKey(principalId)
    if (key === null) return
    try {
        sessionStorage.removeItem(key)
    } catch {
        // ignore
    }
}

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
        // Both lists in parallel — surface the first failure via
        // the shared `error` ref so the AlertBanner picks it up.
        // Previously both calls used `.catch(() => [])` which made
        // a 5xx look identical to "no images uploaded" to the
        // operator — they'd click the picker open, see the empty
        // state, and assume they needed to upload.
        const results = await Promise.allSettled([
            listImages(principalId),
            listMediaArchiveImages(principalId),
        ])
        const [plugin, media] = results
        if (plugin.status === 'fulfilled') {
            pluginImages.value = plugin.value
        } else {
            pluginImages.value = []
            error.value = `Could not load plugin images: ${plugin.reason instanceof Error ? plugin.reason.message : String(plugin.reason)}`
        }
        if (media.status === 'fulfilled') {
            mediaImages.value = media.value
        } else {
            mediaImages.value = []
            error.value = `Could not load media archive: ${media.reason instanceof Error ? media.reason.message : String(media.reason)}`
        }
    } finally {
        pickerLoading.value = false
    }
}

async function loadTemplatePickerTemplates(): Promise<void> {
    templatePickerLoading.value = true
    try {
        const principalId = principalsStore.selectedPrincipalId ?? undefined
        templates.value = resourcesStore.templates.length > 0
            ? resourcesStore.templates
            : await listTemplates(principalId ?? undefined)
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
    // Kept as a local helper for backward-compat with the inline
    // pickers. The toolbar now uses editorRef.value?.insertAtCaret
    // which handles preventScroll + caret positioning in one place.
    const editor = editorRef.value
    if (editor === null) {
        source.value = source.value + '\n' + snippet + '\n'
        return
    }
    editor.insertAtCaret(snippet)
    editor.focus({ preventScroll: true })
}

function pickPluginImage(img: ImageResource): void {
    // Pin the store's current principalId onto the inserted URL —
    // the Typst renderer (and any operator browsing the editor
    // preview) needs `?principal_id=N` for non-default principals
    // because the image-show endpoint falls back to the caller's
    // user-principal otherwise.
    insertAtCursor(`#image("${withPrincipal(img.url, principalsStore.selectedPrincipalId ?? undefined)}", width: 80%)\n`)
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

function onPickerTabChange(tab: 'plugin' | 'media'): void {
    pickerTab.value = tab
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
        // codePointAt (not charCodeAt) so multi-byte UTF-8 sequences
        // decoded from base64 round-trip correctly. Sonar S7758.
        arr[i] = bytes.codePointAt(i) ?? 0
    }
    return new Blob([arr], { type: mime })
}

/**
 * Render the buffer ephemerally — no DB writes, no derivatives.
 * Used by the Preview button (footer). For the Save & Render
 * path, the button handler calls this AFTER the createSource /
 * saveSource call returns so the same render pipeline is reused.
 */
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
 * Save & Render: persist the buffer (create or update the row by
 * filename under the current principal) THEN run the preview.
 * Sequential — if the save fails, the render doesn't run and
 * the error surfaces from the store. If the render fails, the
 * save has already landed so the operator can re-open the file
 * later and iterate.
 */
async function saveAndRender(): Promise<void> {
    error.value = null
    // Persist first. Both branches update `currentSourceId` and
    // clear the dirty flag on success so the Save badge updates
    // correctly before the render starts.
    if (currentSourceId.value === null) {
        const created = await sourcesStore.createSource(filename.value, source.value)
        if (created === null) {
            error.value = sourcesStore.error ?? 'Failed to save.'
            return
        }
        currentSourceId.value = created.id
        currentSourceIsDirty.value = false
    } else {
        const saved = await sourcesStore.saveSource(currentSourceId.value, source.value)
        if (saved === null) {
            error.value = sourcesStore.error ?? 'Failed to save.'
            return
        }
        currentSourceIsDirty.value = false
    }
    await render()
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

/**
 * Persist the buffer to sessionStorage on change. 300ms
 * debounce so a fast typist doesn't write on every keystroke —
 * the buffer only needs to survive reloads, not be real-time.
 * Skips persistence when there's nothing meaningful in the
 * buffer (both fields empty) so the Clear button truly wipes.
 */
let persistTimer: number | null = null
watch([source, filename], () => {
    if (persistTimer !== null) clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
        if (source.value === '' && filename.value === '') return
        persistBuffer(principalsStore.selectedPrincipalId, source.value, filename.value)
    }, 300)
})

/**
 * Clear the in-memory buffer AND the sessionStorage entry for
 * the current principal. Distinct from `startNewSource()` which
 * leaves the session entry alone — an accidental New click
 * shouldn't lose work across reloads; Clear is the explicit
 * "wipe everything for this principal" action.
 */
function clearBuffer(): void {
    source.value = ''
    filename.value = ''
    currentSourceId.value = null
    currentSourceIsDirty.value = false
    result.value = null
    revokeResultBlob()
    error.value = null
    diagnostics.value = null
    clearStoredBuffer(principalsStore.selectedPrincipalId)
}

/**
 * When the principal changes, swap the in-memory buffer for
 * the buffer that belongs to the new principal. The previous
 * principal's buffer was already persisted on each change so
 * switching away and back restores the right draft.
 */
watch(
    () => principalsStore.selectedPrincipalId,
    (newId, oldId) => {
        // Persist the outgoing buffer first so we don't lose
        // anything that didn't yet hit the 300ms debounce.
        if (oldId !== null && (source.value !== '' || filename.value !== '')) {
            persistBuffer(oldId, source.value, filename.value)
        }
        const stored = loadStoredBuffer(newId)
        source.value = stored?.source ?? ''
        filename.value = stored?.filename ?? ''
        currentSourceId.value = null
        currentSourceIsDirty.value = false
        result.value = null
        revokeResultBlob()
        error.value = null
        diagnostics.value = null
    },
)

onMounted(() => {
    // Eagerly fetch the image picker so the first click is snappy.
    loadPickerImages().catch(() => { /* ignored — picker re-fetches on open */ })
    sourcesStore.loadSources().catch(() => { /* ignored — picker re-fetches on open */ })
    resourcesStore.loadTemplates().catch(() => { /* ignored — picker re-fetches on open */ })

    // Restore order:
    //   1. Cross-tab prefill wins (explicit operator action from
    //      a Template / Example card via useTabsStore).
    //   2. Session-storage buffer for the current principal.
    //   3. Empty (fresh start).
    const prefill = tabsStore.editorPrefill
    if (prefill !== null) {
        if (prefill.source !== '') {
            source.value = prefill.source
        }
        if (prefill.filename !== '') {
            filename.value = prefill.filename
        }
        tabsStore.clearEditorPrefill()
    } else {
        const stored = loadStoredBuffer(principalsStore.selectedPrincipalId)
        if (stored !== null) {
            source.value = stored.source
            filename.value = stored.filename
        }
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
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground text-sm font-medium hover:bg-muted"
                    title="Clear the buffer and wipe the session-storage entry for this principal"
                    data-testid="compile-form-clear"
                    @click="clearBuffer"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                    Clear
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
            <EditorToolbar :editor-ref="editorRef">
                <template #trailing>
                    <button
                        type="button"
                        class="px-2 py-1 rounded text-xs font-medium text-foreground hover:bg-background hover:text-foreground border border-transparent hover:border-border transition-colors disabled:opacity-50"
                        :disabled="busy"
                        :aria-pressed="pickerOpen"
                        @click="openImagePicker"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="inline-block -mt-0.5 mr-1">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Image
                    </button>
                    <button
                        type="button"
                        class="px-2 py-1 rounded text-xs font-medium text-foreground hover:bg-background hover:text-foreground border border-transparent hover:border-border transition-colors disabled:opacity-50"
                        :disabled="busy"
                        :aria-pressed="templatePickerOpen"
                        @click="openTemplatePicker"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="inline-block -mt-0.5 mr-1">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="9" y1="13" x2="13" y2="13" />
                            <line x1="11" y1="17" x2="15" y2="17" />
                        </svg>
                        Template
                    </button>
                </template>
            </EditorToolbar>
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
                        class="px-3 py-1.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50"
                        :disabled="busy || sourcesStore.saving"
                        @click="render"
                    >
                        {{ busy ? 'Rendering…' : 'Preview' }}
                    </button>
                    <button
                        type="button"
                        class="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                        :disabled="busy || sourcesStore.saving"
                        @click="saveAndRender"
                    >
                        {{ sourcesStore.saving ? 'Saving…' : busy ? 'Rendering…' : 'Save & Render' }}
                    </button>
                </div>
            </div>
            <ImageInsertModal
                :open="pickerOpen"
                :plugin-images="pluginImages"
                :media-images="mediaImages"
                :loading="pickerLoading"
                :active-tab="pickerTab"
                @close="closeImagePicker"
                @pick-plugin-image="pickPluginImage"
                @pick-media-image="pickMediaImage"
                @change-tab="onPickerTabChange"
            />
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
