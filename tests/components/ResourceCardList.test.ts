/**
 * Component tests for ResourceCardList — the shared card grid for
 * the Templates and Examples panels.
 *
 * Post-overlay-refactor: cards are thin title-tiles. Clicking a
 * card opens `<ResourceOverlay>` which owns the source viewer +
 * action bar (Edit, Copy as import, Open Copy in Editor, Render,
 * Delete). Tests pin the card → overlay wiring: clicking opens
 * the overlay, the overlay's action buttons bubble events up to
 * the parent, and the source cache is populated before the
 * overlay is shown.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ResourceCardList from '../../src/components/ResourceCardList.vue'
import type { ExampleResource, TemplateResource } from '../../src/types'

const mockState = {
    templates: [] as TemplateResource[],
    examples: [] as ExampleResource[],
    loading: false,
    uploading: false,
    error: null as string | null,
    loadTemplates: vi.fn(),
    loadExamples: vi.fn(),
    loadAll: vi.fn(),
    renderExample: vi.fn(),
    removeTemplate: vi.fn(),
    removeExample: vi.fn(),
}

vi.mock('../../src/stores/resources', () => ({
    useResourceStore: () => mockState,
}))

vi.mock('../../src/api/templates', () => ({
    getTemplate: vi.fn().mockResolvedValue('= Real template source\nbody\n'),
}))
vi.mock('../../src/api/examples', () => ({
    getExample: vi.fn().mockResolvedValue('= Real example source\nbody\n'),
}))

beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    mockState.templates = []
    mockState.examples = []
    mockState.error = null
    mockState.loading = false
    mockState.uploading = false
    mockState.loadTemplates.mockReset()
    mockState.loadExamples.mockReset()
    mockState.loadAll.mockReset()
    mockState.renderExample.mockReset()
    mockState.removeTemplate.mockReset()
    mockState.removeExample.mockReset()
})

describe('ResourceCardList.vue — card + overlay wiring', () => {
    it('clicking a card opens the overlay with the source fetched', async () => {
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()

        const card = wrapper.find('[data-testid="resource-card-invoice.typ"]')
        expect(card.exists()).toBe(true)
        await card.trigger('click')
        await flushPromises()

        // The overlay's dialog mounts once openName is set. We
        // assert via the dialog's testid rather than the dialog's
        // `open` attribute (happy-dom may not surface it the same
        // way as a real browser).
        const overlay = wrapper.find('[data-testid="resource-overlay-dialog"]')
        expect(overlay.exists()).toBe(true)
        const title = wrapper.find('[data-testid="resource-overlay-title"]')
        expect(title.text()).toBe('Template: invoice.typ')
        wrapper.unmount()
    })

    it('the overlay emits "open-in-editor" with <name>-copy.typ filename when clicked', async () => {
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-invoice.typ"]').trigger('click')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-open-copy"]').trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('open-in-editor')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toEqual({
            name: 'invoice.typ',
            kind: 'template',
            content: '= Real template source\nbody\n',
            filename: 'invoice-copy.typ',
        })
        wrapper.unmount()
    })

    it('the overlay emits "open-in-editor" for example cards too', async () => {
        mockState.examples = [{
            name: 'headings.typ',
            kind: 'example',
            origin: 'principal',
            size: 80,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'example',
                emptyText: 'No examples',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-headings.typ"]').trigger('click')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-open-copy"]').trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('open-in-editor')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toEqual({
            name: 'headings.typ',
            kind: 'example',
            content: '= Real example source\nbody\n',
            filename: 'headings-copy.typ',
        })
        wrapper.unmount()
    })

    it('the overlay only renders the Render button for example cards', async () => {
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-invoice.typ"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="resource-overlay-render"]').exists()).toBe(false)
        // Delete + Edit only on principal-tier.
        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-delete"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('the overlay hides Edit + Delete for skill-shipped items', async () => {
        // Pinia store is empty by default; we need a way to seed
        // a skill item. The composable reads `store.templates` so
        // seeding directly works.
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'skill',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-invoice.typ"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="resource-overlay-edit"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="resource-overlay-delete"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('Built-in')
        wrapper.unmount()
    })

    it('the overlay emits close when the Close button is clicked', async () => {
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-invoice.typ"]').trigger('click')
        await flushPromises()

        const close = wrapper.find('[data-testid="resource-overlay-close"]')
        expect(close.exists()).toBe(true)
        await close.trigger('click')
        await flushPromises()

        // After close, the overlay should be unmounted.
        expect(wrapper.find('[data-testid="resource-overlay-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('edit is in-place — Edit does NOT emit an "edit" event to the parent', async () => {
        // Edit handles the PUT and v-model swap inside the overlay
        // itself; no parent coordination needed. The previous
        // stacked-modal design emitted an "edit" event so the
        // parent could open a separate edit modal — that created
        // ambiguous Esc / backdrop behaviour.
        mockState.templates = [{
            name: 'invoice.typ',
            kind: 'template',
            origin: 'principal',
            size: 200,
            modified_at: 1_700_000_000,
        }]

        const wrapper = mount(ResourceCardList, {
            props: {
                kind: 'template',
                emptyText: 'No templates',
                builtInHeadingText: 'Built-in',
            },
        })

        await flushPromises()
        await wrapper.find('[data-testid="resource-card-invoice.typ"]').trigger('click')
        await flushPromises()

        await wrapper.find('[data-testid="resource-overlay-edit"]').trigger('click')
        await flushPromises()

        // No "edit" event ever leaves ResourceCardList.
        expect(wrapper.emitted('edit')).toBeUndefined()
        // The overlay itself is still showing (just in edit mode).
        expect(wrapper.find('[data-testid="resource-overlay-dialog"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="resource-overlay-save"]').exists()).toBe(true)
        wrapper.unmount()
    })
})
