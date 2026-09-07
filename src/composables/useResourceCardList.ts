import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { getExample } from '../api/examples'
import { getTemplate } from '../api/templates'
import { highlightTypst } from 'highlightjs-typst/highlight'
import { useResourceStore } from '../stores/resources'

export type ResourceKind = 'template' | 'example'

export interface ResourceSummary {
    name: string
    size: number
    origin: 'principal' | 'skill'
}

/**
 * Card-grid logic shared by the Templates and Examples panels.
 *
 * `openNames` mirrors the browser-native `<details>` state via the
 * `toggle` event; we deliberately do NOT bind `:open` because that
 * ping-pongs with `@toggle` and visibly flickers as soon as two
 * cards are open at once. The Set drives only the
 * `md:col-span-2` layout and a one-shot first-open fetch.
 *
 * Returns plain Vue refs so callers can destructure into templates
 * or pass them down as props to a child card component.
 */
export function useResourceCardList(kind: ResourceKind) {
    const store = useResourceStore()
    const fetchSource = kind === 'template' ? getTemplate : getExample
    const remove = kind === 'template'
        ? (n: string) => store.removeTemplate(n)
        : (n: string) => store.removeExample(n)
    const collect = (): ResourceSummary[] => (
        (kind === 'template' ? store.templates : store.examples) ?? []
    ) as ResourceSummary[]
    const reload = (): Promise<unknown> => (
        kind === 'template' ? store.loadTemplates() : store.loadExamples()
    )

    const openNames = ref<Set<string>>(new Set())
    const sourceByName = ref<Record<string, string>>({})
    const highlightedByName = ref<Record<string, string>>({})
    const loadingName = ref<string | null>(null)
    const loadError = ref<string | null>(null)

    function formatBytes(n: number): string {
        if (n < 1024) return `${n} B`
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
        return `${(n / (1024 * 1024)).toFixed(2)} MiB`
    }

    function onToggle(name: string, event: Event): void {
        const target = event.target as HTMLDetailsElement
        const wasOpen = openNames.value.has(name)
        const next = new Set(openNames.value)
        if (target.open) next.add(name)
        else next.delete(name)
        openNames.value = next
        if (target.open && !wasOpen) {
            // First expand only — `sourceByName` cache skips re-opens.
            void ensureSource(name)
        }
    }

    async function ensureSource(name: string): Promise<void> {
        if (sourceByName.value[name] !== undefined) return
        loadingName.value = name
        loadError.value = null
        try {
            const source = await fetchSource(name)
            sourceByName.value = { ...sourceByName.value, [name]: source }
            highlightedByName.value = {
                ...highlightedByName.value,
                [name]: highlightTypst(source),
            }
        } catch (e) {
            loadError.value = e instanceof ApiError ? e.message : `failed to read ${kind}`
        } finally {
            loadingName.value = null
        }
    }

    async function confirmAndDelete(name: string): Promise<void> {
        if (!confirm(`Delete ${kind} "${name}"? This cannot be undone.`)) return
        try {
            await remove(name)
            const nextSource = { ...sourceByName.value }
            delete nextSource[name]
            sourceByName.value = nextSource
            const nextHighlighted = { ...highlightedByName.value }
            delete nextHighlighted[name]
            highlightedByName.value = nextHighlighted
            if (openNames.value.has(name)) {
                const nextOpen = new Set(openNames.value)
                nextOpen.delete(name)
                openNames.value = nextOpen
            }
        } catch {
            // store.error already populated
        }
    }

    // Stable sort keeps the order from jittering when the store
    // re-fetches, which would otherwise re-order by server-side
    // insertion order on each refresh.
    const sortedItems = computed(() =>
        collect()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name)),
    )
    const principalItems = computed(() =>
        sortedItems.value.filter((t) => t.origin === 'principal'),
    )
    const skillItems = computed(() =>
        sortedItems.value.filter((t) => t.origin === 'skill'),
    )
    const hasItems = computed(() => collect().length > 0)

    onMounted(() => {
        if (collect().length === 0) void reload()
    })

    return {
        openNames,
        sourceByName,
        highlightedByName,
        loadingName,
        loadError,
        principalItems,
        skillItems,
        hasItems,
        formatBytes,
        onToggle,
        confirmAndDelete,
    }
}
