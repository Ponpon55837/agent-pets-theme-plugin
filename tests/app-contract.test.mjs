// Cross-checks against the app's own modules. Set AGENT_PETS_APP_DIR to an
// agent-pets checkout (1.12.0 or later) to run them; they are skipped otherwise.

import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { loadArchive } from '../scripts/lib/archive.mjs'
import { archiveName, buildArchive } from '../scripts/lib/build.mjs'
import { catalogEntry, MIN_APP_VERSION } from '../scripts/lib/catalog.mjs'
import { SRC_DIR } from '../scripts/lib/cli.mjs'
import { ALLOWED_EXTENSIONS, PACKAGE_LIMITS } from '../scripts/lib/package.mjs'

const APP_DIR = process.env.AGENT_PETS_APP_DIR
const skip = APP_DIR ? false : 'set AGENT_PETS_APP_DIR to check against the app'
const appModule = name => import(pathToFileURL(resolve(APP_DIR, 'electron', `${name}.ts`)).href)

let temp
let archive
before(() => {
  if (!APP_DIR) return
  temp = mkdtempSync(join(tmpdir(), 'panel-theme-contract-'))
  const { privateKey } = generateKeyPairSync('ed25519') // ephemeral, never written
  const built = buildArchive(SRC_DIR, { privateKey })
  const path = join(temp, archiveName(built.result.manifest))
  writeFileSync(path, built.bytes)
  archive = loadArchive(path)
})
after(() => {
  if (temp) rmSync(temp, { recursive: true, force: true })
})

describe('app contract', { skip }, () => {
  it('the app reads the archive, verifies the signature and accepts the manifest', async () => {
    const { guardArchive } = await appModule('archive-guard')
    const { verifyPluginSignature } = await appModule('plugin-signature')
    const { parsePluginManifest } = await appModule('plugin-manifest')
    // The limits planInstallArchive (plugin-registry.ts) passes for asset packages.
    const guarded = guardArchive(archive.bytes, {
      maxTotalBytes: PACKAGE_LIMITS.maxTotalBytes,
      maxFileBytes: 20 * 1024 * 1024,
      maxFiles: PACKAGE_LIMITS.maxFiles,
      allowedExtensions: ['.js', ...ALLOWED_EXTENSIONS, '.html', '.css'],
      mode: 'strict',
    })
    assert.equal(guarded.ok, true, guarded.error)
    assert.deepEqual([...guarded.files.keys()].sort(), [...archive.files.keys()].sort())
    assert.deepEqual(verifyPluginSignature(guarded.files), { status: 'valid', fingerprint: archive.signature.fingerprint })
    const manifest = parsePluginManifest(JSON.parse(Buffer.from(guarded.files.get('plugin.json')).toString('utf8')))
    assert.equal(manifest.ok, true, manifest.error)
  })

  it('the app catalog parser keeps the printed entry unchanged and gates it on 1.12.0', async () => {
    const { parsePluginCatalog, isCatalogVersionAppCompatible, catalogFingerprintMatches } = await appModule('plugin-catalog')
    const entry = catalogEntry(archive, new Date('2026-11-08T00:00:00Z'))
    const parsed = parsePluginCatalog({ schemaVersion: 1, plugins: [entry] })
    assert.equal(parsed.ok, true, parsed.error)
    assert.deepEqual(parsed.value.plugins, [entry])
    const [version] = entry.versions
    assert.equal(version.minAppVersion, MIN_APP_VERSION)
    assert.equal(MIN_APP_VERSION, '1.12.0')
    assert.equal(isCatalogVersionAppCompatible(version, '1.11.5'), false)
    assert.equal(isCatalogVersionAppCompatible(version, '1.12.0'), true)
    assert.equal(catalogFingerprintMatches(entry.publicKeyFingerprint, archive.signature.fingerprint), true)
    assert.equal(version.sha256, archive.sha256)
    assert.equal(version.size, archive.bytes.length)
  })
})
