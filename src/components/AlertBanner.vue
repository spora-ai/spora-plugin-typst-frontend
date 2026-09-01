<script setup lang="ts">
/**
 * Inline error / status banner.
 *
 * Mirrors `spora-plugin-memories-frontend/src/components/AlertBanner.vue` —
 * same prop names, same v-if contract, same Tailwind utility palette
 * (the host SPA's tokens, so a plugin component styled like this
 * blends with the surrounding chrome without per-component theming).
 *
 * The store passes its `error` ref through verbatim — the banner is
 * "dumb" and lets the page decide which `info` vs `error` slot to
 * render. Two variants only: `error` (red, dismissable) and `info`
 * (blue, informational — used by the Playground's compile-endpoint
 * degraded-mode notice).
 */
defineProps<{
    variant?: 'error' | 'info'
    message: string | null
}>()

defineEmits<{
    (e: 'dismiss'): void
}>()
</script>

<template>
    <div
        v-if="message"
        :class="[
            'rounded-md px-4 py-3 text-sm flex items-start justify-between gap-3 border',
            variant === 'info'
                ? 'bg-secondary text-secondary-foreground border-border'
                : 'bg-destructive/10 text-destructive border-destructive/30',
        ]"
        role="alert"
    >
        <div class="whitespace-pre-wrap break-words">{{ message }}</div>
        <button
            type="button"
            class="shrink-0 text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
            @click="$emit('dismiss')"
        >×</button>
    </div>
</template>
