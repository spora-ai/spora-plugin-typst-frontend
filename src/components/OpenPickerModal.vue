<script setup lang="ts">
/**
 * File picker modal — search + kind chip + filter for the playground's
 * source pool.
 *
 * Replaces the inline dropdown that ships with the basic Open button.
 * The dropdown works for ~10 files; this modal scales to hundreds
 * because it has a search input, a sort control, a kind chip row,
 * and a virtualized list (`<List>` from `vue-virtual-scroller` —
 * but to keep the dep footprint small, we do plain CSS overflow with
 * a max-height instead; hundreds of rows scroll fine without
 * virtualization because each row is ~28px tall).
 *
 * The chip row scopes the listing to one of the three `.typ` pools
 * (saved / generated / uploaded) plus an "All" chip that returns
 * the union. Per-kind counts come from the parent (the `sources`
 * store caches them so chip switches don't refetch).
 *
 * Keyboard:
 *   - /       focuses the search input
 *   - Esc     closes the modal
 *   - ↑ / ↓   moves the active row
 *   - Enter   opens the active row
 *
 * The modal is owned by `CompileForm.vue` (it sets `open` and
 * reacts to `pick`). The `principalId` + `kind` are plumbed
 * through the `sources` store, which already scopes listings to
 * the chip row's selection.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlaygroundSourceKind, PlaygroundSourceSummary } from '../types'

export type SourcesKindFilter = PlaygroundSourceKind | 'all'

const props = defineProps<{
    open: boolean
    sources: PlaygroundSourceSummary[]
    loading: boolean
    /** Active kind chip; `all` is the union. */
    kind: SourcesKindFilter
    /** Per-kind counts for the chip badges. */
    kindCounts: Record<PlaygroundSourceKind, number>
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'pick', source: PlaygroundSourceSummary): void
    (e: 'change-kind', kind: SourcesKindFilter): void
}>()

const search = ref('')
type SortField = 'filename' | 'updated_at' | 'byte_size'
type SortDir = 'asc' | 'desc'
const sortBy = ref<SortField>('updated_at')
const sortDir = ref<SortDir>('desc')
const activeIdx = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const dialogRef = ref<HTMLDialogElement | null>(null)

/**
 * Static chip definitions. The label and aria-label are kept
 * distinct because the chip text shows a count (e.g. "Saved (3)")
 * while the aria-label spells the kind out for screen readers
 * ("Saved playground files").
 */
const kindChips: { value: SourcesKindFilter; label: string; ariaLabel: string }[] = [
    { value: 'all', label: 'All', ariaLabel: 'All playground files' },
    { value: 'saved', label: 'Saved', ariaLabel: 'Saved playground files' },
    { value: 'generated', label: 'Generated', ariaLabel: 'LLM-generated playground files' },
    { value: 'uploaded', label: 'Uploaded', ariaLabel: 'Operator-uploaded playground files' },
]

const filtered = computed<PlaygroundSourceSummary[]>(() => {
    const q = search.value.trim().toLowerCase()
    let out = props.sources
    if (props.kind !== 'all') {
        out = out.filter((s) => s.kind === props.kind)
    }
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

/**
 * Empty-state copy that follows the active kind chip. The full
 * copy lives here (not the page) because the chip is the
 * picker's local state — the page doesn't know which pool the
 * operator is currently scoping to.
 */
const emptyStateMessage = computed<string>(() => {
    switch (props.kind) {
        case 'saved':     return 'No saved playground files yet. Render once to create one.'
        case 'generated': return 'No LLM-generated .typ files yet.'
        case 'uploaded':  return 'No uploaded .typ files yet.'
        case 'other':     return 'No .typ files in this pool.'
        case 'all':
        default:          return 'No .typ files owned by this principal yet.'
    }
})

function close(): void {
    emit('close')
}

function pick(s: PlaygroundSourceSummary): void {
    emit('pick', s)
}

function selectKind(next: SourcesKindFilter): void {
    if (next === props.kind) return
    emit('change-kind', next)
    // Reset the active row so keyboard navigation lands on the
    // first row of the new pool (or empty if the pool is empty)
    // rather than a stale index pointing past the new bounds.
    activeIdx.value = 0
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
    // ESC is handled natively by <dialog> via showModal() — it calls
    // .close() and fires the `close` event, which we forward to the
    // parent. Don't intercept it here or we'd double-close.
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

function setSort(field: SortField): void {
    if (sortBy.value === field) {
        toggleSortDir()
    } else {
        sortBy.value = field
        sortDir.value = 'desc'
    }
}

function sortArrow(field: SortField): string {
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

/**
 * Count badge content for a kind chip. `all` is the union of the
 * three pools; the helper sums them on demand so the badge stays
 * consistent even if the backend ever adds another pool without
 * updating the chip row.
 */
function kindBadgeValue(value: SourcesKindFilter): number {
    if (value === 'all') {
        return props.kindCounts.saved + props.kindCounts.generated + props.kindCounts.uploaded
    }
    if (value === 'other') {
        return props.kindCounts.other
    }
    return props.kindCounts[value]
}

watch(search, () => {
    activeIdx.value = 0
})

watch(() => props.kind, () => {
    activeIdx.value = 0
})

watch(() => props.open, (open) => {
    if (open) {
        search.value = ''
        activeIdx.value = 0
        void nextTick(() => {
            dialogRef.value?.showModal()
            searchInputRef.value?.focus()
        })
    }
})

function onDialogNativeClose(): void {
    // Native <dialog> ESC / form-method="dialog" calls .close()
    // and dispatches the close event. Mirror that back through the
    // component's emit so the parent (CompileForm) clears its
    // `openPickerOpen` state and tears down the picker.
    emit('close')
}

function onDialogClick(e: MouseEvent): void {
    // Native <dialog> doesn't close on backdrop click by default.
    // The click on the dialog element itself (not a descendant) is
    // the backdrop area; any other target is content. Match the
    // behaviour of the previous absolute-positioned backdrop div.
    if (e.target === dialogRef.value) {
        close()
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <dialog
      v-if="open"
      ref="dialogRef"
      class="fixed inset-0 m-0 max-w-none max-h-none w-full h-full p-4 bg-transparent backdrop:bg-black/40 open:flex items-center justify-center"
      aria-label="Open playground file"
      @close="onDialogNativeClose"
      @click="onDialogClick"
    >
      <div
        class="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl flex flex-col"
        style="max-height: min(640px, calc(100vh - 2rem))"
        tabindex="-1"
        @keydown="onListKey"
      >
        <header class="flex items-center gap-2 p-3 border-b border-border">
          <input
            id="open-picker-search"
            ref="searchInputRef"
            v-model="search"
            type="text"
            placeholder="Search files by name… (press / to focus)"
            aria-label="Search playground files"
            class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
            spellcheck="false"
            autocomplete="off"
          >
          <button
            type="button"
            class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            title="Close (Esc)"
            @click="close"
          >
            Esc
          </button>
        </header>

        <div
          v-if="sources.length > 0"
          class="flex items-center gap-1.5 px-3 py-1.5 border-b border-border overflow-x-auto"
          role="tablist"
          aria-label="Filter playground files by pool"
        >
          <button
            v-for="chip in kindChips"
            :key="chip.value"
            type="button"
            role="tab"
            :aria-selected="kind === chip.value"
            :aria-label="chip.ariaLabel"
            :data-testid="`open-picker-kind-${chip.value}`"
            :class="[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap border transition-colors',
              kind === chip.value
                ? 'border-ring bg-primary text-primary-foreground'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground',
            ]"
            @click="selectKind(chip.value)"
          >
            <span>{{ chip.label }}</span>
            <span
              :class="[
                'inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded-full text-[10px] tabular-nums',
                kind === chip.value ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground',
              ]"
            >{{ kindBadgeValue(chip.value) }}</span>
          </button>
        </div>

        <div
          v-if="sources.length > 0"
          class="grid gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border select-none"
          style="grid-template-columns: 1fr 5rem 9rem;"
        >
          <button
            type="button"
            class="text-left hover:text-foreground"
            @click="setSort('filename')"
          >
            File {{ sortArrow('filename') }}
          </button>
          <button
            type="button"
            class="text-right hover:text-foreground"
            @click="setSort('byte_size')"
          >
            Size {{ sortArrow('byte_size') }}
          </button>
          <button
            type="button"
            class="text-right hover:text-foreground"
            @click="setSort('updated_at')"
          >
            Updated {{ sortArrow('updated_at') }}
          </button>
        </div>

        <div
          ref="listRef"
          class="flex-1 overflow-y-auto"
        >
          <div
            v-if="loading"
            class="px-3 py-6 text-center text-sm text-muted-foreground"
          >
            Loading…
          </div>
          <div
            v-else-if="sources.length === 0"
            data-testid="open-picker-empty-all"
            class="px-3 py-6 text-center text-sm text-muted-foreground"
          >
            {{ emptyStateMessage }}
          </div>
          <div
            v-else-if="filtered.length === 0"
            data-testid="open-picker-empty-filtered"
            class="px-3 py-6 text-center text-sm text-muted-foreground"
          >
            <template v-if="search !== ''">No files match “{{ search }}”.</template>
            <template v-else>{{ emptyStateMessage }}</template>
          </div>
          <button
            v-for="(s, idx) in filtered"
            v-else
            :key="s.id"
            :data-source-id="s.id"
            :data-source-kind="s.kind"
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
            <span
              class="font-mono truncate min-w-0"
              :title="s.filename"
            >{{ s.filename }}</span>
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
    </dialog>
  </Teleport>
</template>
