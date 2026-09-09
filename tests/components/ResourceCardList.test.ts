/**
 * Component tests for ResourceCardList — the shared card grid for
 * the Templates and Examples panels.
 *
 * The composable underneath (`useResourceCardList`) is tested in
 * isolation. The component tests here focus on the wiring that
 * sits ABOVE the composable: that the Edit button awaits source
 * fetching before emitting, and that the edit event payload
 * carries the real (not empty) source bytes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ResourceCardList from '../../src/components/ResourceCardList.vue'
import type { ExampleResource, TemplateResource } from '../../src/types'

/**
 * Mutable holder for the store mock. We use a Pinia store with
 * refs so the composable's destructuring (`const { loading } = store`)
 * yields unwrapped values via Pinia's proxy — exactly like the
 * real `useResourceStore()`. The test mutates these refs to drive
 * the composable's UI states.
 */
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
})

describe('ResourceCardList.vue — Edit affordance', () => {
    it('awaits source fetch before emitting edit, so the modal opens with real bytes', async () => {
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

        const edit = wrapper.findAll('button').find((b) => b.text() === 'Edit')
        expect(edit).toBeDefined()
        await edit!.trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('edit')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toEqual({
            name: 'invoice.typ',
            kind: 'template',
            content: '= Real template source\nbody\n',
        })
        wrapper.unmount()
    })
})

describe('ResourceCardList.vue — Open Copy in Editor', () => {
    it('renders the button on a template card and emits with <name>-copy.typ filename', async () => {
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

        const openCopy = wrapper
            .findAll('button')
            .find((b) => b.text() === 'Open Copy in Editor')
        expect(openCopy).toBeDefined()
        await openCopy!.trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('open-in-editor')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toEqual({
            name: 'invoice.typ',
            content: '= Real template source\nbody\n',
            filename: 'invoice-copy.typ',
        })
        wrapper.unmount()
    })

    it('renders the button on an example card', async () => {
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

        const openCopy = wrapper
            .findAll('button')
            .find((b) => b.text() === 'Open Copy in Editor')
        expect(openCopy).toBeDefined()
        await openCopy!.trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('open-in-editor')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toEqual({
            name: 'headings.typ',
            content: '= Real example source\nbody\n',
            filename: 'headings-copy.typ',
        })
        wrapper.unmount()
    })
})
