/**
 * The extractor, exercised against a fixture tree.
 *
 * The extractor is a script, not a module — it runs its scan at import
 * time — so the only way to test a rule is to run it. `--root` points
 * the scan at another tree, which is what makes that possible.
 *
 * The rule under test is the one the panel's copy depends on: a key
 * written as a `String.raw` tagged template is a *literal*, and the
 * catalogue key is its raw source text. `String.raw` exists in
 * `CompileForm.vue` because the retina labels carry a `\@` that
 * vue-i18n's message compiler reads as an escaped `@` — and in a plain
 * string literal that backslash has to be escaped itself.
 *
 * The second rule is the other half: a label that is a product
 * designation and a number is not copy, so it is not reported and it
 * needs no catalogue entry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXTRACTOR = join(REPO_ROOT, 'scripts/i18n.mjs')

const RETINA_KEY = '144 PPI — Retina \\@2x (default)'
const PLAIN_KEY = '72 PPI — web / thumbnail'

let fixtureRoot: string

/** The catalogue the fixture's source produces. */
function catalogue(entries: Record<string, string>): string {
    return JSON.stringify(entries, null, 2) + '\n'
}

/**
 * Run the extractor against the fixture and return its exit code.
 *
 * The exit code is the assertion: the extractor exits 0 only when every
 * rule holds.
 */
function checkFixture(root: string = fixtureRoot): number {
    try {
        execFileSync(process.execPath, [EXTRACTOR, '--check', '--root', root], {
            cwd: REPO_ROOT,
            stdio: 'pipe',
        })
        return 0
    } catch (error) {
        const failure = error as { status?: number, stdout?: Buffer, stderr?: Buffer }
        process.stderr.write(failure.stdout?.toString() ?? '')
        process.stderr.write(failure.stderr?.toString() ?? '')
        return failure.status ?? 1
    }
}

beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'i18n-fixture-'))
    mkdirSync(join(fixtureRoot, 'src/locales'), { recursive: true })
    writeFileSync(
        join(fixtureRoot, 'src/Panel.ts'),
        [
            "import { t } from './i18n'",
            '',
            'const RETINA = t(String.raw`144 PPI — Retina \\@2x (default)`)',
            "const PLAIN = t('72 PPI — web / thumbnail')",
            'export { RETINA, PLAIN }',
            '',
        ].join('\n'),
    )
    writeFileSync(
        join(fixtureRoot, 'src/locales/en.json'),
        catalogue({
            [RETINA_KEY]: RETINA_KEY,
            [PLAIN_KEY]: PLAIN_KEY,
        }),
    )
    writeFileSync(
        join(fixtureRoot, 'src/locales/de.json'),
        catalogue({
            [RETINA_KEY]: '144 PPI — Retina 2x (Standard)',
            [PLAIN_KEY]: '72 PPI — Web / Vorschaubild',
        }),
    )
})

afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
})

/**
 * A fixture whose only unwrapped string is `label`.
 *
 * A label that is a product designation and a number reads the same in
 * every language, so the extractor treats it as copy that needs no
 * catalogue entry. The catalogue stays empty — the label is not a key.
 */
function writeLabelFixture(root: string, label: string): void {
    mkdirSync(join(root, 'src/locales'), { recursive: true })
    writeFileSync(
        join(root, 'src/Panel.ts'),
        [
            `const OPTION = { value: 288, label: '${label}' }`,
            'export { OPTION }',
            '',
        ].join('\n'),
    )
    writeFileSync(join(root, 'src/locales/en.json'), catalogue({}))
    writeFileSync(join(root, 'src/locales/de.json'), catalogue({}))
}

describe('the i18n extractor', () => {
    it('harvests a String.raw tagged template as a catalogue key', () => {
        expect(checkFixture()).toBe(0)
    })

    it('rejects a catalogue that drifts from the source', () => {
        // The same fixture with a key the source does not contain: the
        // gate has to fail, or the check above proves nothing.
        const deFile = join(fixtureRoot, 'src/locales/de.json')
        writeFileSync(
            deFile,
            catalogue({
                [RETINA_KEY]: '144 PPI — Retina 2x (Standard)',
                [PLAIN_KEY]: '72 PPI — Web / Vorschaubild',
                'A key nobody wrote': 'x',
            }),
        )
        expect(checkFixture()).not.toBe(0)
    })
})

describe('the excluded terms', () => {
    let labelRoot: string

    beforeAll(() => {
        labelRoot = mkdtempSync(join(tmpdir(), 'i18n-label-'))
    })

    afterAll(() => {
        rmSync(labelRoot, { recursive: true, force: true })
    })

    it('does not report a label that is a product designation', () => {
        writeLabelFixture(labelRoot, '288 PPI — Retina @4x')
        expect(checkFixture(labelRoot)).toBe(0)
    })

    it('reports a label that merely contains the excluded term', () => {
        // The match is exact, so the word added here makes it copy again.
        writeLabelFixture(labelRoot, '288 PPI — Retina @4x print')
        expect(checkFixture(labelRoot)).not.toBe(0)
    })
})
