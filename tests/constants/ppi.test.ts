/**
 * `src/constants/ppi.ts` mirrors `TypstRenderProducer::SUPPORTED_PPI` in
 * `spora-plugin-typst`. The two live in separate repositories, so nothing
 * in this suite can read the PHP constant — this test is the diff a
 * backend change has to trip: when the curated list moves, this fails and
 * the panel's copy is updated with it.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PPI, SUPPORTED_PPI } from '../../src/constants/ppi'

describe('constants/ppi', () => {
    it("mirrors the backend's curated PPI list", () => {
        expect([...SUPPORTED_PPI]).toEqual([72, 144, 288, 600])
    })

    it('offers the backend default among the supported densities', () => {
        expect(SUPPORTED_PPI).toContain(DEFAULT_PPI)
    })
})
