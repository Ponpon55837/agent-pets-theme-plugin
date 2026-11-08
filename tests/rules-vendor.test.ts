import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { REPO_ROOT } from '../scripts/lib/cli.ts'
import { RULES_DIR, readVendorManifest, vendoredDrift } from '../scripts/lib/rules/vendor.ts'

// Set AGENT_PETS_APP_DIR to an agent-pets checkout to compare against the pinned commit itself.
const APP_DIR = process.env.AGENT_PETS_APP_DIR

describe('vendored app validator', () => {
  it('is pinned to one app commit and unedited since', () => {
    const manifest = readVendorManifest()
    assert.match(manifest.commit, /^[0-9a-f]{40}$/)
    assert.deepEqual(manifest.files.map(file => file.source).sort(), ['electron/panel-theme-color.ts', 'electron/pet-sprite-validation.ts', 'electron/plugin-panel-themes.ts', 'src/types/panel-theme.ts', 'src/types/pet-import.ts', 'src/types/plugin.ts'])
    assert.deepEqual(vendoredDrift(manifest), [])
  })

  it('imports only its own vendored files at run time', () => {
    for (const file of readVendorManifest().files) {
      const source = readFileSync(resolve(RULES_DIR, file.path), 'utf8')
      const runtime = [...source.matchAll(/^import (?!type )[^;]*?from '([^']+)'/gms)].map(match => match[1])
      for (const specifier of runtime) assert.match(specifier, /^\.\/[a-z0-9-]+\.ts$/, `${file.path} imports ${specifier}`)
    }
  })

  it('equals the pinned commit of the app repository', { skip: APP_DIR ? false : 'set AGENT_PETS_APP_DIR to check against the app' }, () => {
    assert.ok(APP_DIR)
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/sync-rules.ts'), '--app', APP_DIR, '--check'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  })
})
