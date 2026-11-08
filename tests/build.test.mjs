import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { buildArchive } from '../scripts/lib/build.mjs'
import { REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.mjs'
import { collectFiles } from '../scripts/lib/package.mjs'
import { createSignatureFile, fingerprint, rawPublicKeyOf, SIGNATURE_FILE, verifySignature } from '../scripts/lib/signature.mjs'
import { readZip, writeZip } from '../scripts/lib/zip.mjs'

const node = (script, args, env = {}) => spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  env: { ...process.env, AGENT_PETS_SIGNING_KEY: '', ...env },
})

let temp
let keyPath
let privateKey

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
    for (const [path, bytes] of source) assert.ok(files.get(path).equals(bytes), path)
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
    tampered.set('plugin.json', Buffer.concat([files.get('plugin.json'), Buffer.from(' ')]))
    assert.equal(verifySignature(tampered).valid, false)
    const extra = new Map(files)
    extra.set('licenses.json', Buffer.from('{}'))
    assert.equal(verifySignature(extra).valid, false)
    const bad = new Map(files)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, note: 'x' })))
    assert.match(verifySignature(bad).reason, /exactly alg, publicKey and signature/)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, alg: 'rsa' })))
    assert.match(verifySignature(bad).reason, /algorithm/)
    bad.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, publicKey: `${document.publicKey}\n` })))
    assert.equal(verifySignature(bad).valid, false)
  })
})

describe('command-line scripts', () => {
  it('build writes an unsigned archive that verify accepts', () => {
    const out = join(temp, 'unsigned')
    const build = node('scripts/build.mjs', ['--out', out])
    assert.equal(build.status, 0, build.stderr)
    const archive = join(out, 'panel-theme-collection-1.0.0.agentpet-plugin')
    assert.ok(existsSync(archive))
    assert.ok(!readZip(readFileSync(archive)).has(SIGNATURE_FILE))
    const verify = node('scripts/verify.mjs', [archive])
    assert.equal(verify.status, 0, verify.stderr)
    assert.match(verify.stdout, /unsigned/)
    // --require-signature must work before or after the archive path.
    for (const args of [[archive, '--require-signature'], ['--require-signature', archive]]) {
      const strict = node('scripts/verify.mjs', args)
      assert.equal(strict.status, 1, args.join(' '))
      assert.match(strict.stderr, /archive is unsigned/, args.join(' '))
    }
    const typo = node('scripts/verify.mjs', ['--require-signatures', archive])
    assert.equal(typo.status, 1)
    assert.match(typo.stderr, /unknown option --require-signatures/)
  })

  it('sign needs a key path and refuses keys inside the repository', () => {
    const none = node('scripts/sign.mjs', ['--out', join(temp, 'x')])
    assert.notEqual(none.status, 0)
    assert.match(none.stderr, /no signing key/)
    const inside = node('scripts/sign.mjs', ['--key', resolve(REPO_ROOT, 'keys', 'never.pem'), '--out', join(temp, 'x')])
    assert.notEqual(inside.status, 0)
    assert.match(inside.stderr, /inside this repository/)
    assert.ok(!existsSync(resolve(REPO_ROOT, 'keys')))
  })

  it('sign (env or flag) writes a signed archive that verify and catalog-entry accept', () => {
    const out = join(temp, 'signed')
    const sign = node('scripts/sign.mjs', ['--out', out], { AGENT_PETS_SIGNING_KEY: keyPath })
    assert.equal(sign.status, 0, sign.stderr)
    const print = fingerprint(rawPublicKeyOf(privateKey))
    assert.match(sign.stdout, new RegExp(`fingerprint: ${print}`))
    assert.match(sign.stdout, /sha256: +[0-9a-f]{64}/)
    assert.doesNotMatch(sign.stdout + sign.stderr, /PRIVATE KEY/)
    assert.ok(!existsSync(join(SRC_DIR, SIGNATURE_FILE)))

    const archive = join(out, 'panel-theme-collection-1.0.0.agentpet-plugin')
    const files = readZip(readFileSync(archive))
    assert.equal(verifySignature(files).valid, true)
    for (const args of [[archive, '--require-signature'], ['--require-signature', archive]]) assert.equal(node('scripts/verify.mjs', args).status, 0, args.join(' '))

    const again = node('scripts/sign.mjs', ['--key', keyPath, '--out', join(temp, 'signed-again')])
    assert.equal(again.status, 0, again.stderr)
    assert.ok(readFileSync(archive).equals(readFileSync(join(temp, 'signed-again', 'panel-theme-collection-1.0.0.agentpet-plugin'))))

    const entry = node('scripts/catalog-entry.mjs', [archive, '--published-at', '2026-11-08T00:00:00Z'])
    assert.equal(entry.status, 0, entry.stderr)
    const parsed = JSON.parse(entry.stdout)
    assert.equal(parsed.publicKeyFingerprint, print)
    assert.equal(parsed.versions[0].minAppVersion, '1.12.0')
    assert.equal(parsed.versions[0].size, statSync(archive).size)
    assert.equal(parsed.versions[0].publishedAt, '2026-11-08T00:00:00.000Z')
    assert.equal(node('scripts/catalog-entry.mjs', [join(temp, 'unsigned', 'panel-theme-collection-1.0.0.agentpet-plugin')]).status, 1)
  })

  it('keygen writes a 0600 key outside the repo and never overwrites', () => {
    const out = join(temp, 'keys', 'generated.pem')
    const first = node('scripts/keygen.mjs', ['--out', out])
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stdout, /fingerprint: [0-9a-f]{16}/)
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600)
    const before = readFileSync(out)
    assert.notEqual(node('scripts/keygen.mjs', ['--out', out]).status, 0)
    assert.ok(readFileSync(out).equals(before))
    const inside = node('scripts/keygen.mjs', ['--out', resolve(REPO_ROOT, 'keys', 'k.pem')])
    assert.notEqual(inside.status, 0)
    assert.ok(!existsSync(resolve(REPO_ROOT, 'keys')))
  })

  it('validate exits non-zero on a broken package folder', () => {
    const broken = join(temp, 'broken')
    cpSync(SRC_DIR, broken, { recursive: true })
    const manifest = JSON.parse(readFileSync(join(broken, 'plugin.json'), 'utf8'))
    manifest.contributes.panelThemes[0].modes.light.colors.textMuted = '#c0b0b8'
    writeFileSync(join(broken, 'plugin.json'), JSON.stringify(manifest))
    const result = node('scripts/validate.mjs', [broken])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /error: sakura\.light\.colors\.textMuted: /)
    assert.equal(node('scripts/validate.mjs', []).status, 0)
  })
})
