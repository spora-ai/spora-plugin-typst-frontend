/**
 * Component tests for FontList — verifies the principal/skill
 * two-section partition and the per-row "Use in Typst" embed
 * snippet. The previous incarnation rendered all fonts in a flat
 * list in API order, which buried a single uploaded font among
 * the bundled entries. The new shape mirrors TemplateList /
 * ExampleList: principal uploads on top with a default card
 * background, then a "Built-in" divider row, then the skill-shipped
 * fonts on a muted background.
 *
 * The test stubs `navigator.clipboard.writeText` (which is not
 * available under happy-dom) so the Copy button's click handler
 * can be exercised without falling back to the textarea path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { setApi } from '../../src/api/client'
import { useResourceStore } from '../../src/stores/resources'
import FontList from '../../src/components/FontList.vue'
import type { FontResource } from '../../src/types'

const font = (overrides: Partial<FontResource>): FontResource => ({
    name: 'Inter-Regular.otf',
    kind: 'font',
    origin: 'skill',
    size: 100_000,
    modified_at: 1_700_000_000,
    ...overrides,
})

function makeStubApi(): void {
    setApi({
        get: <T = unknown>(): Promise<T> => Promise.resolve({ fonts: [] } as T),
        post: <T = unknown>(): Promise<T> => Promise.resolve({} as T),
        put: <T = unknown>(): Promise<T> => Promise.resolve({} as T),
        patch: <T = unknown>(): Promise<T> => Promise.resolve({} as T),
        delete: <T = unknown>(): Promise<T> => Promise.resolve(undefined as T),
    })
}

beforeEach(() => {
    setActivePinia(createPinia())
    makeStubApi()
    // happy-dom does not expose navigator.clipboard; the textarea
    // fallback in copyToClipboard() requires document.body which
    // exists, so the easiest path is to stub writeText directly.
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
})

describe('FontList.vue', () => {
    it('renders principal fonts above skill-shipped fonts with a divider between them', async () => {
        const store = useResourceStore()
        store.fonts = [
            font({ name: 'DMSerifDisplay-Regular.ttf', origin: 'principal', size: 72_192 }),
            font({ name: 'DejaVuSans.ttf', origin: 'skill' }),
            font({ name: 'Inter-Regular.otf', origin: 'skill' }),
        ]

        const wrapper = mount(FontList)
        const rows = wrapper.findAll('tbody tr')
        // 1 principal row + 1 divider row + 2 skill rows.
        expect(rows.length).toBe(4)

        // The first row is the principal upload.
        expect(rows[0]!.text()).toContain('DMSerifDisplay-Regular.ttf')
        expect(rows[0]!.text()).toContain('Principal')

        // The divider row sits between the two sections and labels
        // the section underneath as "Built-in".
        expect(rows[1]!.text()).toContain('Built-in')

        // The remaining rows are the skill-shipped fonts in
        // alphabetical order (DejaVuSans before Inter-Regular).
        expect(rows[2]!.text()).toContain('DejaVuSans.ttf')
        expect(rows[2]!.text()).toContain('Skill-shipped')
        expect(rows[3]!.text()).toContain('Inter-Regular.otf')

        // The skill rows expose no destructive action; the operator
        // gets the read-only "Built-in" affordance instead.
        expect(rows[2]!.text()).toContain('Built-in')
        expect(rows[3]!.text()).toContain('Built-in')

        // The principal row exposes the Delete affordance.
        expect(rows[0]!.text()).toContain('Delete')
    })

    it('omits the Built-in divider when there are no skill-shipped fonts', () => {
        const store = useResourceStore()
        store.fonts = [font({ name: 'Custom.otf', origin: 'principal' })]

        const wrapper = mount(FontList)
        const rows = wrapper.findAll('tbody tr')
        expect(rows.length).toBe(1)
        expect(rows[0]!.text()).toContain('Custom.otf')
        expect(wrapper.text()).not.toContain('Built-in')
    })

    it('renders the embed snippet for every font using the basename (no extension)', () => {
        const store = useResourceStore()
        store.fonts = [
            font({ name: 'DMSerifDisplay-Regular.ttf', origin: 'principal' }),
            font({ name: 'Inter-Regular.otf', origin: 'skill' }),
            font({ name: 'latinmodern-math.otf', origin: 'skill' }),
            font({ name: 'LobsterTwo-Bold.woff2', origin: 'principal' }),
        ]

        const wrapper = mount(FontList)
        const codes = wrapper.findAll('code').map((c) => c.text().trim())
        // The snippet drops the extension so the operator can paste
        // it into Typst directly — `font_dirs` already includes the
        // directory, so the basename is enough.
        expect(codes).toContain('#set text(font: "DMSerifDisplay-Regular")')
        expect(codes).toContain('#set text(font: "Inter-Regular")')
        expect(codes).toContain('#set text(font: "latinmodern-math")')
        expect(codes).toContain('#set text(font: "LobsterTwo-Bold")')
    })

    it('copies the embed snippet to the clipboard when the Copy button is clicked', async () => {
        const store = useResourceStore()
        store.fonts = [font({ name: 'Custom.otf', origin: 'principal' })]

        const wrapper = mount(FontList)
        const copyButton = wrapper.find('button[aria-label="Copy Typst snippet for Custom.otf"]')
        expect(copyButton.exists()).toBe(true)

        await copyButton.trigger('click')

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('#set text(font: "Custom")')
        // The button label flips to "Copied" on success.
        expect(copyButton.text()).toBe('Copied')
    })
})
