<script setup lang="ts">
/**
 * Single-shot playground.
 *
 * - The textarea is a thin Typst editor (no Monaco yet — the
 *   skill's syntax primer is short enough that the operator can
 *   write inline; v0.2 will swap in monaco-editor-v3 if the
 *   UX needs it).
 * - Format selector toggles PDF / PNG / SVG.
 * - Render button POSTs the source to `/api/v1/typst/compile` —
 *   a backend endpoint that doesn't ship in PR #1.5. When the
 *   endpoint 404s, the playground degrades to "Copy source" mode
 *   and the operator can drop the source into the chat composer
 *   for the agent to render via `typst_render`.
 *
 * The textarea pre-fills with the plugin-shipped starter invoice
 * source so the playground has working defaults on first open.
 */
import { ref } from 'vue'

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
`

const source = ref(STARTER)
const format = ref<'pdf' | 'png' | 'svg'>('pdf')
const endpointAvailable = ref<boolean | null>(null)
const busy = ref(false)
const result = ref<{
    derivative_id: string
    asset_url: string
    format: string
    mime: string
    size: number
    width: number | null
    height: number | null
    preview_url: string | null
} | null>(null)
const error = ref<string | null>(null)

async function detectEndpoint(): Promise<void> {
    if (endpointAvailable.value !== null) return
    try {
        const api = (window as unknown as { SporaAppTypst?: unknown }).SporaAppTypst
            ? // host fetch already wrapped by the plugin-local api/client — we
              // can probe by sending an empty POST and inspecting 400 vs 404.
              await import('../api/client').then(({ getApi }) => getApi().post('/typst/compile', { source: '', format: 'pdf' }))
            : null
        // Endpoint returned a 4xx — we just want to know if the route is
        // registered, so even a 400 means "available, payload wrong".
        endpointAvailable.value = api !== null
    } catch (e) {
        // 404 → endpoint not yet shipped. 400 with VALIDATION_ERROR is
        // "available". Anything else is unknown — fail closed.
        const status = e instanceof Error && 'status' in e ? Number((e as { status: unknown }).status) : 0
        endpointAvailable.value = status !== 404
    }
}

async function render(): Promise<void> {
    busy.value = true
    error.value = null
    result.value = null
    try {
        const api = await import('../api/client').then(({ getApi }) => getApi())
        const response = await api.post<{
            derivative_id: string
            asset_url: string
            format: string
            mime: string
            size: number
            width: number | null
            height: number | null
            preview_url: string | null
        }>('/typst/compile', {
            source: source.value,
            format: format.value,
        })
        result.value = response
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Render failed.'
    } finally {
        busy.value = false
    }
}

async function copySource(): Promise<void> {
    try {
        await navigator.clipboard.writeText(source.value)
    } catch {
        // ignore — the textarea itself lets the operator copy.
    }
}

detectEndpoint()
</script>

<template>
    <div class="space-y-4">
        <div class="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div class="flex items-baseline justify-between">
                <label for="typst-source" class="block text-sm font-medium text-gray-700">Typst source</label>
                <button
                    type="button"
                    class="text-xs text-typst-700 hover:text-typst-900"
                    @click="copySource"
                >Copy source</button>
            </div>
            <textarea
                id="typst-source"
                v-model="source"
                rows="14"
                class="w-full font-mono text-xs leading-snug p-3 rounded border border-gray-300 focus:border-typst-500 focus:ring-1 focus:ring-typst-500 outline-none"
                spellcheck="false"
                autocomplete="off"
            />
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
                            class="text-typst-500 focus:ring-typst-500"
                        />
                        <span class="uppercase text-xs font-medium">{{ opt }}</span>
                    </label>
                </fieldset>
                <button
                    type="button"
                    class="px-4 py-1.5 rounded bg-typst-500 text-white text-sm font-medium hover:bg-typst-600 disabled:opacity-50"
                    :disabled="busy || endpointAvailable === false"
                    @click="render"
                >
                    {{ busy ? 'Rendering…' : 'Render' }}
                </button>
            </div>
        </div>

        <div
            v-if="endpointAvailable === false"
            class="rounded-md px-4 py-3 text-sm bg-blue-50 text-blue-900 border border-blue-200"
        >
            The <code class="font-mono">POST /api/v1/typst/compile</code> endpoint is not yet shipped — the plugin backend doesn't expose a sync compile endpoint.
            Use <strong>Copy source</strong> and run it through <code class="font-mono">typst_render</code> in the chat composer; or wait for the compile endpoint PR.
        </div>

        <div
            v-if="error"
            class="rounded-md px-4 py-3 text-sm bg-red-50 text-red-900 border border-red-200"
        >
            {{ error }}
        </div>

        <div v-if="result" class="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div class="text-sm text-gray-700">
                Rendered <code class="font-mono">{{ result.format }}</code>
                · <span class="tabular-nums">{{ result.size }}</span> bytes
                <span v-if="result.width && result.height">
                    · {{ result.width }}×{{ result.height }}px
                </span>
            </div>
            <div class="text-xs text-gray-500 truncate">
                <a :href="result.asset_url" target="_blank" rel="noopener" class="text-typst-700 hover:text-typst-900 underline">
                    {{ result.asset_url }}
                </a>
            </div>
            <div v-if="result.mime === 'application/pdf'" class="bg-gray-50 rounded p-2">
                <iframe :src="result.asset_url" class="w-full h-96 border border-gray-200 rounded" />
            </div>
            <div v-else-if="result.mime.startsWith('image/')">
                <img :src="result.asset_url" :alt="`Typst render ${result.format}`" class="max-w-full h-auto mx-auto" />
            </div>
        </div>
    </div>
</template>
