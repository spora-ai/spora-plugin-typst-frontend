/**
 * Component tests for EditorToolbar — the sticky formatting
 * toolbar above the Editor's source surface.
 *
 * SourceEditor is stubbed with a tiny shim that records calls
 * to its exposed methods. The toolbar's contract is:
 *
 *   - Renders a button per formatting tool
 *   - On click, reads `getSelection()`, applies the tool, and
 *     calls `insertAtCaret(snippet)`
 *   - Re-focuses the editor after insertion (so the next
 *     keystroke lands in the buffer)
 *   - Re-positions the caret at the placeholder's opening
 *     marker when the tool has one (e.g. after `*` for Bold)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EditorToolbar from '../../src/components/EditorToolbar.vue'

interface StubEditor {
    getSelection: () => string | null
    insertAtCaret: (text: string) => void
    insertAtLineStart: (text: string) => void
    applyHeadingAtCaret: (level: number) => void
    focus: (opts?: { preventScroll?: boolean }) => void
    textarea: { selectionStart: number | null; setSelectionRange: (start: number, end: number) => void; focus: () => void } | null
}

function makeStub(initialSelection: string | null): { editorRef: StubEditor | null, stub: StubEditor } {
    const stub: StubEditor = {
        getSelection: vi.fn(() => initialSelection),
        insertAtCaret: vi.fn(),
        insertAtLineStart: vi.fn(),
        applyHeadingAtCaret: vi.fn(),
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

        // HeadingMenu handles the heading trigger; the toolbar's
        // own tool list now starts at Bold (Heading was lifted to
        // a separate component because H1-H5 needs a popover).
        expect(wrapper.find('[data-testid="editor-tool-heading"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-bold"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-italic"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-underline"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="editor-tool-link"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('clicking a level in the HeadingMenu popover calls applyHeadingAtCaret on the editor', async () => {
        const { editorRef, stub } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
            attachTo: document.body,
        })
        await flushPromises()

        // Open the popover.
        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()

        // Pick H3.
        await wrapper.find('[data-testid="heading-level-3"]').trigger('click')
        await flushPromises()

        expect(stub.applyHeadingAtCaret).toHaveBeenCalledWith(3)
        // Popover closes after pick.
        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('clicking Bold with a selection wraps the selection in *…*', async () => {
        const { editorRef, stub } = makeStub('hello')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-bold"]').trigger('click')

        expect(stub.getSelection).toHaveBeenCalled()
        expect(stub.insertAtCaret).toHaveBeenCalledWith('*hello*')
        wrapper.unmount()
    })

    it('clicking Bold with no selection inserts the placeholder', async () => {
        const { editorRef, stub } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-bold"]').trigger('click')

        expect(stub.insertAtCaret).toHaveBeenCalledWith('*bold text*')
        wrapper.unmount()
    })

    it('clicking Underline wraps in #underline[…] (function-call form)', async () => {
        const { editorRef, stub } = makeStub('text')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-underline"]').trigger('click')

        expect(stub.insertAtCaret).toHaveBeenCalledWith('#underline[text]')
        wrapper.unmount()
    })

    it('clicking Link opens a dialog pre-filled with the selection as label', async () => {
        const { editorRef, stub } = makeStub('click me')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')
        await flushPromises()

        // Dialog should be open with the selection as the label.
        const dialog = wrapper.find('[data-testid="link-insert-dialog"]')
        expect(dialog.exists()).toBe(true)
        const label = wrapper.find<HTMLInputElement>('[data-testid="link-insert-label"]')
        expect((label.element as HTMLInputElement).value).toBe('click me')

        // No insertion happens until the operator confirms.
        expect(stub.insertAtCaret).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('clicking Link with no selection pre-fills "label" placeholder', async () => {
        const { editorRef } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')
        await flushPromises()

        const label = wrapper.find<HTMLInputElement>('[data-testid="link-insert-label"]')
        expect((label.element as HTMLInputElement).value).toBe('label')
        wrapper.unmount()
    })

    it('confirming the link dialog inserts #link("URL")[LABEL]', async () => {
        const { editorRef, stub } = makeStub('click me')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
            attachTo: document.body,
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')
        await flushPromises()

        await wrapper.find<HTMLInputElement>('[data-testid="link-insert-url"]').setValue('https://example.com/docs')
        await wrapper.find('[data-testid="link-insert-confirm"]').trigger('click')
        await flushPromises()

        expect(stub.insertAtCaret).toHaveBeenCalledWith('#link("https://example.com/docs")[click me]')
        // Dialog closes on confirm.
        expect(wrapper.find('[data-testid="link-insert-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('cancelling the link dialog closes it without inserting', async () => {
        const { editorRef, stub } = makeStub('click me')
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
            attachTo: document.body,
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')
        await flushPromises()

        await wrapper.find('[data-testid="link-insert-cancel"]').trigger('click')
        await flushPromises()

        expect(stub.insertAtCaret).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="link-insert-dialog"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('confirming with empty label falls back to "label" placeholder', async () => {
        const { editorRef, stub } = makeStub(null)
        const wrapper = mount(EditorToolbar, {
            props: { editorRef },
            attachTo: document.body,
        })

        await wrapper.find('[data-testid="editor-tool-link"]').trigger('click')
        await flushPromises()

        await wrapper.find<HTMLInputElement>('[data-testid="link-insert-url"]').setValue('https://example.com')
        // Leave label empty.
        await wrapper.find('[data-testid="link-insert-confirm"]').trigger('click')
        await flushPromises()

        expect(stub.insertAtCaret).toHaveBeenCalledWith('#link("https://example.com")[label]')
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
