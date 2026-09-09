<script setup lang="ts">
/**
 * HeadingMenu — toolbar trigger button + popover for picking a
 * heading level (H1–H5) to apply to the caret's current line.
 *
 * Replaces the previous single "Heading" button. The previous
 * version could only apply `= ` (level 1); repeated clicks
 * stacked markers on top of each other. This menu lets the
 * operator pick a specific level, and the underlying
 * `SourceEditor.applyHeadingAtCaret(level)` method replaces
 * any existing marker on the line so picking H3 on an
 * already-H1 line cleanly upgrades to `=== `.
 *
 * Why a popover rather than cycling:
 *   - Discoverability — new operators see all five options.
 *   - Predictability — clicking H2 produces exactly H2, not
 *     "upgrade to H2" relative to the current level.
 *   - Compact — one button in the toolbar instead of five.
 *
 * Popover behaviour:
 *   - Click the trigger button → popover opens.
 *   - Click a level → emit `insert` with that level, close the
 *     popover.
 *   - Click outside (document mousedown) → close the popover.
 *   - Esc → close the popover.
 *
 * The popover is positioned absolutely below the trigger
 * button. Anchoring uses a wrapper div around the trigger so
 * the popover can position itself relative to the trigger
 * without measuring scroll offsets manually.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
    /** Currently active level (1–5) for the caret's line, if known. */
    currentLevel?: number | null
    /** Disabled state — toolbar passes through the global busy flag. */
    disabled?: boolean
    /** Aria-label override for the trigger button. */
    ariaLabel?: string
}>()

const emit = defineEmits<{
    (e: 'insert', level: number): void
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)

const levels = [1, 2, 3, 4, 5] as const

const triggerLabel = computed(() => {
    if (props.currentLevel !== null && props.currentLevel !== undefined) {
        return `H${props.currentLevel}`
    }
    return 'Heading'
})

function toggle(): void {
    open.value = !open.value
    void nextTick(() => {
        // Focus the first option once the popover renders so the
        // operator can pick a level with the keyboard.
        const first = popoverRef.value?.querySelector<HTMLButtonElement>('button[data-heading-level]')
        first?.focus()
    })
}

function close(): void {
    open.value = false
    // Return focus to the trigger so keyboard users land somewhere
        // sensible when they Esc out of the popover.
    triggerRef.value?.focus()
}

function pick(level: number): void {
    emit('insert', level)
    close()
}

function onDocumentMouseDown(e: MouseEvent): void {
    if (!open.value) return
    const target = e.target as Node | null
    if (target === null) return
    if (triggerRef.value?.contains(target)) return
    if (popoverRef.value?.contains(target)) return
    close()
}

function onKey(e: KeyboardEvent): void {
    if (!open.value) return
    if (e.key === 'Escape') {
        e.preventDefault()
        close()
    }
}

onMounted(() => {
    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown)
    document.removeEventListener('keydown', onKey)
})
</script>

<template>
    <div class="relative inline-flex">
        <button
            ref="triggerRef"
            type="button"
            class="px-2 py-1 rounded text-xs font-medium text-foreground hover:bg-background hover:text-foreground border border-transparent hover:border-border transition-colors inline-flex items-center gap-1 disabled:opacity-50"
            :class="open ? 'bg-background border-border' : ''"
            :disabled="props.disabled"
            :aria-label="props.ariaLabel ?? 'Heading level'"
            :aria-haspopup="true"
            :aria-expanded="open"
            data-testid="editor-tool-heading"
            @click="toggle"
        >
            {{ triggerLabel }}
            <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>
        </button>

        <div
            v-if="open"
            ref="popoverRef"
            class="absolute top-full left-0 mt-1 z-20 min-w-[10rem] rounded-md border border-border bg-card shadow-lg p-1 space-y-0.5"
            role="menu"
            data-testid="heading-menu-popover"
            @click.stop
        >
            <button
                v-for="level in levels"
                :key="level"
                type="button"
                role="menuitem"
                class="w-full text-left px-2 py-1.5 rounded text-sm text-foreground hover:bg-muted flex items-baseline gap-2"
                :class="props.currentLevel === level ? 'bg-primary/10 text-primary font-semibold' : ''"
                :data-testid="`heading-level-${level}`"
                :data-heading-level="level"
                @click="pick(level)"
            >
                <span class="font-mono text-xs shrink-0 w-8 text-muted-foreground">H{{ level }}</span>
                <span class="font-mono text-xs truncate">=</span>
                <span class="truncate">{{ level === 1 ? 'Title' : level === 2 ? 'Section' : level === 3 ? 'Subsection' : level === 4 ? 'Sub-subsection' : 'Minor heading' }}</span>
            </button>
        </div>
    </div>
</template>
