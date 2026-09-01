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
    if (store.fonts.length === 0) store.loadFonts()
})
</script>

<template>
    <div class="rounded-lg border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                    <th scope="col" class="px-4 py-2">Name</th>
                    <th scope="col" class="px-4 py-2">Origin</th>
                    <th scope="col" class="px-4 py-2 text-right">Size</th>
                    <th scope="col" class="px-4 py-2 text-right">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
                <tr v-if="store.loading && store.fonts.length === 0">
                    <td colspan="4" class="px-4 py-6 text-center text-gray-500">Loading…</td>
                </tr>
                <tr v-else-if="store.fonts.length === 0">
                    <td colspan="4" class="px-4 py-6 text-center text-gray-500">
                        No fonts uploaded yet. Drop a .ttf / .otf / .woff / .woff2 file above.
                    </td>
                </tr>
                <tr v-for="font in store.fonts" :key="font.name">
                    <td class="px-4 py-2 font-mono text-gray-900">{{ font.name }}</td>
                    <td class="px-4 py-2">
                        <span
                            :class="[
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                font.origin === 'skill'
                                    ? 'bg-typst-50 text-typst-700'
                                    : 'bg-emerald-50 text-emerald-700',
                            ]"
                        >
                            {{ font.origin === 'skill' ? 'Skill-shipped' : 'Principal' }}
                        </span>
                    </td>
                    <td class="px-4 py-2 text-right tabular-nums text-gray-700">{{ formatBytes(font.size) }}</td>
                    <td class="px-4 py-2 text-right">
                        <button
                            v-if="font.origin === 'principal'"
                            type="button"
                            class="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                            :disabled="store.uploading"
                            @click="confirmAndDelete(font.name)"
                        >Delete</button>
                        <span v-else class="text-xs text-gray-400">Built-in</span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
