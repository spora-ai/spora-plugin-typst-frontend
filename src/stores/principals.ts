/**
 * Pinia store for the principal selector.
 *
 * Fetches `/api/v1/principals/me` once on mount and caches the
 * result so the chip row doesn't re-fetch every tab switch.
 * Selected principal id is also kept here so it survives tab
 * navigation without prop-drilling.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError } from '../api/client'
import * as principalsApi from '../api/principals'
import type { Principal } from '../api/principals'

export const usePrincipalsStore = defineStore('typst-principals', () => {
    const principals = ref<Principal[]>([])
    const selectedPrincipalId = ref<number | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function loadPrincipals(): Promise<void> {
        loading.value = true
        error.value = null
        try {
            principals.value = await principalsApi.listMyPrincipals()
            // Default selection: the caller's own user-principal.
            // Falls back to the first principal if none match (rare
            // edge case — visible principals without a user-principal
            // would imply an admin viewing only group scopes).
            if (selectedPrincipalId.value === null) {
                const ownPrincipal = principals.value.find((p) => p.type === 'user')
                selectedPrincipalId.value = ownPrincipal?.id ?? principals.value[0]?.id ?? null
            }
        } catch (e) {
            error.value = e instanceof ApiError ? e.message : 'Failed to load principals.'
        } finally {
            loading.value = false
        }
    }

    function selectPrincipal(id: number): void {
        selectedPrincipalId.value = id
    }

    function clearError(): void {
        error.value = null
    }

    return {
        principals,
        selectedPrincipalId,
        loading,
        error,
        loadPrincipals,
        selectPrincipal,
        clearError,
    }
})
