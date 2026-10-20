/**
 * The plugin's German catalogue.
 *
 * Two things are pinned here: that the catalogue covers the source
 * (the extractor's rule 2 does the same, but it is a build-time gate
 * and this is a test), and that the panel actually renders German
 * when the host says the operator's language is German.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createPluginI18n, t } from '../src/i18n'
import en from '../src/locales/en.json'
import de from '../src/locales/de.json'
import AlertBanner from '../src/components/AlertBanner.vue'
import FontList from '../src/components/FontList.vue'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('the German catalogue', () => {
    it('covers every key the English catalogue has, and no more', () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    })

    it('translates every key — no value is left identical to its English source', () => {
        const untranslated = Object.entries(de)
            .filter(([key, value]) => value === key)
            .map(([key]) => key)
        expect(untranslated).toEqual([])
    })

    it('keeps the placeholders of the English source', () => {
        const placeholders = (value: string): string[] =>
            [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        const drifted = Object.entries(de)
            .filter(([key, value]) =>
                placeholders(key).join() !== placeholders(value).join())
            .map(([key]) => key)
        expect(drifted).toEqual([])
    })
})

describe('the panel in German', () => {
    it('renders the translated chrome', () => {
        const wrapper = mount(AlertBanner, {
            props: { message: 'Fehler' },
            global: { plugins: [createPluginI18n('de')] },
        })
        expect(wrapper.find('button').attributes('aria-label')).toBe('Ausblenden')
        wrapper.unmount()
    })

    it('translates through the module-level helper the stores use', () => {
        const instance = createPluginI18n('de')
        expect(instance.global.locale.value).toBe('de')
        expect(t('Delete')).toBe('Löschen')
        expect(t('Delete font "{name}"? This cannot be undone.', { name: 'Inter.otf' }))
            .toBe('Schrift „Inter.otf“ löschen? Das kann nicht rückgängig gemacht werden.')
    })

    it('interpolates a placeholder into the German value', () => {
        const i18n = createI18n({
            legacy: false,
            locale: 'de',
            fallbackLocale: 'en',
            messages: { en, de },
        })
        expect(i18n.global.t('Delete font "{name}"? This cannot be undone.', { name: 'Inter.otf' }))
            .toBe('Schrift „Inter.otf“ löschen? Das kann nicht rückgängig gemacht werden.')
    })

    it('falls back to the English source for a key the catalogue does not have', () => {
        const i18n = createI18n({
            legacy: false,
            locale: 'de',
            fallbackLocale: 'en',
            messages: { en, de },
        })
        expect(i18n.global.t('A key nobody translated')).toBe('A key nobody translated')
    })
})

describe('the font list in German', () => {
    it('renders the translated column headings', () => {
        const wrapper = mount(FontList, {
            global: { plugins: [createPluginI18n('de')] },
        })
        const headings = wrapper.findAll('th').map((th) => th.text())
        expect(headings).toEqual(['Bezeichnung', 'Herkunft', 'Verwendung in Typst', 'Größe', 'Aktionen'])
        wrapper.unmount()
    })
})
