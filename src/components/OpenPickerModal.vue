<script setup lang="ts">
/**
 * File picker modal — search + filter for the playground's source pool.
 *
 * Replaces the inline dropdown that ships with the basic Open button.
 * The dropdown works for ~10 files; this modal scales to hundreds
 * because it has a search input, a sort control, and a virtualized
 * list (`<List>` from `vue-virtual-scroller` — but to keep the
 * dep footprint small, we do plain CSS overflow with a max-height
 * instead; hundreds of rows scroll fine without virtualization
 * because each row is ~28px tall).
 *
 * Keyboard:
 *   - /       focuses the search input
 *   - Esc     closes the modal
 *   - ↑ / ↓   moves the active row
 *   - Enter   opens the active row
 *
 * The modal is owned by `CompileForm.vue` (it sets `open` and
 * reacts to `pick`). The `principalId` is plumbed through the
 * `sources` store, which already scopes listings to the chip row's
 * selection.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlaygroundSourceSummary } from '../types'

const props = defineProps<{
    open: boolean
    sources: PlaygroundSourceSummary[]
    loading: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'pick', source: PlaygroundSourceSummary): void
}>()

const search = ref('')
const sortBy = ref<'filename' | 'updated_at' | 'byte_size'>('updated_at')
const sortDir = ref<'asc' | 'desc'>('desc')
const activeIdx = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const filtered = computed<PlaygroundSourceSummary[]>(() => {
    const q = search.value.trim().toLowerCase()
    let out = props.sources
    if (q !== '') {
        out = out.filter((s) => s.filename.toLowerCase().includes(q))
    }
    const dir = sortDir.value === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
        const av = a[sortBy.value] ?? ''
        const bv = b[sortBy.value] ?? ''
        if (av === bv) {
            return a.filename.localeCompare(b.filename)
        }
        return av < bv ? -1 * dir : 1 * dir
    })
    return out
})

const activeRowId = computed<string | null>(() => {
    const row = filtered.value[activeIdx.value]
    return row?.id ?? null
})

function close(): void {
    emit('close')
}

function pick(s: PlaygroundSourceSummary): void {
    emit('pick', s)
}

function moveActive(delta: number): void {
    if (filtered.value.length === 0) return
    const next = (activeIdx.value + delta + filtered.value.length) % filtered.value.length
    activeIdx.value = next
    scrollActiveIntoView()
}

function scrollActiveIntoView(): void {
    void nextTick(() => {
        const root = listRef.value
        if (root === null) return
        const el = root.querySelector<HTMLElement>(`[data-source-id="${activeRowId.value}"]`)
        if (el === null) return
        const top = el.offsetTop
        const bottom = top + el.offsetHeight
        if (top < root.scrollTop) {
            root.scrollTop = top
        } else if (bottom > root.scrollTop + root.clientHeight) {
            root.scrollTop = bottom - root.clientHeight
        }
    })
}

function onKey(e: KeyboardEvent): void {
    if (!props.open) return
    if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
    }
    if (document.activeElement === searchInputRef.value) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            moveActive(1)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            moveActive(-1)
        } else if (e.key === 'Enter') {
            const row = filtered.value[activeIdx.value]
            if (row !== undefined) {
                e.preventDefault()
                pick(row)
            }
        }
        return
    }
    if (e.key === '/') {
        e.preventDefault()
        searchInputRef.value?.focus()
    }
}

function onListKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveActive(1)
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveActive(-1)
    } else if (e.key === 'Enter') {
        const row = filtered.value[activeIdx.value]
        if (row !== undefined) {
            e.preventDefault()
            pick(row)
        }
    }
}

function toggleSortDir(): void {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}

function setSort(field: 'filename' | 'updated_at' | 'byte_size'): void {
    if (sortBy.value === field) {
        toggleSortDir()
    } else {
        sortBy.value = field
        sortDir.value = 'desc'
    }
}

function sortArrow(field: 'filename' | 'updated_at' | 'byte_size'): string {
    if (sortBy.value !== field) return ''
    return sortDir.value === 'asc' ? '▲' : '▼'
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatUpdated(s: string | null): string {
    if (s === null || s === '') return ''
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString()
}

watch(search, () => {
    activeIdx.value = 0
})

watch(() => props.open, (open) => {
    if (open) {
        search.value = ''
        activeIdx.value = 0
        void nextTick(() => searchInputRef.value?.focus())
    }
})

onMounted(() => {
    document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
})
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Open playground file"
        >
            <div
                class="absolute inset-0 bg-black/40"
                @click="close"
            />
            <div
                class="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
                style="max-height: min(640px, calc(100vh - 2rem))"
                @keydown="onListKey"
                tabindex="-1"
            >
                <header class="flex items-center gap-2 p-3 border-b border-border">
                    <input
                        ref="searchInputRef"
                        v-model="search"
                        type="text"
                        placeholder="Search files by name… (press / to focus)"
                        class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                        spellcheck="false"
                        autocomplete="off"
                    />
                    <button
                        type="button"
                        class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        title="Close (Esc)"
                        @click="close"
                    >Esc</button>
                </header>

                <div
                    v-if="sources.length > 0"
                    class="grid gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border select-none"
                    style="grid-template-columns: 1fr 5rem 9rem;"
                >
                    <button
                        type="button"
                        class="text-left hover:text-foreground"
                        @click="setSort('filename')"
                    >File {{ sortArrow('filename') }}</button>
                    <button
                        type="button"
                        class="text-right hover:text-foreground"
                        @click="setSort('byte_size')"
                    >Size {{ sortArrow('byte_size') }}</button>
                    <button
                        type="button"
                        class="text-right hover:text-foreground"
                        @click="setSort('updated_at')"
                    >Updated {{ sortArrow('updated_at') }}</button>
                </div>

                <div
                    ref="listRef"
                    class="flex-1 overflow-y-auto"
                >
                    <div
                        v-if="loading"
                        class="px-3 py-6 text-center text-sm text-muted-foreground"
                    >Loading…</div>
                    <div
                        v-else-if="sources.length === 0"
                        class="px-3 py-6 text-center text-sm text-muted-foreground"
                    >No saved playground files yet. Render once to create one.</div>
                    <div
                        v-else-if="filtered.length === 0"
                        class="px-3 py-6 text-center text-sm text-muted-foreground"
                    >No files match “{{ search }}”.</div>
                    <button
                        v-for="(s, idx) in filtered"
                        v-else
                        :key="s.id"
                        :data-source-id="s.id"
                        type="button"
                        :class="[
                            'grid gap-3 items-center w-full px-3 py-1 text-sm text-left border-b border-border last:border-b-0',
                            idx === activeIdx
                                ? 'bg-primary/10 text-foreground'
                                : 'hover:bg-muted text-foreground',
                        ]"
                        style="grid-template-columns: 1fr 5rem 9rem;"
                        @click="pick(s)"
                        @mouseenter="activeIdx = idx"
                    >
                        <span class="font-mono truncate min-w-0" :title="s.filename">{{ s.filename }}</span>
                        <span class="text-xs text-muted-foreground tabular-nums text-right">{{ formatBytes(s.byte_size) }}</span>
                        <span class="text-xs text-muted-foreground tabular-nums text-right">{{ formatUpdated(s.updated_at) }}</span>
                    </button>
                </div>

                <footer class="flex items-center justify-between gap-2 px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
                    <span>{{ filtered.length }} of {{ sources.length }} files</span>
                    <span class="flex items-center gap-4">
                        <span class="inline-flex items-center gap-1.5">
                            <kbd class="font-mono px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">/</kbd>
                            <span>search</span>
                        </span>
                        <span class="inline-flex items-center gap-1.5">
                            <kbd class="font-mono px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">▲</kbd>
                            <kbd class="font-mono px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">▼</kbd>
                            <span>move</span>
                        </span>
                        <span class="inline-flex items-center gap-1.5">
                            <kbd class="font-mono px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">↵</kbd>
                            <span>open</span>
                        </span>
                    </span>
                </footer>
            </div>
        </div>
    </Teleport>
</template>
