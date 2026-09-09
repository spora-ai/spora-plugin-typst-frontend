/**
 * Component tests for ResourceOverlay — the single-action modal
 * that opens when a Templates / Examples card is clicked.
 *
 * Source editor is stubbed to a plain textarea (the overlay's
 * contract with it is readOnly + modelValue, which is easy to
 * fake). The resource store is mocked so save (PUT) calls can
 * be observed deterministically.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ResourceOverlay from '../../src/components/ResourceOverlay.vue'
import type { RenderedPreview } from '../../src/composables/useResourceCardList'
import type { ExampleResource, TemplateResource } from '../../src/types'

// Stub SourceEditor with a readonly-aware textarea so we don't
// pull in the highlight.js pipeline. The overlay binds
// modelValue + readOnly; v-model updates flow through the
// stub's @input handler.
vi.mock('../../src/components/SourceEditor.vue', () => ({
    default: {
        name: 'SourceEditor',
        props: ['modelValue', 'rows', 'readOnly'],
        emits: ['update:modelValue'],
        template: '<textarea :value="modelValue" :rows="rows" :readonly="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))

const noPreview: RenderedPreview | null = null

const mockStore = {
    templates: [] as TemplateResource[],
    examples: [] as ExampleResource[],
    loading: false,
    uploading: false,
    error: null as string | null,
    updateTemplate: vi.fn(),
    updateExample: vi.fn(),
}

vi.mock('../../src/stores/resources', () => ({
    useResourceStore: () => mockStore,
}))

beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    mockStore.templates = []
    mockStore.examples = []
    mockStore.error = null
    mockStore.loading = false
    mockStore.uploading = false
    mockStore.updateTemplate.mockReset()
    mockStore.updateExample.mockReset()
})

describe('ResourceOverlay.vue — viewing mode (default)', () => {
    it('renders nothing when open=false', () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: false,
                kind: 'template',
                name: 'invoice.typ',
                content: '',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
        })

        expect(wrapper.find('[data-testid="resource-overlay-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('shows the right header title for kind=template', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: '= Hello',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        const title = wrapper.find('[data-testid="resource-overlay-title"]')
        expect(title.text()).toBe('Template: invoice.typ')
        wrapper.unmount()
    })

    it('shows the right header title for kind=example', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: '= Heading',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        const title = wrapper.find('[data-testid="resource-overlay-title"]')
        expect(title.text()).toBe('Example: headings.typ')
        wrapper.unmount()
    })

    it('shows "Your upload" badge for principal-tier and "Built-in" badge for skill-tier', async () => {
        const principal = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()
        expect(principal.text()).toContain('Your upload')
        expect(principal.text()).not.toContain('Built-in')
        principal.unmount()

        const skill = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'skill',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()
        expect(skill.text()).toContain('Built-in')
        expect(skill.text()).not.toContain('Your upload')
        skill.unmount()
    })

    it('hides Edit + Delete buttons for skill-shipped items', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'skill',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="resource-overlay-delete"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('shows the Render button only for examples, not templates', async () => {
        const template = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()
        expect(template.find('[data-testid="resource-overlay-render"]').exists()).toBe(false)
        template.unmount()

        const example = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()
        expect(example.find('[data-testid="resource-overlay-render"]').exists()).toBe(true)
        example.unmount()
    })

    it('emits render when Render button is clicked', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-render"]').trigger('click')
        expect(wrapper.emitted('render')).toBeDefined()
        wrapper.unmount()
    })

    it('emits open-in-editor when the Open Copy in Editor button is clicked', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-open-copy"]').trigger('click')
        expect(wrapper.emitted('open-in-editor')).toBeDefined()
        wrapper.unmount()
    })

    it('emits delete when the Delete button is clicked (principal only)', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-delete"]').trigger('click')
        expect(wrapper.emitted('delete')).toBeDefined()
        wrapper.unmount()
    })

    it('emits close on Escape via the document-level keydown handler', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()

        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })

    it('shows the render result panel when rendered is non-null', async () => {
        const fakeBlobUrl = 'blob:http://localhost/test'
        const preview: RenderedPreview = {
            blobUrl: fakeBlobUrl,
            mime: 'image/png',
            format: 'png',
            width: 800,
            height: 600,
        }
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'x',
                origin: 'principal',
                rendered: preview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        const img = wrapper.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe(fakeBlobUrl)
        expect(wrapper.text()).toContain('Render preview')
        expect(wrapper.text()).toContain('800×600px')
        wrapper.unmount()
    })

    it('shows renderError inline in the destructive style', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: 'compile failed',
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        const err = wrapper.find('[data-testid="resource-overlay-render-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toBe('compile failed')
        expect(err.classes().join(' ')).toContain('text-destructive')
        wrapper.unmount()
    })

    it('disables the Render button while rendering', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'x',
                origin: 'principal',
                rendered: noPreview,
                rendering: true,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        const render = wrapper.find<HTMLButtonElement>('[data-testid="resource-overlay-render"]')
        expect((render.element as HTMLButtonElement).disabled).toBe(true)
        expect(render.text()).toBe('Rendering…')
        wrapper.unmount()
    })

    it('shows the loading state when source is still fetching', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: '',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: true,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.text()).toContain('Loading source…')
        wrapper.unmount()
    })

    it('shows the loadError inline in the destructive style', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: '',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: 'server-said-no',
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.text()).toContain('server-said-no')
        wrapper.unmount()
    })
})

describe('ResourceOverlay.vue — in-place edit', () => {
    it('clicking Edit swaps the header title to "Editing template: …"', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'old',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="resource-overlay-title"]').text()).toBe(
            'Editing template: invoice.typ',
        )
        wrapper.unmount()
    })

    it('clicking Edit swaps the footer to Cancel + Save', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'old',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="resource-overlay-cancel"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-save"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="resource-overlay-delete"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="resource-overlay-open-copy"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('does NOT enter edit mode for skill-tier items', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'x',
                origin: 'skill',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        // Edit button not present at all → no edit affordance for
        // skill items.
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('Cancel restores the original content and exits edit mode', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'original',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        // Type new content into the SourceEditor stub.
        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('changed')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-cancel"]').trigger('click')
        await flushPromises()

        // Back in viewing mode, footer shows the action bar.
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-cancel"]').exists()).toBe(false)
        // The SourceEditor's modelValue reflects `props.content`
        // (the original), not the cancelled buffer.
        expect(editor.props('modelValue')).toBe('original')
        wrapper.unmount()
    })

    it('Save PUTs the new content and emits "saved" with { name, content }', async () => {
        const updated: TemplateResource = {
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }
        mockStore.updateTemplate.mockResolvedValueOnce(updated)

        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'original',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('new content')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-save"]').trigger('click')
        await flushPromises()

        expect(mockStore.updateTemplate).toHaveBeenCalledWith('invoice.typ', 'new content')
        const saved = wrapper.emitted('saved')
        expect(saved).toBeDefined()
        expect(saved![0]![0]).toEqual({ name: 'invoice.typ', content: 'new content' })
        // Exited edit mode after save.
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('Save routes to updateExample when kind is "example"', async () => {
        const updated: ExampleResource = {
            name: 'headings.typ',
            kind: 'example',
            origin: 'principal',
            size: 80,
            modified_at: 1_700_000_000,
        }
        mockStore.updateExample.mockResolvedValueOnce(updated)

        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'example',
                name: 'headings.typ',
                content: 'old',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('= New heading')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-save"]').trigger('click')
        await flushPromises()

        expect(mockStore.updateExample).toHaveBeenCalledWith('headings.typ', '= New heading')
        expect(mockStore.updateTemplate).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('Save surfaces the store error and keeps edit mode open', async () => {
        mockStore.updateTemplate.mockResolvedValueOnce(null)
        mockStore.error = 'server-said-no'

        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'old',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('new content')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-save"]').trigger('click')
        await flushPromises()

        const err = wrapper.find('[data-testid="resource-overlay-save-error"]')
        expect(err.exists()).toBe(true)
        expect(err.text()).toBe('server-said-no')
        // Stayed in edit mode so the operator can fix and retry.
        expect(wrapper.find('[data-testid="resource-overlay-save"]').exists()).toBe(true)
        expect(wrapper.emitted('saved')).toBeUndefined()
        wrapper.unmount()
    })

    it('Save is disabled while the buffer matches the original content', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'original',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const save = wrapper.find<HTMLButtonElement>('[data-testid="resource-overlay-save"]')
        expect((save.element as HTMLButtonElement).disabled).toBe(true)
        wrapper.unmount()
    })

    it('Switching to a different name while editing resets edit mode', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'a',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('changed')
        await flushPromises()

        // Parent swaps to a different name.
        await wrapper.setProps({ name: 'letter.typ', content: 'b' })
        await flushPromises()

        // Edit mode exited, content reflects the new name.
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-cancel"]').exists()).toBe(false)
        expect(editor.props('modelValue')).toBe('b')
        wrapper.unmount()
    })

    it('Closing while editing discards the unsaved buffer', async () => {
        const wrapper = mount(ResourceOverlay, {
            props: {
                open: true,
                kind: 'template',
                name: 'invoice.typ',
                content: 'original',
                origin: 'principal',
                rendered: noPreview,
                rendering: false,
                renderError: null,
                loading: false,
                loadError: null,
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        const editor = wrapper.findComponent({ name: 'SourceEditor' })
        await editor.setValue('changed')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-close"]').trigger('click')
        await flushPromises()

        // The PUT must not have fired — close should not save.
        expect(mockStore.updateTemplate).not.toHaveBeenCalled()
        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })
})
