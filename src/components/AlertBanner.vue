<script setup lang="ts">
/**
 * Inline error / status banner.
 *
 * The plugin is an isolated bundle and cannot import the host's UI
 * library, so it ships its own banner — but styled with the host's
 * Tailwind tokens (`bg-destructive`, `bg-secondary`, `border-border`)
 * so it blends with the surrounding chrome without per-component
 * theming.
 *
 * The banner is "dumb": it renders whatever message it is handed and
 * reports the dismiss click. The page decides which message wins
 * across the four stores.
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
            :aria-label="t('Dismiss')"
            @click="$emit('dismiss')"
        >×</button>
    </div>
</template>
