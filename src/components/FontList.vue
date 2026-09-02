<script setup lang="ts">
/**
 * Table view of the principal's font library.
 *
 * Skill-shipped fonts (`origin: 'skill'`) render with a lock badge
 * and the delete button disabled — the API would 422 them anyway,
 * but greying the affordance saves the operator a round-trip.
 *
 * Origin column shows where the font lives:
 *   - `skill`    → bundled with the plugin (Inter OFL), read-only.
 *   - `principal` → operator upload, deletable.
 */
import { onMounted } from 'vue'
import { useResourceStore } from '../stores/resources'

const store = useResourceStore()

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
    return `${(n / 1024 / 1024).toFixed(2)} MiB`
}

async function confirmAndDelete(name: string): Promise<void> {
    if (!confirm(`Delete font "${name}"? This cannot be undone.`)) return
    try {
        await store.removeFont(name)
    } catch {
        // store.error already populated
    }
}

onMounted(() => {
    if ((store.fonts ?? []).length === 0) store.loadFonts()
})
</script>

<template>
    <div class="rounded-lg border border-border overflow-hidden">
        <table class="min-w-full divide-y divide-border text-sm">
            <thead class="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                    <th scope="col" class="px-4 py-2">Name</th>
                    <th scope="col" class="px-4 py-2">Origin</th>
                    <th scope="col" class="px-4 py-2 text-right">Size</th>
                    <th scope="col" class="px-4 py-2 text-right">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-border bg-card">
                <tr v-if="store.loading && store.fonts.length === 0">
                    <td colspan="4" class="px-4 py-6 text-center text-muted-foreground">Loading…</td>
                </tr>
                <tr v-else-if="store.fonts.length === 0">
                    <td colspan="4" class="px-4 py-6 text-center text-muted-foreground">
                        No fonts uploaded yet. Drop a .ttf / .otf / .woff / .woff2 file above.
                    </td>
                </tr>
                <tr v-for="font in store.fonts" :key="font.name">
                    <td class="px-4 py-2 font-mono text-foreground">{{ font.name }}</td>
                    <td class="px-4 py-2">
                        <span
                            :class="[
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                font.origin === 'skill'
                                    ? 'bg-accent text-accent-foreground'
                                    : 'bg-secondary text-secondary-foreground',
                            ]"
                        >
                            {{ font.origin === 'skill' ? 'Skill-shipped' : 'Principal' }}
                        </span>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums text-foreground">{{ formatBytes(font.size) }}</td>
                    <td class="px-4 py-2 text-right">
                        <button
                            v-if="font.origin === 'principal'"
                            type="button"
                            class="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-40"
                            :disabled="store.uploading"
                            @click="confirmAndDelete(font.name)"
                        >Delete</button>
                        <span v-else class="text-xs text-muted-foreground">Built-in</span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
