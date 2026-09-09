/**
 * Component tests for ResourceOverlay — the single-action modal
 * that opens when a Templates / Examples card is clicked.
 *
 * Source editor is stubbed to a plain textarea (the overlay's
 * contract with it is readOnly + modelValue, which is easy to
 * fake). The composable's source + render caches are mocked
 * separately because the overlay reads them through props —
 * no composable call happens inside the component itself.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ResourceOverlay from '../../src/components/ResourceOverlay.vue'
import type { RenderedPreview } from '../../src/composables/useResourceCardList'

// Stub SourceEditor with a readonly textarea so we don't pull in
// the highlight.js pipeline. The overlay binds modelValue + rows
// and forces readOnly=true; the stub mirrors both.
vi.mock('../../src/components/SourceEditor.vue', () => ({
    default: {
        name: 'SourceEditor',
        props: ['modelValue', 'rows', 'readOnly'],
        template: '<textarea :value="modelValue" :rows="rows" :readonly="readOnly" />',
    },
}))

const noPreview: RenderedPreview | null = null

beforeEach(() => {
    document.body.innerHTML = ''
    if (!('__sporaClipboardSilenced__' in navigator)) {
        // happy-dom's navigator.clipboard.writeText rejects; the
        // overlay's copy handler catches and tries the execCommand
        // fallback (which also fails). The tests that exercise the
        // Copy path just assert the click handler is wired — the
        // actual write failure is silenced here so the test output
        // stays clean.
        // eslint-disable-next-line no-underscore-dangle
        ;(navigator as unknown as { __sporaClipboardSilenced__: true }).__sporaClipboardSilenced__ = true
    }
})

describe('ResourceOverlay.vue', () => {
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

    it('emits edit on Edit click, but only for principal-tier', async () => {
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

        await principal.find('[data-testid="resource-overlay-edit"]').trigger('click')
        expect(principal.emitted('edit')).toBeDefined()
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

        // Edit button should not be present at all for skill items.
        expect(skill.find('[data-testid="resource-overlay-edit"]').exists()).toBe(false)
        expect(skill.emitted('edit')).toBeUndefined()
        skill.unmount()
    })

    it('emits delete on Delete click, but only for principal-tier', async () => {
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

        await principal.find('[data-testid="resource-overlay-delete"]').trigger('click')
        expect(principal.emitted('delete')).toBeDefined()
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

        expect(skill.find('[data-testid="resource-overlay-delete"]').exists()).toBe(false)
        skill.unmount()
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
})
