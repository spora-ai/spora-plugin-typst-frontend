/**
 * Component tests for HeadingMenu — the toolbar trigger button
 * + popover that picks H1-H5 for the caret's line.
 *
 * The menu's contract:
 *   - Trigger button shows "Heading" or "H<n>" depending on
 *     the caret's current level
 *   - Click trigger → popover opens, 5 level buttons render
 *   - Click a level → emits `insert` with the level, closes
 *   - Esc closes (and returns focus to trigger)
 *   - Click outside closes
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HeadingMenu from '../../src/components/HeadingMenu.vue'

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('HeadingMenu.vue', () => {
    it('renders the trigger button with "Heading" when currentLevel is null', () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
        })

        expect(wrapper.find('[data-testid="editor-tool-heading"]').text()).toContain('Heading')
        wrapper.unmount()
    })

    it('renders the trigger button with "H<n>" when currentLevel is set', () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: 3 },
        })

        expect(wrapper.find('[data-testid="editor-tool-heading"]').text()).toContain('H3')
        wrapper.unmount()
    })

    it('popover does not render when closed', () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
        })

        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('clicking the trigger opens the popover with 5 level buttons', async () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()

        const popover = wrapper.find('[data-testid="heading-menu-popover"]')
        expect(popover.exists()).toBe(true)
        expect(wrapper.find('[data-testid="heading-level-1"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="heading-level-2"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="heading-level-3"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="heading-level-4"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="heading-level-5"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('clicking a level emits insert with the level and closes the popover', async () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="heading-level-2"]').trigger('click')
        await flushPromises()

        const emitted = wrapper.emitted('insert')
        expect(emitted).toBeDefined()
        expect(emitted![0]![0]).toBe(2)
        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('Esc closes the popover', async () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()

        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('clicking outside closes the popover', async () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(true)

        // Click on document body outside the menu — the listener
        // closes the popover.
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await flushPromises()

        expect(wrapper.find('[data-testid="heading-menu-popover"]').exists()).toBe(false)
        outside.remove()
        wrapper.unmount()
    })

    it('highlights the active level when currentLevel matches', async () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: 3 },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="editor-tool-heading"]').trigger('click')
        await flushPromises()

        const level3 = wrapper.find('[data-testid="heading-level-3"]')
        expect(level3.classes().join(' ')).toContain('bg-primary/10')
        wrapper.unmount()
    })

    it('honours the disabled prop on the trigger button', () => {
        const wrapper = mount(HeadingMenu, {
            props: { currentLevel: null, disabled: true },
        })

        const trigger = wrapper.find<HTMLButtonElement>('[data-testid="editor-tool-heading"]')
        expect((trigger.element as HTMLButtonElement).disabled).toBe(true)
        wrapper.unmount()
    })
})
