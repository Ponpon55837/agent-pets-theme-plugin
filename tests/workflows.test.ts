import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { REPO_ROOT } from '../scripts/lib/cli.ts'

/**
 * Scripts the workflows run from another repository's checkout, not this one.
 * The catalog's validator runs inside catalog-base (Ponpon55837/agent-pets-plugins).
 */
const EXTERNAL_SCRIPTS = new Set(['scripts/validate-catalog.mjs'])

/** Every `scripts/…` file named by the workflows and the CI shell steps. */
function referencedScripts(): Array<{ file: string, script: string }> {
  const sources = [
    ...readdirSync(resolve(REPO_ROOT, '.github/workflows')).map(name => join('.github/workflows', name)),
    ...readdirSync(resolve(REPO_ROOT, 'scripts/ci')).map(name => join('scripts/ci', name)),
  ]
  return sources.flatMap(file => [...readFileSync(resolve(REPO_ROOT, file), 'utf8').matchAll(/\bscripts\/[\w./-]+\.(?:ts|mjs|sh)\b/g)]
    .map(match => ({ file, script: match[0] })))
}

describe('workflow script paths', () => {
  it('name only scripts that exist here, or the catalog repository\'s own', () => {
    const references = referencedScripts()
    assert.ok(references.length > 10, 'the workflows run this repository\'s scripts')
    for (const { file, script } of references) {
      if (EXTERNAL_SCRIPTS.has(script)) continue
      assert.ok(existsSync(resolve(REPO_ROOT, script)), `${file} runs ${script}, which does not exist in this repository`)
    }
  })

  it('still runs the catalog validator under its own name', () => {
    const release = readFileSync(resolve(REPO_ROOT, '.github/workflows/release.yml'), 'utf8')
    for (const script of EXTERNAL_SCRIPTS) assert.ok(release.includes(`node ${script}`), `release.yml runs ${script}`)
  })
})
