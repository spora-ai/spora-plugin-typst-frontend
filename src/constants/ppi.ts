/**
 * Wire-level constants mirrored from
 * `spora-plugin-typst/src/Producers/TypstRenderProducer.php`.
 *
 * `SUPPORTED_PPI` mirrors the backend's curated list. Nothing in the
 * panel imports it — the option list (its labels are copy) lives in
 * `components/CompileForm.vue` — so this constant is the reference copy
 * to diff against when the backend's list changes. The LLM tool accepts
 * any positive number in the wider range (36–600).
 *
 * Doubling progression: 72 → 144 → 288 mirrors CSS pixel-ratio steps
 * so the same source renders cleanly at any screen density; 600 is
 * the existing upper clamp (high-res print).
 */
export const SUPPORTED_PPI: readonly number[] = [72, 144, 288, 600] as const

/**
 * Default PPI when the operator hasn't picked one. Matches the
 * backend's `TypstRenderProducer::DEFAULT_PPI`.
 */
export const DEFAULT_PPI = 144
