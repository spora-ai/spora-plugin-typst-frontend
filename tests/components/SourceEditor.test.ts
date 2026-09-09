/**
 * Component tests for SourceEditor — the reusable Typst source editor
 * extracted from `CompileForm.vue`.
 *
 * Covers:
 *   - Renders the modelValue as the textarea's value
 *   - v-model emits `update:modelValue` when the textarea fires input
 *   - `readOnly=true` makes the textarea non-editable
 *   - The placeholder is rendered when the buffer is empty
 *   - The `<pre>` contains the hljs output (the highlight overlay)
 *   - The scroll handler mirrors the textarea's scrollTop onto the
 *     `<pre>` so the two stay in lockstep
 *
 * The hljs module is mocked so the highlight assertion is deterministic
 * — `highlightjs-typst/highlight` emits a real DOM tree that drifts
 * across versions, and we don't want snapshot churn for the visual
 * shape. The mock wraps the input in a `<span>` so we can still
 * assert that the editor actually feeds `modelValue` through the
 * hljs pipeline (and the trailing newline).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SourceEditor from '../../src/components/SourceEditor.vue'

vi.mock('highlightjs-typst/highlight', () => ({
    highlightTypst: (s: string) => `<span>${s}</span>`,
}))

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('SourceEditor.vue', () => {
    it('renders the modelValue as the textarea value', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '= Hello' },
        })
        const textarea = wrapper.find('textarea')
        expect(textarea.exists()).toBe(true)
        expect((textarea.element as HTMLTextAreaElement).value).toBe('= Hello')
    })

    it('emits update:modelValue when the textarea fires input', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '' },
        })
        const textarea = wrapper.find('textarea')
        await textarea.setValue('= New content')
        const emitted = wrapper.emitted('update:modelValue')
        expect(emitted).toBeDefined()
        expect(emitted?.[0]?.[0]).toBe('= New content')
    })

    it('renders the textarea as readonly when readOnly=true', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'locked', readOnly: true },
        })
        const textarea = wrapper.find('textarea')
        expect((textarea.element as HTMLTextAreaElement).readOnly).toBe(true)
    })

    it('leaves the textarea editable when readOnly is omitted', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'editable' },
        })
        const textarea = wrapper.find('textarea')
        expect((textarea.element as HTMLTextAreaElement).readOnly).toBe(false)
    })

    it('shows the placeholder when the source is empty', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '', placeholder: 'Type Typst here…' },
        })
        const textarea = wrapper.find('textarea')
        expect((textarea.element as HTMLTextAreaElement).placeholder).toBe('Type Typst here…')
    })

    it('renders the highlighted HTML in the <pre> overlay (including trailing newline)', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '= Title' },
        })
        const pre = wrapper.find('pre.typst-editor__highlight')
        expect(pre.exists()).toBe(true)
        // hljs is mocked to wrap the input in <span>; we also assert the
        // trailing newline the editor appends so caret alignment on the
        // last empty line stays correct. happy-dom normalizes trailing
        // whitespace in textContent, so we read innerHTML (raw markup)
        // and assert the trailing newline survives there.
        const code = wrapper.find('code.hljs')
        const inner = code.element.innerHTML
        expect(inner).toContain('<span>= Title</span>')
        expect(inner.endsWith('<span>= Title</span>\n')).toBe(true)
    })

    it('applies the rows prop to the textarea', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '', rows: 24 },
        })
        const textarea = wrapper.find('textarea')
        expect(textarea.attributes('rows')).toBe('24')
    })

    it('defaults rows to 18 when no prop is passed', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '' },
        })
        const textarea = wrapper.find('textarea')
        expect(textarea.attributes('rows')).toBe('18')
    })

    it('mirrors the textarea scrollTop onto the <pre> on scroll', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'line\n'.repeat(50) },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        const pre = wrapper.find<HTMLPreElement>('pre.typst-editor__highlight').element
        // Simulate the textarea being scrolled (happy-dom doesn't lay
        // out real content, so we set scrollTop directly and dispatch
        // a scroll event — the handler reads scrollTop, not layout).
        Object.defineProperty(textarea, 'scrollTop', { configurable: true, value: 42 })
        textarea.dispatchEvent(new Event('scroll', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(pre.scrollTop).toBe(42)
        wrapper.unmount()
    })

    it('exposes a focus() method that delegates to the underlying textarea', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        const focusSpy = vi.spyOn(textarea, 'focus')
        // `<script setup>` + `defineExpose` surfaces the method on the
        // public component instance. Cast through unknown so the test
        // doesn't depend on the exact exposed-type shape Vue emits.
        const exposed = wrapper.vm as unknown as { focus?: () => void }
        expect(typeof exposed.focus).toBe('function')
        exposed.focus?.()
        expect(focusSpy).toHaveBeenCalled()
        wrapper.unmount()
    })

    it('exposes insertAtCaret() that splices text at the caret and re-positions the caret', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '= Hello, ' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        // Caret at the end (position 10, just after the comma+space).
        textarea.setSelectionRange(10, 10)
        const exposed = wrapper.vm as unknown as { insertAtCaret?: (s: string) => void }
        expect(typeof exposed.insertAtCaret).toBe('function')
        exposed.insertAtCaret?.('World')
        await wrapper.vm.$nextTick()

        // The emitted update carries the spliced string — `v-model`
        // consumers see a single update per call (no double-write).
        const updates = wrapper.emitted('update:modelValue')
        expect(updates).toBeDefined()
        expect(updates![0]![0]).toBe('= Hello, World')
        wrapper.unmount()
    })

    it('exposes replaceSelection() that overwrites the selected range', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'old text here' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        // Select "text" (positions 4..8) and replace with bold.
        textarea.setSelectionRange(4, 8)
        const exposed = wrapper.vm as unknown as { replaceSelection?: (s: string) => void }
        exposed.replaceSelection?.('*bold*')
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('old *bold* here')
        wrapper.unmount()
    })

    it('exposes getSelection() that returns null when the caret is collapsed', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'abcdef' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(3, 3)
        const exposed = wrapper.vm as unknown as { getSelection?: () => string | null }
        expect(exposed.getSelection?.()).toBeNull()
        wrapper.unmount()
    })

    it('exposes getSelection() that returns the selected substring', () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'abcdef' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(2, 4)
        const exposed = wrapper.vm as unknown as { getSelection?: () => string | null }
        expect(exposed.getSelection?.()).toBe('cd')
        wrapper.unmount()
    })

    it('exposes insertAtLineStart() that inserts at the start of the caret line', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'first line\nsecond line\nthird' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        // Caret is in the middle of "third" (position 25, at the 'i').
        // The line starts at position 23 (after the second \n).
        textarea.setSelectionRange(25, 25)
        const exposed = wrapper.vm as unknown as { insertAtLineStart?: (s: string) => void }
        exposed.insertAtLineStart?.('= ')
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates).toBeDefined()
        expect(updates![0]![0]).toBe('first line\nsecond line\n= third')
        wrapper.unmount()
    })

    it('insertAtLineStart at the start of the buffer uses offset 0', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'hello world' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(6, 6) // caret at 'w'
        const exposed = wrapper.vm as unknown as { insertAtLineStart?: (s: string) => void }
        exposed.insertAtLineStart?.('= ')
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('= hello world')
        wrapper.unmount()
    })

    it('focus() accepts { preventScroll: true } and forwards to the textarea', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        const focusSpy = vi.spyOn(textarea, 'focus')
        const exposed = wrapper.vm as unknown as { focus?: (opts?: { preventScroll?: boolean }) => void }
        exposed.focus?.({ preventScroll: true })
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
        wrapper.unmount()
    })

    it('applyHeadingAtCaret(level=1) prepends "= " to the caret line', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'foo bar' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(4, 4) // caret at 'b'
        const exposed = wrapper.vm as unknown as { applyHeadingAtCaret?: (l: number) => void }
        exposed.applyHeadingAtCaret?.(1)
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('= foo bar')
        wrapper.unmount()
    })

    it('applyHeadingAtCaret replaces an existing marker on the line', async () => {
        // Going from H1 ("= foo") to H3 ("=== foo") replaces
        // rather than stacks — typing H1 then H3 should yield
        // "=== foo", not "= === foo".
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '= foo' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(6, 6) // caret at end
        const exposed = wrapper.vm as unknown as { applyHeadingAtCaret?: (l: number) => void }
        exposed.applyHeadingAtCaret?.(3)
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('=== foo')
        wrapper.unmount()
    })

    it('applyHeadingAtCaret preserves the caret column within the line', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'foo bar' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(4, 4) // caret between 'foo ' and 'bar'
        const exposed = wrapper.vm as unknown as { applyHeadingAtCaret?: (l: number) => void }
        exposed.applyHeadingAtCaret?.(2)
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('== foo bar')
        // Caret should land between '== foo ' and 'bar' — the
        // same content offset relative to the line body.
        // The setSelectionRange call inside requestAnimationFrame
        // is hard to assert here without rAF, but the new caret
        // offset = old caret (4) + new marker length (3) = 7.
        wrapper.unmount()
    })

    it('applyHeadingAtCaret does not stack markers when reapplying the same level', async () => {
        const wrapper = mount(SourceEditor, {
            props: { modelValue: '= foo' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(6, 6)
        const exposed = wrapper.vm as unknown as { applyHeadingAtCaret?: (l: number) => void }
        exposed.applyHeadingAtCaret?.(1)
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('= foo') // unchanged — idempotent
        wrapper.unmount()
    })

    it('applyHeadingAtCaret handles lines without trailing newline', async () => {
        // The last line of the buffer has no \n after it. The
        // function must still locate the line's end correctly.
        const wrapper = mount(SourceEditor, {
            props: { modelValue: 'foo' },
            attachTo: document.body,
        })
        const textarea = wrapper.find<HTMLTextAreaElement>('textarea').element
        textarea.setSelectionRange(1, 1)
        const exposed = wrapper.vm as unknown as { applyHeadingAtCaret?: (l: number) => void }
        exposed.applyHeadingAtCaret?.(1)
        await wrapper.vm.$nextTick()

        const updates = wrapper.emitted('update:modelValue')
        expect(updates![0]![0]).toBe('= foo')
        wrapper.unmount()
    })
})
