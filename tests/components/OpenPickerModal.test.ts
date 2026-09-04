/**
 * Component tests for the open picker modal — verifies the kind
 * chip row, the per-kind filter, and the kind-aware empty state.
 *
 * The previous shape filtered the listing server-side to
 * `tool_name='typst.playground'`; the modal now consumes the
 * union and lets the operator scope to one pool at a time via
 * the chip row. Per-kind counts come from the parent so chip
 * switches don't refetch.
 *
 * Test setup note: the modal uses `<Teleport to="body">` to
 * escape overflow contexts, and `attachTo: document.body`
 * ensures the teleported subtree is reachable via querySelector.
 * Test assertions reach into `document.body` rather than the
 * wrapper's HTML because the teleported fragment isn't in the
 * wrapper's element tree.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OpenPickerModal from '../../src/components/OpenPickerModal.vue'
import type { PlaygroundSourceKind, PlaygroundSourceSummary } from '../../src/types'

const KIND_COUNTS_EMPTY: Record<PlaygroundSourceKind, number> = {
    saved: 0,
    generated: 0,
    uploaded: 0,
    other: 0,
}

function summary(overrides: Partial<PlaygroundSourceSummary>): PlaygroundSourceSummary {
    return {
        id: overrides.id ?? 'src-1',
        filename: overrides.filename ?? 'letter.typ',
        byte_size: overrides.byte_size ?? 100,
        kind: overrides.kind ?? 'saved',
        created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
        updated_at: overrides.updated_at ?? '2026-01-02T00:00:00Z',
    }
}

function kindCountsFromSources(rows: PlaygroundSourceSummary[]): Record<PlaygroundSourceKind, number> {
    const out: Record<PlaygroundSourceKind, number> = { saved: 0, generated: 0, uploaded: 0, other: 0 }
    for (const row of rows) {
        out[row.kind] += 1
    }
    return out
}

beforeEach(() => {
    // Reset <dialog> state between tests. The modal uses
    // `<Teleport to="body">` to escape any parent overflow, so
    // every test has to clear `document.body` before mounting or
    // the previous dialog stays mounted and pollutes the assertions.
    document.body.innerHTML = ''
})

describe('OpenPickerModal — kind chip row', () => {
    it('renders four kind chips with the correct counts', async () => {
        const sources: PlaygroundSourceSummary[] = [
            summary({ id: 's-1', filename: 'letter.typ', kind: 'saved' }),
            summary({ id: 'g-1', filename: 'invoice.typ', kind: 'generated' }),
            summary({ id: 'g-2', filename: 'cover.typ', kind: 'generated' }),
            summary({ id: 'u-1', filename: 'uploaded.typ', kind: 'uploaded' }),
        ]
        const counts = kindCountsFromSources(sources)

        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources,
                loading: false,
                kind: 'all',
                kindCounts: counts,
            },
            attachTo: document.body,
        })

        await flushPromises()

        const chips = document.body.querySelectorAll('[role="tab"]')
        expect(chips).toHaveLength(4)

        const labels = Array.from(chips).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
        expect(labels[0]).toContain('All')
        expect(labels[1]).toContain('Saved')
        expect(labels[2]).toContain('Generated')
        expect(labels[3]).toContain('Uploaded')

        // Per-kind counts come from the prop. The "All" chip shows the
        // union (4), not a per-kind number.
        expect(labels[0]).toContain('4')
        expect(labels[1]).toContain('1')
        expect(labels[2]).toContain('2')
        expect(labels[3]).toContain('1')
        wrapper.unmount()
    })

    it('emits change-kind when a non-active chip is clicked', async () => {
        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources: [
                    summary({ id: 's-1', kind: 'saved' }),
                    summary({ id: 'g-1', kind: 'generated' }),
                ],
                loading: false,
                kind: 'all',
                kindCounts: kindCountsFromSources([
                    summary({ kind: 'saved' }),
                    summary({ kind: 'generated' }),
                ]),
            },
            attachTo: document.body,
        })

        await flushPromises()

        const chip = document.body.querySelector<HTMLButtonElement>('[data-testid="open-picker-kind-generated"]')
        expect(chip).not.toBeNull()
        chip?.click()

        const emitted = wrapper.emitted('change-kind')
        expect(emitted).toBeDefined()
        expect(emitted?.[0]?.[0]).toBe('generated')
        wrapper.unmount()
    })

    it('does not emit change-kind when the active chip is clicked (idempotent)', async () => {
        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources: [summary({ id: 's-1', kind: 'saved' })],
                loading: false,
                kind: 'saved',
                kindCounts: kindCountsFromSources([summary({ kind: 'saved' })]),
            },
            attachTo: document.body,
        })

        await flushPromises()

        const chip = document.body.querySelector<HTMLButtonElement>('[data-testid="open-picker-kind-saved"]')
        chip?.click()

        expect(wrapper.emitted('change-kind')).toBeUndefined()
        wrapper.unmount()
    })
})

describe('OpenPickerModal — kind filter', () => {
    it('filters the rendered list to the active kind chip', async () => {
        const sources: PlaygroundSourceSummary[] = [
            summary({ id: 's-1', filename: 'letter.typ', kind: 'saved' }),
            summary({ id: 'g-1', filename: 'invoice.typ', kind: 'generated' }),
            summary({ id: 'g-2', filename: 'cover.typ', kind: 'generated' }),
        ]

        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources,
                loading: false,
                kind: 'generated',
                kindCounts: kindCountsFromSources(sources),
            },
            attachTo: document.body,
        })

        await flushPromises()

        const rows = document.body.querySelectorAll('[data-source-id]')
        expect(rows).toHaveLength(2)
        expect(rows[0]?.getAttribute('data-source-kind')).toBe('generated')
        expect(rows[1]?.getAttribute('data-source-kind')).toBe('generated')
        wrapper.unmount()
    })

    it('combines the search input with the kind chip filter', async () => {
        const sources: PlaygroundSourceSummary[] = [
            summary({ id: 's-1', filename: 'letter.typ', kind: 'saved' }),
            summary({ id: 'g-1', filename: 'invoice.typ', kind: 'generated' }),
            summary({ id: 'g-2', filename: 'invoice-v2.typ', kind: 'generated' }),
        ]

        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources,
                loading: false,
                kind: 'generated',
                kindCounts: kindCountsFromSources(sources),
            },
            attachTo: document.body,
        })

        await flushPromises()

        const search = document.body.querySelector<HTMLInputElement>('input#open-picker-search')
        expect(search).not.toBeNull()
        if (search !== null) {
            search.value = 'invoice.'
            search.dispatchEvent(new Event('input', { bubbles: true }))
        }
        await flushPromises()

        const rows = document.body.querySelectorAll('[data-source-id]')
        expect(rows).toHaveLength(1)
        expect(rows[0]?.textContent ?? '').toContain('invoice.typ')
        wrapper.unmount()
    })
})

describe('OpenPickerModal — empty state', () => {
    it('shows the kind-specific message when the source list is empty', async () => {
        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources: [],
                loading: false,
                kind: 'generated',
                kindCounts: KIND_COUNTS_EMPTY,
            },
            attachTo: document.body,
        })

        await flushPromises()

        const empty = document.body.querySelector('[data-testid="open-picker-empty-all"]')
        expect(empty).not.toBeNull()
        expect(empty?.textContent ?? '').toContain('No LLM-generated .typ files yet.')
        wrapper.unmount()
    })

    it('shows the union copy on the All chip when the source list is empty', async () => {
        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources: [],
                loading: false,
                kind: 'all',
                kindCounts: KIND_COUNTS_EMPTY,
            },
            attachTo: document.body,
        })

        await flushPromises()

        const empty = document.body.querySelector('[data-testid="open-picker-empty-all"]')
        expect(empty).not.toBeNull()
        expect(empty?.textContent ?? '').toContain('No .typ files owned by this principal yet.')
        wrapper.unmount()
    })

    it('shows the kind-specific message when the active chip has zero rows but other pools are non-empty', async () => {
        const sources: PlaygroundSourceSummary[] = [
            summary({ id: 's-1', filename: 'letter.typ', kind: 'saved' }),
        ]
        const wrapper = mount(OpenPickerModal, {
            props: {
                open: true,
                sources,
                loading: false,
                kind: 'uploaded',
                kindCounts: kindCountsFromSources(sources),
            },
            attachTo: document.body,
        })

        await flushPromises()

        const filtered = document.body.querySelector('[data-testid="open-picker-empty-filtered"]')
        expect(filtered).not.toBeNull()
        expect(filtered?.textContent ?? '').toContain('No uploaded .typ files yet.')
        wrapper.unmount()
    })
})
