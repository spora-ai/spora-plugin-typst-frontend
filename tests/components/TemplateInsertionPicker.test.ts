/**
 * Component tests for TemplateInsertionPicker — the modal
 * that opens when the editor's toolbar Template button is
 * clicked. Inserts `#import "templates/<name>"` at the caret
 * (the parent builds the snippet from the emitted name).
 *
 * Mirrors the image picker's coverage: nothing renders when
 * `open=false`, a card per template appears when `open=true`,
 * a click emits `insert` with the basename, and Close emits
 * `close`. The picker's `loading=true` state is the same
 * "Loading…" line the image picker uses.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TemplateInsertionPicker from '../../src/components/TemplateInsertionPicker.vue'
import type { TemplateResource } from '../../src/types'

function template(overrides: Partial<TemplateResource>): TemplateResource {
    return {
        name: overrides.name ?? 'invoice.typ',
        kind: 'template',
        origin: overrides.origin ?? 'principal',
        size: overrides.size ?? 1200,
        modified_at: overrides.modified_at ?? 1_700_000_000,
    }
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('TemplateInsertionPicker.vue', () => {
    it('renders nothing when open=false', () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: false,
                templates: [template({ name: 'invoice.typ' })],
            },
        })

        expect(wrapper.find('[data-testid="template-insertion-modal"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders a card per template when open=true', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [
                    template({ name: 'invoice.typ' }),
                    template({ name: 'letter.typ' }),
                    template({ name: 'cover.typ' }),
                ],
            },
            attachTo: document.body,
        })
        await flushPromises()

        const modal = wrapper.find('[data-testid="template-insertion-modal"]')
        expect(modal.exists()).toBe(true)
        expect(wrapper.findAll('[data-testid^="template-insertion-card-"]')).toHaveLength(3)
        expect(wrapper.text()).toContain('invoice.typ')
        expect(wrapper.text()).toContain('letter.typ')
        expect(wrapper.text()).toContain('cover.typ')
        wrapper.unmount()
    })

    it('clicking a card emits insert with the basename', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [
                    template({ name: 'invoice.typ' }),
                    template({ name: 'letter.typ' }),
                ],
            },
            attachTo: document.body,
        })
        await flushPromises()

        const card = wrapper.find('[data-testid="template-insertion-card-letter.typ"]')
        expect(card.exists()).toBe(true)
        await card.trigger('click')

        const insert = wrapper.emitted('insert')
        expect(insert).toBeDefined()
        expect(insert![0]![0]).toEqual({ name: 'letter.typ' })
        wrapper.unmount()
    })

    it('Close emits close', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [template({ name: 'invoice.typ' })],
            },
            attachTo: document.body,
        })
        await flushPromises()

        const close = wrapper.find('[data-testid="template-insertion-close"]')
        await close.trigger('click')
        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('shows the loading line when loading=true', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [],
                loading: true,
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.text()).toContain('Loading')
        wrapper.unmount()
    })

    it('shows the empty-state line when no templates are uploaded', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [],
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.text()).toContain('No templates uploaded')
        wrapper.unmount()
    })
})
