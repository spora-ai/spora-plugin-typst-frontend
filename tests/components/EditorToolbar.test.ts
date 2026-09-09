/**
 * Component tests for EditorToolbar — the sticky formatting
 * toolbar above the Editor's source surface.
 *
 * SourceEditor is stubbed with a tiny shim that records calls
 * to its exposed methods. The toolbar's contract is:
 *
 *   - Renders a button per formatting tool
 *   - On click, reads `getSelection()`, applies the tool, and
 *     calls `replaceSelection(snippet)`
 *   - Re-focuses the editor after insertion (so the next
 *     keystroke lands in the buffer)
 *   - Re-positions the caret at the placeholder's opening
 *     marker when the tool has one (e.g. after `*` for Bold)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EditorToolbar from '../../src/components/EditorToolbar.vue'

interface StubEditor {
    getSelection: () => string | null
    replaceSelection: (text: string) => void
    focus: () => void
    textarea: { selectionStart: number | null; setSelectionRange: (start: number, end: number) => void; focus: () => void } | null
}

function makeStub(initialSelection: string | null): { editorRef: StubEditor | null, stub: StubEditor } {
    const stub: StubEditor = {
        getSelection: vi.fn(() => initialSelection),
        replaceSelection: vi.fn(),
        focus: vi.fn(),
        textarea: {
            selectionStart: 0,
            setSelectionRange: vi.fn(),
            focus: vi.fn(),
        },
    }
    return { editorRef: stub, stub }
}

beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
})

describe('EditorToolbar.vue', () => {
    it('renders a button for each formatting tool', () => {
        const { editorRef } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        expect(wrapper.find('[data-testid="editor-tool-heading"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-bold"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-italic"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-underline"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-link"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('clicking Bold with a selection wraps the selection in *…*', async () => {
        const { editorRef, stub } = makeStub('hello')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-bold"]').trigger('click')

        expect(stub.getSelection).toHaveBeenCalled()
        expect(stub.replaceSelection).toHaveBeenCalledWith('*hello*')
        wrapper.unmount()
    })

    it('clicking Bold with no selection inserts the placeholder', async () => {
        const { editorRef, stub } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-bold"]').trigger('click')

        expect(stub.replaceSelection).toHaveBeenCalledWith('*bold text*')
        wrapper.unmount()
    })

    it('clicking Heading prefixes the selection line-by-line', async () => {
        const { editorRef, stub } = makeStub('first\nsecond')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')

        expect(stub.replaceSelection).toHaveBeenCalledWith('= first\n= second')
        wrapper.unmount()
    })

    it('clicking Underline wraps in #underline[…] (function-call form)', async () => {
        const { editorRef, stub } = makeStub('text')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-underline"]').trigger('click')

        expect(stub.replaceSelection).toHaveBeenCalledWith('#underline[text]')
        wrapper.unmount()
    })

    it('clicking Link wraps the selection in #link("…")[…]', async () => {
        const { editorRef, stub } = makeStub('click me')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')

        expect(stub.replaceSelection).toHaveBeenCalledWith('#link("https://example.com")[click me]')
        wrapper.unmount()
    })

    it('renders the trailing slot when provided', () => {
        const { editorRef } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
            slots: {
                trailing: '<button data-testid="trailing-slot">Insert Template</button>',
            },
        })

        expect(wrapper.find('[data-testid="trailing-slot"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Insert Template')
        wrapper.unmount()
    })
})
