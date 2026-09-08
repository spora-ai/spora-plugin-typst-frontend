/**
 * Component tests for TemplateInsertionPicker — the inline
 * panel that lives under the playground's Editor tab and
 * inserts `#import "templates/<name>"` at the caret.
 *
 * Mirrors the image-picker's coverage: nothing renders when
 * `open=false`, a card per template appears when `open=true`,
 * a click emits `insert` with the basename, and Close emits
 * `close`. The picker's `loading=true` state is the same
 * "Loading…" line the image picker uses.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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

        expect(wrapper.find('[data-testid="template-insertion-picker"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders a card per template when open=true', () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [
                    template({ name: 'invoice.typ' }),
                    template({ name: 'letter.typ' }),
                    template({ name: 'cover.typ' }),
                ],
            },
        })

        const picker = wrapper.find('[data-testid="template-insertion-picker"]')
        expect(picker.exists()).toBe(true)
        expect(picker.findAll('[data-testid^="template-insertion-card-"]')).toHaveLength(3)
        expect(picker.text()).toContain('invoice.typ')
        expect(picker.text()).toContain('letter.typ')
        expect(picker.text()).toContain('cover.typ')
        wrapper.unmount()
    })

    it('clicking a template emits insert with the name', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [
                    template({ name: 'invoice.typ' }),
                    template({ name: 'letter.typ' }),
                ],
            },
        })

        const card = wrapper.find<HTMLButtonElement>('[data-testid="template-insertion-card-letter.typ"]')
        expect(card.exists()).toBe(true)
        await card.trigger('click')

        const emitted = wrapper.emitted('insert')
        expect(emitted).toBeDefined()
        expect(emitted?.[0]?.[0]).toEqual({ name: 'letter.typ' })
        wrapper.unmount()
    })

    it('clicking Close emits close', async () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [template({ name: 'invoice.typ' })],
            },
        })

        const close = wrapper.find<HTMLButtonElement>('[data-testid="template-insertion-close"]')
        expect(close.exists()).toBe(true)
        await close.trigger('click')

        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('shows the loading state when loading=true', () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [],
                loading: true,
            },
        })

        const picker = wrapper.find('[data-testid="template-insertion-picker"]')
        expect(picker.exists()).toBe(true)
        expect(picker.text()).toContain('Loading…')
        // No cards while loading — the loading line replaces both the
        // grid and the empty-state hint.
        expect(picker.findAll('[data-testid^="template-insertion-card-"]')).toHaveLength(0)
        wrapper.unmount()
    })

    it('shows an empty-state hint when the template list is empty and not loading', () => {
        const wrapper = mount(TemplateInsertionPicker, {
            props: {
                open: true,
                templates: [],
                loading: false,
            },
        })

        const picker = wrapper.find('[data-testid="template-insertion-picker"]')
        expect(picker.text()).toContain('No templates uploaded yet.')
        wrapper.unmount()
    })
})
