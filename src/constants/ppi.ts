/**
 * Wire-level constants mirrored from
 * `spora-plugin-typst/src/Producers/TypstRenderProducer.php`.
 *
 * `SUPPORTED_PPI` mirrors the backend's curated list, and it is the only
 * copy of that list in the panel: `components/CompileForm.vue` builds
 * its `<select>` options from these values, so a density added here
 * reaches the operator's screen. The labels are copy and stay in the
 * component, where the panel's language is known.
 *
 * The literal type is what holds the two halves together — the label
 * map in the component is keyed by it, so a density added here without
 * a label there is a type error rather than an empty option.
 *
 * The LLM tool accepts any positive number in the wider range (36–600).
 *
 * Doubling progression: 72 → 144 → 288 mirrors CSS pixel-ratio steps
 * so the same source renders cleanly at any screen density; 600 is
 * the existing upper clamp (high-res print).
 */
export const SUPPORTED_PPI = [72, 144, 288, 600] as const

/**
 * Default PPI when the operator hasn't picked one. Matches the
 * backend's `TypstRenderProducer::DEFAULT_PPI`.
 */
export const DEFAULT_PPI = 144
