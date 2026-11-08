import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { loadArchive } from '../scripts/lib/archive.ts'
import { archiveName, buildArchive } from '../scripts/lib/build.ts'
import { catalogEntry, parsePublishedAt } from '../scripts/lib/catalog.ts'
import { REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.ts'
import { collectFiles } from '../scripts/lib/package.ts'
import { createSignatureFile, fingerprint, rawPublicKeyOf, sha256Hex, SIGNATURE_FILE, verifySignature } from '../scripts/lib/signature.ts'
import { readZip, writeZip } from '../scripts/lib/zip.ts'
import { loadManifest } from './helpers.ts'

/** The archive the build and sign scripts write for the current src/plugin.json. */
const ARCHIVE = archiveName(loadManifest())

const node = (script: string, args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  env: { ...process.env, AGENT_PETS_SIGNING_KEY: '', ...env },
})

let temp: string
let keyPath: string
let privateKey: KeyObject

before(() => {
  // Ephemeral key in a temporary directory outside the repository; deleted in after().
  temp = mkdtempSync(join(tmpdir(), 'panel-theme-test-'))
  keyPath = join(temp, 'ephemeral.pem')
  privateKey = generateKeyPairSync('ed25519').privateKey
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
})

after(() => {
  rmSync(temp, { recursive: true, force: true })
})

describe('archive', () => {
  it('is deterministic and round-trips through the strict reader', () => {
    const first = buildArchive(SRC_DIR).bytes
    const second = buildArchive(SRC_DIR).bytes
    assert.ok(first.equals(second))
    const files = readZip(first)
    const source = collectFiles(SRC_DIR)
    assert.deepEqual([...files.keys()], [...source.keys()].sort())
    for (const [path, bytes] of source) assert.ok(files.get(path)?.equals(bytes), path)
    assert.ok(files.has('plugin.json'))
  })

  it('rejects tampered archives', () => {
    const bytes = Buffer.from(buildArchive(SRC_DIR).bytes)
    const at = bytes.indexOf(Buffer.from('"panel-theme-collection"'))
    bytes[at + 2] = 'X'.charCodeAt(0)
    assert.throws(() => readZip(bytes), /CRC-32 mismatch/)
    assert.throws(() => readZip(Buffer.concat([bytes, Buffer.from('trailing')])), /end of central directory/)
    const dupes = writeZip(new Map([['a.json', Buffer.from('{}')]]))
    assert.equal(readZip(dupes).size, 1)
    assert.throws(() => readZip(writeZip(new Map([['../evil.json', Buffer.from('{}')]]))), /unsafe entry name/)
  })
})

describe('signature', () => {
  it('signs the sorted path/sha256 list and verifies it', () => {
    const files = collectFiles(SRC_DIR)
    const { bytes, fingerprint: print, rawPublicKey } = createSignatureFile(files, privateKey)
    assert.equal(print, fingerprint(rawPublicKeyOf(privateKey)))
    assert.match(print, /^[0-9a-f]{16}$/)
    const document = JSON.parse(bytes.toString('utf8'))
    assert.deepEqual(Object.keys(document), ['alg', 'publicKey', 'signature'])
    assert.equal(Buffer.from(document.publicKey, 'base64').length, 32)
    assert.equal(Buffer.from(document.signature, 'base64').length, 64)
    assert.ok(rawPublicKey.equals(Buffer.from(document.publicKey, 'base64')))
    files.set(SIGNATURE_FILE, bytes)
    assert.equal(verifySignature(files).valid, true)

    const tampered = new Map(files)
    tampered.set('plugin.json', Buffer.concat([files.get('plugin.json')!, Buffer.from(' ')]))
    assert.equal(verifySignature(tampered).valid, false)
    const extra = new Map(files)
    extra.set('licenses.json', Buffer.from('{}'))
    assert.equal(verifySignature(extra).valid, false)
    const bad = new Map(files)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, note: 'x' })))
    assert.match(verifySignature(bad).reason!, /exactly alg, publicKey and signature/)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, alg: 'rsa' })))
    assert.match(verifySignature(bad).reason!, /algorithm/)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, publicKey: `${document.publicKey}\n` })))
    assert.equal(verifySignature(bad).valid, false)
  })
})

describe('command-line scripts', () => {
  it('build writes an unsigned archive that verify accepts', () => {
    const out = join(temp, 'unsigned')
    const build = node('scripts/build.ts', ['--out', out])
    assert.equal(build.status, 0, build.stderr)
    const archive = join(out, ARCHIVE)
    assert.ok(existsSync(archive))
    assert.ok(!readZip(readFileSync(archive)).has(SIGNATURE_FILE))
    const verify = node('scripts/verify.ts', [archive])
    assert.equal(verify.status, 0, verify.stderr)
    assert.match(verify.stdout, /unsigned/)
    // --require-signature must work before or after the archive path.
    for (const args of [[archive, '--require-signature'], ['--require-signature', archive]]) {
      const strict = node('scripts/verify.ts', args)
      assert.equal(strict.status, 1, args.join(' '))
      assert.match(strict.stderr, /archive is unsigned/, args.join(' '))
    }
    const typo = node('scripts/verify.ts', ['--require-signatures', archive])
    assert.equal(typo.status, 1)
    assert.match(typo.stderr, /unknown option --require-signatures/)
  })

  it('sign needs a key path and refuses keys inside the repository', () => {
    const none = node('scripts/sign.ts', ['--out', join(temp, 'x')])
    assert.notEqual(none.status, 0)
    assert.match(none.stderr, /no signing key/)
    const inside = node('scripts/sign.ts', ['--key', resolve(REPO_ROOT, 'keys', 'never.pem'), '--out', join(temp, 'x')])
    assert.notEqual(inside.status, 0)
    assert.match(inside.stderr, /inside this repository/)
    assert.ok(!existsSync(resolve(REPO_ROOT, 'keys')))
  })

  it('sign (env or flag) writes a signed archive that verify and catalog-entry accept', () => {
    const out = join(temp, 'signed')
    const sign = node('scripts/sign.ts', ['--out', out], { AGENT_PETS_SIGNING_KEY: keyPath })
    assert.equal(sign.status, 0, sign.stderr)
    const print = fingerprint(rawPublicKeyOf(privateKey))
    assert.match(sign.stdout, new RegExp(`fingerprint: ${print}`))
    assert.match(sign.stdout, /sha256: +[0-9a-f]{64}/)
    assert.doesNotMatch(sign.stdout + sign.stderr, /PRIVATE KEY/)
    assert.ok(!existsSync(join(SRC_DIR, SIGNATURE_FILE)))

    const archive = join(out, ARCHIVE)
    const files = readZip(readFileSync(archive))
    assert.equal(verifySignature(files).valid, true)
    for (const args of [[archive, '--require-signature'], ['--require-signature', archive]]) assert.equal(node('scripts/verify.ts', args).status, 0, args.join(' '))

    const again = node('scripts/sign.ts', ['--key', keyPath, '--out', join(temp, 'signed-again')])
    assert.equal(again.status, 0, again.stderr)
    assert.ok(readFileSync(archive).equals(readFileSync(join(temp, 'signed-again', ARCHIVE))))

    // verify pins the key fingerprint and the archive SHA-256 the catalog entry records.
    const sha256 = sha256Hex(readFileSync(archive))
    assert.equal(node('scripts/verify.ts', ['--fingerprint', print, '--sha256', sha256, archive]).status, 0)
    const otherKey = node('scripts/verify.ts', ['--fingerprint', '0123456789abcdef', archive])
    assert.equal(otherKey.status, 1)
    assert.match(otherKey.stderr, new RegExp(`signed by key ${print}, expected 0123456789abcdef`))
    const otherHash = node('scripts/verify.ts', ['--sha256', '0'.repeat(64), archive])
    assert.equal(otherHash.status, 1)
    assert.match(otherHash.stderr, /archive SHA-256 is [0-9a-f]{64}, expected 0{64}/)
    assert.match(node('scripts/verify.ts', ['--fingerprint', 'xyz', archive]).stderr, /16 hex characters/)
    const unsigned = join(temp, 'unsigned', ARCHIVE)
    assert.match(node('scripts/verify.ts', ['--fingerprint', print, unsigned]).stderr, /archive is unsigned/)

    const entry = node('scripts/catalog-entry.ts', [archive, '--published-at', '2026-11-08T00:00:00Z'])
    assert.equal(entry.status, 0, entry.stderr)
    const parsed = JSON.parse(entry.stdout)
    // The exact key sets of the app's catalog parser (CATALOG_PLUGIN_KEYS, CATALOG_VERSION_KEYS).
    assert.deepEqual(Object.keys(parsed).sort(), ['author', 'description', 'homepage', 'id', 'name', 'publicKeyFingerprint', 'versions'])
    assert.deepEqual(Object.keys(parsed.versions[0]).sort(), ['apiVersion', 'minAppVersion', 'publishedAt', 'sha256', 'size', 'url', 'version'])
    assert.equal(parsed.publicKeyFingerprint, print)
    assert.equal(parsed.versions[0].minAppVersion, '1.12.0')
    assert.equal(parsed.versions[0].sha256, sha256)
    assert.equal(parsed.versions[0].size, statSync(archive).size)
    assert.equal(parsed.versions[0].publishedAt, '2026-11-08T00:00:00.000Z')
    assert.equal(parsed.versions[0].url, `https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/${ARCHIVE}`)
    assert.equal(node('scripts/catalog-entry.ts', [unsigned]).status, 1)
    const notIso = node('scripts/catalog-entry.ts', [archive, '--published-at', 'November 8, 2026'])
    assert.equal(notIso.status, 1)
    assert.match(notIso.stderr, /ISO 8601/)
    assert.match(node('scripts/catalog-entry.ts', [join(temp, 'missing.agentpet-plugin')]).stderr, /archive: does not exist/)

    // A manifest text the app normalises but the catalog parser would drop is refused.
    const loaded = loadArchive(archive)
    loaded.result.manifest!.author = ' Ponpon55837'
    assert.throws(() => catalogEntry(loaded, new Date('2026-11-08T00:00:00Z')), /author: must be 1-64 trimmed characters/)
  })

  it('accepts only ISO 8601 publish times the app parses', () => {
    assert.equal(parsePublishedAt('2026-11-08T09:30:00+08:00')?.toISOString(), '2026-11-08T01:30:00.000Z')
    for (const value of ['2026-11-08', '2026-11-08 00:00:00Z', 'Nov 8 2026', '2026-13-40T00:00:00Z']) assert.equal(parsePublishedAt(value), null, value)
  })

  it('keygen writes a 0600 key outside the repo and never overwrites', () => {
    const out = join(temp, 'keys', 'generated.pem')
    const first = node('scripts/keygen.ts', ['--out', out])
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stdout, /fingerprint: [0-9a-f]{16}/)
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600)
    const before = readFileSync(out)
    assert.notEqual(node('scripts/keygen.ts', ['--out', out]).status, 0)
    assert.ok(readFileSync(out).equals(before))
    const inside = node('scripts/keygen.ts', ['--out', resolve(REPO_ROOT, 'keys', 'k.pem')])
    assert.notEqual(inside.status, 0)
    assert.ok(!existsSync(resolve(REPO_ROOT, 'keys')))
  })

  it('validate exits non-zero on a broken package folder', () => {
    const broken = join(temp, 'broken')
    cpSync(SRC_DIR, broken, { recursive: true })
    const manifest = JSON.parse(readFileSync(join(broken, 'plugin.json'), 'utf8'))
    manifest.contributes.panelThemes[0].modes.light.colors.textMuted = '#c0b0b8'
    writeFileSync(join(broken, 'plugin.json'), JSON.stringify(manifest))
    const result = node('scripts/validate.ts', [broken])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /error: sakura\.light\.colors\.textMuted: /)
    assert.equal(node('scripts/validate.ts', []).status, 0)
  })
})
