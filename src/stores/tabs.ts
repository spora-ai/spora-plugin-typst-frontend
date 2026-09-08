/// <reference types="vite/client" />
/**
 * Pinia store for cross-component tab navigation.
 *
 * The Typst page (`src/pages/TypstPage.vue`) owns the chip row, but
 * other components need to jump to a specific tab — e.g. an Example
 * card's "Open in Editor" button calls `goToEditor(prefill)` to
 * switch to the Editor tab and hand it the source it should load.
 * Without a store that lives outside the page component, the
 * caller would have to prop-drill a callback up to the page, which
 * the IIFE-mounted plugin layout can't do without leaking host
 * abstractions.
 *
 * `editorPrefill` is a one-shot handoff — the Editor consumes it on
 * mount and clears it, so a second visit to the Examples tab
 * doesn't replay the prefill onto the next Editor mount.
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'

export type Tab = 'fonts' | 'templates' | 'examples' | 'images' | 'editor'

export interface EditorPrefill {
    source: string
    filename: string
}

export const useTabsStore = defineStore('typst-tabs', () => {
    const activeTab = ref<Tab>('fonts')
    const editorPrefill = ref<EditorPrefill | null>(null)

    function setTab(tab: Tab): void {
        activeTab.value = tab
    }

    function goToEditor(prefill?: EditorPrefill): void {
        activeTab.value = 'editor'
        if (prefill !== undefined) {
            editorPrefill.value = prefill
        }
    }

    function clearEditorPrefill(): void {
        editorPrefill.value = null
    }

    return {
        activeTab,
        editorPrefill,
        setTab,
        goToEditor,
        clearEditorPrefill,
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useTabsStore, import.meta.hot))
}
