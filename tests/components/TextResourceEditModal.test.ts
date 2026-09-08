/**
 * Component tests for TextResourceEditModal — the shared
 * `<SourceEditor>` wrapper used by the Templates + Examples
 * edit flows.
 *
 * The store is mocked wholesale so the test stays decoupled
 * from the resource store's wiring (and from any templates/
 * examples the parent's onMounted might have pre-fetched).
 * `SourceEditor` is mocked with a thin textarea so the test
 * can drive v-model without the hljs highlight pipeline.
 *
 * Coverage:
 *   - Renders nothing when `open=false`
 *   - Header carries the kind-aware label
 *   - SourceEditor is mounted with `initialContent`
 *   - Save calls the kind-specific store action; on success
 *     emits `saved` with the latest content
 *   - Cancel emits `close`
 *   - store.error renders inline in the destructive style
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import TextResourceEditModal from '../../src/components/TextResourceEditModal.vue'
import type { ExampleResource, TemplateResource } from '../../src/types'

// Mock SourceEditor with a textarea that round-trips v-model
// through update:modelValue. The real SourceEditor has a hljs
// overlay; we don't need it here — the modal's contract is just
// "v-model + rows". `.vue` files import as `default`, so the
// factory must return the stub under the `default` key (not the
// raw component object) or `import SourceEditor from '…'` resolves
// to undefined and Vue throws on the `<SourceEditor>` tag.
vi.mock('../../src/components/SourceEditor.vue', () => ({
    default: {
        name: 'SourceEditor',
        props: ['modelValue', 'rows'],
        emits: ['update:modelValue'],
        template: '<textarea :value="modelValue" :rows="rows" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))

// Per-test store state. The modal reads `store.error`, calls
// `store.updateTemplate` / `store.updateExample` / `store.clearError`,
// and the test reaches in to simulate success + failure paths.
const mockState = {
    error: ref<string | null>(null),
    updateTemplate: vi.fn(),
    updateExample: vi.fn(),
    clearError: vi.fn(),
}

vi.mock('../../src/stores/resources', () => ({
    useResourceStore: () => mockState,
}))

function templateResource(): TemplateResource {
    return { name: 'letter.typ', kind: 'template', origin: 'principal', size: 200, modified_at: 1_700_000_000 }
}

function exampleResource(): ExampleResource {
    return { name: 'headings.typ', kind: 'example', origin: 'principal', size: 80, modified_at: 1_700_000_000 }
}

beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    mockState.error.value = null
    mockState.updateTemplate.mockReset()
    mockState.updateExample.mockReset()
    mockState.clearError.mockReset()
})

describe('TextResourceEditModal.vue', () => {
    it('renders nothing when open=false', () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: false,
                kind: 'template',
                name: 'letter.typ',
                initialContent: '= Hello',
            },
        })

        expect(wrapper.find('[data-testid="text-resource-edit-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('shows the right header label for kind=template', async () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: '= Hello',
            },
            attachTo: document.body,
        })
        await flushPromises()

        const title = wrapper.find('[data-testid="text-resource-edit-title"]')
        expect(title.exists()).toBe(true)
        expect(title.text()).toBe('Edit template: letter.typ')
        wrapper.unmount()
    })

    it('shows the right header label for kind=example', async () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                initialContent: '= Heading',
            },
            attachTo: document.body,
        })
        await flushPromises()

        const title = wrapper.find('[data-testid="text-resource-edit-title"]')
        expect(title.text()).toBe('Edit example: headings.typ')
        wrapper.unmount()
    })

    it('mounts SourceEditor with the initial content as modelValue', () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: '#let x = 1',
            },
        })

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        expect(editor.exists()).toBe(true)
        expect(editor.props('modelValue')).toBe('#let x = 1')
        expect(editor.props('rows')).toBe(22)
        wrapper.unmount()
    })

    it('clicking Save calls updateTemplate for kind=template and emits saved on success', async () => {
        const updated = templateResource()
        mockState.updateTemplate.mockResolvedValueOnce(updated)

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
        })

        // Drive v-model so we can assert the saved payload contains
        // the *new* content, not the initial one.
        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('new content')

        const save = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-save"]')
        await save.trigger('click')
        await flushPromises()

        expect(mockState.updateTemplate).toHaveBeenCalledWith('letter.typ', 'new content')
        expect(mockState.updateExample).not.toHaveBeenCalled()

        const saved = wrapper.emitted('saved')
        expect(saved).toBeDefined()
        expect(saved?.[0]?.[0]).toEqual({ name: 'letter.typ', content: 'new content' })
        wrapper.unmount()
    })

    it('clicking Save calls updateExample for kind=example and emits saved on success', async () => {
        const updated = exampleResource()
        mockState.updateExample.mockResolvedValueOnce(updated)

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                initialContent: 'old',
            },
        })

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('= New heading')

        const save = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-save"]')
        await save.trigger('click')
        await flushPromises()

        expect(mockState.updateExample).toHaveBeenCalledWith('headings.typ', '= New heading')
        expect(mockState.updateTemplate).not.toHaveBeenCalled()

        const saved = wrapper.emitted('saved')
        expect(saved?.[0]?.[0]).toEqual({ name: 'headings.typ', content: '= New heading' })
        wrapper.unmount()
    })

    it('does not emit saved when the store action resolves to null (error path)', async () => {
        mockState.updateTemplate.mockResolvedValueOnce(null)

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
        })

        const save = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-save"]')
        await save.trigger('click')
        await flushPromises()

        expect(wrapper.emitted('saved')).toBeUndefined()
        wrapper.unmount()
    })

    it('clicking Cancel emits close', async () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
        })

        const cancel = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-cancel"]')
        await cancel.trigger('click')

        expect(wrapper.emitted('close')).toBeDefined()
        expect(mockState.updateTemplate).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('renders the store error in the destructive style when present', async () => {
        mockState.error.value = 'Failed to update template.'

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
        })

        const err = wrapper.find('[data-testid="text-resource-edit-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toBe('Failed to update template.')
        expect(err.classes().join(' ')).toContain('text-destructive')
        wrapper.unmount()
    })

    it('locks Cancel + Save while a save is in flight', async () => {
        // Block the in-flight call on a promise we resolve manually
        // so we can observe the mid-save UI before the test ends.
        let resolveSave: (value: TemplateResource | null) => void = () => { /* noop */ }
        mockState.updateTemplate.mockReturnValueOnce(new Promise<TemplateResource | null>((res) => {
            resolveSave = res
        }))

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
        })

        const save = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-save"]')
        await save.trigger('click')
        await flushPromises()

        expect((save.element as HTMLButtonElement).disabled).toBe(true)
        expect(save.text()).toBe('Saving…')

        const cancel = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-cancel"]')
        expect((cancel.element as HTMLButtonElement).disabled).toBe(true)
        // The Close (X) button in the header is also disabled mid-save
        // so the operator can't dismiss the modal while the PUT is
        // in flight.
        const close = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-close"]')
        expect((close.element as HTMLButtonElement).disabled).toBe(true)

        // Settle the in-flight call so unmount doesn't hang on the
        // open promise.
        resolveSave(templateResource())
        await flushPromises()
        wrapper.unmount()
    })

    it('ignores backdrop click while saving', async () => {
        let resolveSave: (value: TemplateResource | null) => void = () => { /* noop */ }
        mockState.updateTemplate.mockReturnValueOnce(new Promise<TemplateResource | null>((res) => {
            resolveSave = res
        }))

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
            attachTo: document.body,
        })
        await flushPromises()

        const save = wrapper.find<HTMLButtonElement>('[data-testid="text-resource-edit-save"]')
        await save.trigger('click')
        await flushPromises()

        // Click the dialog element itself (not a descendant) — this
        // is the backdrop area. The modal's click handler routes
        // those through `close()`, which short-circuits mid-save.
        const dialog = wrapper.find<HTMLDialogElement>('[data-testid="text-resource-edit-dialog"]')
        await dialog.trigger('click')
        await flushPromises()

        expect(wrapper.emitted('close')).toBeUndefined()

        resolveSave(templateResource())
        await flushPromises()
        wrapper.unmount()
    })

    it('emits close on backdrop click when not saving', async () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
            attachTo: document.body,
        })
        await flushPromises()

        const dialog = wrapper.find<HTMLDialogElement>('[data-testid="text-resource-edit-dialog"]')
        await dialog.trigger('click')
        await flushPromises()

        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('emits close on Escape via the document-level keydown handler', async () => {
        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'old',
            },
            attachTo: document.body,
        })
        await flushPromises()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()

        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('clears the store error when the modal opens', async () => {
        mockState.error.value = 'stale error'

        const wrapper = mount(TextResourceEditModal, {
            props: {
                open: true,
                kind: 'template',
                name: 'letter.typ',
                initialContent: 'fresh',
            },
        })
        await flushPromises()

        // The watcher on `open` runs `store.clearError()` on the
        // next-open transition. We open twice to assert the clear
        // path fires; happy-dom mounts with the initial `open`
        // value so the first open doesn't trigger the watcher.
        await wrapper.setProps({ open: false })
        await wrapper.setProps({ open: true })
        await flushPromises()

        expect(mockState.clearError).toHaveBeenCalled()
        wrapper.unmount()
    })
})
