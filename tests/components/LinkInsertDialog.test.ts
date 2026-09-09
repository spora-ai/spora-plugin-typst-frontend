/**
 * Component tests for LinkInsertDialog — the small modal the
 * editor toolbar's Link button opens to ask for a URL + label
 * before inserting `#link("URL")[LABEL]`.
 *
 * Native `<dialog>` like the other modals — Esc closes, backdrop
 * click closes. The URL input is required (the Insert button
 * disables when empty); the label is optional and falls back
 * to "label" on confirm.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LinkInsertDialog from '../../src/components/LinkInsertDialog.vue'

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('LinkInsertDialog.vue', () => {
    it('renders nothing when open=false', () => {
        const wrapper = mount(LinkInsertDialog, {
            props: { open: false },
        })

        expect(wrapper.find('[data-testid="link-insert-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('pre-fills URL + label inputs on open', async () => {
        const wrapper = mount(LinkInsertDialog, {
            props: {
                open: true,
                initialUrl: 'https://example.com/docs',
                initialLabel: 'Docs',
            },
            attachTo: document.body,
        })
        await flushPromises()

        const url = wrapper.find<HTMLInputElement>('[data-testid="link-insert-url"]')
        const label = wrapper.find<HTMLInputElement>('[data-testid="link-insert-label"]')
        expect((url.element as HTMLInputElement).value).toBe('https://example.com/docs')
        expect((label.element as HTMLInputElement).value).toBe('Docs')
        wrapper.unmount()
    })

    it('disables Insert when URL is empty', async () => {
        const wrapper = mount(LinkInsertDialog, {
            props: { open: true },
            attachTo: document.body,
        })
        await flushPromises()

        const insert = wrapper.find<HTMLButtonElement>('[data-testid="link-insert-confirm"]')
        expect((insert.element as HTMLButtonElement).disabled).toBe(true)
        wrapper.unmount()
    })

    it('confirming emits confirm with { url, label }', async () => {
        const wrapper = mount(LinkInsertDialog, {
            props: { open: true },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find<HTMLInputElement>('[data-testid="link-insert-url"]').setValue('https://example.com')
        await wrapper.find<HTMLInputElement>('[data-testid="link-insert-label"]').setValue('Example')
        await wrapper.find('[data-testid="link-insert-confirm"]').trigger('click')

        const confirm = wrapper.emitted('confirm')
        expect(confirm).toBeDefined()
        expect(confirm![0]![0]).toEqual({ url: 'https://example.com', label: 'Example' })
        wrapper.unmount()
    })

    it('cancel emits cancel', async () => {
        const wrapper = mount(LinkInsertDialog, {
            props: { open: true },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="link-insert-cancel"]').trigger('click')

        expect(wrapper.emitted('cancel')).toBeDefined()
        wrapper.unmount()
    })

    it('Close button emits cancel', async () => {
        const wrapper = mount(LinkInsertDialog, {
            props: { open: true },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="link-insert-close"]').trigger('click')

        expect(wrapper.emitted('cancel')).toBeDefined()
        wrapper.unmount()
    })
})
