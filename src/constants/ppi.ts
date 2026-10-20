/**
 * Wire-level constants mirrored from
 * `spora-plugin-typst/src/Producers/TypstRenderProducer.php`.
 *
 * Kept in lockstep with the backend's `SUPPORTED_PPI` constant —
 * the operator UI's `<select>` renders these as the curated options
 * (the option *labels* are copy, so they live with the UI in
 * `components/CompileForm.vue`), while the LLM tool accepts any
 * positive number in the wider range. Update both sides together when
 * the list changes.
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
