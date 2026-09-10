/**
 * Component tests for ImageInsertModal — the modal that opens
 * when the editor's toolbar Image button is clicked.
 *
 * Mirrors the template picker's coverage: nothing renders when
 * `open=false`, two tabs (Plugin images / Media archive) with
 * one card per image, click emits the kind-specific pick event,
 * tab switches emit `change-tab`. Loading + empty states render
 * the same text as the template picker.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ImageInsertModal from '../../src/components/ImageInsertModal.vue'
import type { ImageResource, MediaArchiveImage } from '../../src/types'

function pluginImage(overrides: Partial<ImageResource>): ImageResource {
    return {
        name: overrides.name ?? 'logo.png',
        mime: overrides.mime ?? 'image/png',
        size: overrides.size ?? 12345,
        modified_at: overrides.modified_at ?? 1_700_000_000,
        url: overrides.url ?? '/api/v1/typst/images/logo.png',
    }
}

function mediaImage(overrides: Partial<MediaArchiveImage>): MediaArchiveImage {
    return {
        id: overrides.id ?? 'abc-123',
        filename: overrides.filename ?? 'photo.png',
        mime_type: overrides.mime_type ?? 'image/png',
        byte_size: overrides.byte_size ?? 12345,
        asset_url: overrides.asset_url ?? '/api/v1/assets/abc-123.png',
        created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
    }
}

beforeEach(() => {
    document.body.innerHTML = ''
    // The modal reads the principalId from useImagesStore() to
    // scope its plugin-image thumbnails; without an active Pinia
    // the setup() throws on the store call.
    setActivePinia(createPinia())
})

describe('ImageInsertModal.vue', () => {
    it('renders nothing when open=false', () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: false,
                pluginImages: [pluginImage({ name: 'logo.png' })],
                mediaImages: [],
            },
        })

        expect(wrapper.find('[data-testid="image-insert-modal"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('shows plugin images by default with their data-testid', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [
                    pluginImage({ name: 'logo.png' }),
                    pluginImage({ name: 'banner.png' }),
                ],
                mediaImages: [mediaImage({ id: 'abc' })],
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="image-insert-modal"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="image-insert-plugin-logo.png"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="image-insert-plugin-banner.png"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('clicking a plugin image emits pick-plugin-image', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [pluginImage({ name: 'logo.png' })],
                mediaImages: [],
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="image-insert-plugin-logo.png"]').trigger('click')

        const pick = wrapper.emitted('pick-plugin-image')
        expect(pick).toBeDefined()
        expect(pick![0]![0]).toMatchObject({ name: 'logo.png' })
        wrapper.unmount()
    })

    it('switching to Media tab shows media images', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [pluginImage({ name: 'logo.png' })],
                mediaImages: [mediaImage({ id: 'abc-123' })],
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="image-insert-tab-media"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="image-insert-media-abc-123"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="image-insert-plugin-logo.png"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('clicking a media image emits pick-media-image', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [],
                mediaImages: [mediaImage({ id: 'abc-123', filename: 'photo.png' })],
                activeTab: 'media',
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="image-insert-media-abc-123"]').trigger('click')

        const pick = wrapper.emitted('pick-media-image')
        expect(pick).toBeDefined()
        expect(pick![0]![0]).toMatchObject({ id: 'abc-123' })
        wrapper.unmount()
    })

    it('emits change-tab when the tab buttons are clicked', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [pluginImage({ name: 'logo.png' })],
                mediaImages: [mediaImage({ id: 'abc' })],
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="image-insert-tab-media"]').trigger('click')

        expect(wrapper.emitted('change-tab')).toBeDefined()
        expect(wrapper.emitted('change-tab')![0]![0]).toBe('media')
        wrapper.unmount()
    })

    it('shows the loading line when loading=true', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [],
                mediaImages: [],
                loading: true,
            },
            attachTo: document.body,
        })
        await flushPromises()

        expect(wrapper.text()).toContain('Loading')
        wrapper.unmount()
    })

    it('Close emits close', async () => {
        const wrapper = mount(ImageInsertModal, {
            props: {
                open: true,
                pluginImages: [pluginImage({ name: 'logo.png' })],
                mediaImages: [],
            },
            attachTo: document.body,
        })
        await flushPromises()

        await wrapper.find('[data-testid="image-insert-close"]').trigger('click')

        expect(wrapper.emitted('close')).toBeDefined()
        wrapper.unmount()
    })
})
