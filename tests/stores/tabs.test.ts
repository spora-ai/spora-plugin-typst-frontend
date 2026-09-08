import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../../src/stores/tabs'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests for the cross-component tab navigation store.
 *
 * The store has no API surface — it's pure local state with two
 * mutations (`setTab`, `goToEditor`) plus a clear-on-consume handoff
 * (`editorPrefill`). These tests pin the contract so a future
 * refactor that drops `editorPrefill` (or merges `setTab` into
 * `goToEditor`) is caught immediately.
 */

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('stores/tabs', () => {
    it('starts on the fonts tab with no editor prefill', () => {
        const store = useTabsStore()
        expect(store.activeTab).toBe('fonts')
        expect(store.editorPrefill).toBeNull()
    })

    it('setTab moves the active tab', () => {
        const store = useTabsStore()
        store.setTab('templates')
        expect(store.activeTab).toBe('templates')
        store.setTab('examples')
        expect(store.activeTab).toBe('examples')
        store.setTab('images')
        expect(store.activeTab).toBe('images')
    })

    it('setTab accepts every member of the Tab union', () => {
        const store = useTabsStore()
        // Compile-time exhaustiveness check via the function signature
        // — the union has five members, this loop hits all of them.
        const tabs: Array<'fonts' | 'templates' | 'examples' | 'images' | 'editor'> = [
            'fonts',
            'templates',
            'examples',
            'images',
            'editor',
        ]
        for (const tab of tabs) {
            store.setTab(tab)
            expect(store.activeTab).toBe(tab)
        }
    })

    it('goToEditor switches to the editor tab and stores the prefill', () => {
        const store = useTabsStore()
        store.setTab('examples')
        expect(store.activeTab).toBe('examples')
        expect(store.editorPrefill).toBeNull()

        store.goToEditor({ source: '= Hi', filename: 'letter.typ' })
        expect(store.activeTab).toBe('editor')
        expect(store.editorPrefill).toEqual({ source: '= Hi', filename: 'letter.typ' })
    })

    it('goToEditor without arguments only switches the tab', () => {
        const store = useTabsStore()
        store.setTab('templates')

        store.goToEditor()
        expect(store.activeTab).toBe('editor')
        expect(store.editorPrefill).toBeNull()
    })

    it('goToEditor overwrites any prior prefill when called twice', () => {
        const store = useTabsStore()
        store.goToEditor({ source: 'first', filename: 'a.typ' })
        store.goToEditor({ source: 'second', filename: 'b.typ' })
        expect(store.editorPrefill).toEqual({ source: 'second', filename: 'b.typ' })
    })

    it('clearEditorPrefill nulls the prefill without touching the active tab', () => {
        const store = useTabsStore()
        store.goToEditor({ source: '= Hi', filename: 'letter.typ' })
        expect(store.activeTab).toBe('editor')
        expect(store.editorPrefill).not.toBeNull()

        store.clearEditorPrefill()
        expect(store.editorPrefill).toBeNull()
        expect(store.activeTab).toBe('editor')
    })
})
