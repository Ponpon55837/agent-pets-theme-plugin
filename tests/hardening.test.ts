import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { buildArchive } from '../scripts/lib/build.ts'
import { gitFreeEnv, REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.ts'
import { readRegularFile } from '../scripts/lib/files.ts'
import { assertKeyPathOutsideRepos, gitWorkTreeOf, isInside, KEY_FILE_MAX_BYTES, readPrivateKeyFile } from '../scripts/lib/keyfile.ts'
import { collectFiles, validatePackage } from '../scripts/lib/package.ts'
import { createSignatureFile, SIGNATURE_FILE, verifySignature } from '../scripts/lib/signature.ts'
import { readZip, writeZip } from '../scripts/lib/zip.ts'
import { loadManifest, packageWith } from './helpers.ts'

let temp: string

before(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), 'panel-theme-hardening-')))
})

after(() => {
  rmSync(temp, { recursive: true, force: true })
})

function makeRepo(name: string): string {
  const dir = join(temp, name)
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', dir], { env: gitFreeEnv() })
  return dir
}

describe('key path guard', () => {
  it('accepts a plain temporary directory', () => {
    assert.doesNotThrow(() => assertKeyPathOutsideRepos(join(temp, 'plain', 'key.pem')))
  })

  it('resolves symlinks that point into the repository', () => {
    const link = join(temp, 'link-to-repo')
    symlinkSync(REPO_ROOT, link)
    assert.throws(() => assertKeyPathOutsideRepos(join(link, 'keys', 'key.pem')), /inside this repository/)
    // The sign script must refuse it too, without creating anything in the repo.
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/sign.ts'), '--key', join(link, 'keys', 'key.pem'), '--out', join(temp, 'out')], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /inside this repository/)
  })

  it('ignores GIT_DIR and GIT_WORK_TREE from the environment', () => {
    const repo = makeRepo('other-repo')
    const saved = { dir: process.env.GIT_DIR, tree: process.env.GIT_WORK_TREE }
    process.env.GIT_DIR = '/nonexistent'
    process.env.GIT_WORK_TREE = '/nonexistent'
    try {
      assert.equal(realpathSync(gitWorkTreeOf(join(repo, 'key.pem'))!), repo)
      assert.throws(() => assertKeyPathOutsideRepos(join(repo, 'key.pem')), /git work tree/)
      assert.throws(() => assertKeyPathOutsideRepos(join(REPO_ROOT, 'k.pem')), /inside this repository/)
    } finally {
      if (saved.dir === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = saved.dir
      if (saved.tree === undefined) delete process.env.GIT_WORK_TREE
      else process.env.GIT_WORK_TREE = saved.tree
    }
  })

  it('refuses paths inside any .git directory', () => {
    const repo = makeRepo('git-dir-repo')
    assert.throws(() => assertKeyPathOutsideRepos(join(repo, '.git', 'key.pem')), /\.git directory/)
    assert.throws(() => assertKeyPathOutsideRepos(join(temp, 'loose', '.git', 'objects', 'key.pem')), /\.git directory/)
  })

  it('compares paths case-insensitively on macOS and Windows', { skip: !['darwin', 'win32'].includes(process.platform) }, () => {
    assert.equal(isInside(REPO_ROOT, join(REPO_ROOT.toUpperCase(), 'keys')), true)
    assert.throws(() => assertKeyPathOutsideRepos(join(REPO_ROOT.toUpperCase(), 'keys', 'k.pem')), /inside this repository/)
    assert.throws(() => assertKeyPathOutsideRepos(join(temp, 'loose', '.GIT', 'k.pem')), /\.git directory/)
  })

  it('fails closed without git when an ancestor has a .git entry', () => {
    const fake = join(temp, 'fake-checkout')
    mkdirSync(join(fake, 'nested'), { recursive: true })
    writeFileSync(join(fake, '.git'), 'gitdir: elsewhere\n')
    assert.throws(() => assertKeyPathOutsideRepos(join(fake, 'nested', 'k.pem'), { git: 'definitely-not-git-binary' }), /git work tree/)
    assert.doesNotThrow(() => assertKeyPathOutsideRepos(join(temp, 'no-git-here', 'k.pem'), { git: 'definitely-not-git-binary' }))
  })
})

describe('key file reads', () => {
  const sign = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/sign.ts'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, AGENT_PETS_SIGNING_KEY: '', ...env },
  })
  const writeKey = (name: string, mode = 0o600) => {
    const path = join(temp, 'keys', name)
    mkdirSync(join(temp, 'keys'), { recursive: true })
    writeFileSync(path, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode })
    chmodSync(path, mode)
    return path
  }

  it('refuses a key that other users can read', { skip: process.platform === 'win32' }, () => {
    const loose = writeKey('loose.pem', 0o644)
    assert.throws(() => readPrivateKeyFile(loose), /accessible to other users \(mode 644\)/)
    const result = sign(['--key', loose, '--out', join(temp, 'loose-out')])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /chmod 600/)
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE KEY/)
  })

  it('refuses a symlinked, oversized or non-regular key file', () => {
    const real = writeKey('real.pem')
    const link = join(temp, 'keys', 'link.pem')
    symlinkSync(real, link)
    assert.throws(() => readPrivateKeyFile(link), /symbolic link/)
    const big = join(temp, 'keys', 'big.pem')
    writeFileSync(big, Buffer.alloc(KEY_FILE_MAX_BYTES + 1, 0x41), { mode: 0o600 })
    assert.throws(() => readPrivateKeyFile(big), /larger than/)
    assert.throws(() => readPrivateKeyFile(join(temp, 'keys')), /not a regular file/)
    assert.throws(() => readPrivateKeyFile(join(temp, 'keys', 'missing.pem')), /does not exist/)
  })

  it('expands ~ in --key=~/… the way the shell would', () => {
    writeKey('home.pem')
    const result = sign(['--key=~/keys/home.pem', '--out', join(temp, 'home-out')], { HOME: temp, USERPROFILE: temp })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /fingerprint: [0-9a-f]{16}/)
  })
})

describe('bounded file reads', () => {
  it('reads exactly a regular file and refuses links, folders and oversized files', () => {
    const dir = join(temp, 'bounded')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.bin'), 'abc')
    assert.equal(readRegularFile(join(dir, 'a.bin'), 3).bytes.toString(), 'abc')
    assert.throws(() => readRegularFile(join(dir, 'a.bin'), 2, 'a.bin'), /a\.bin: larger than 2 bytes/)
    symlinkSync(join(dir, 'a.bin'), join(dir, 'link.bin'))
    assert.throws(() => readRegularFile(join(dir, 'link.bin'), 10, 'link.bin'), /link\.bin: is a symbolic link/)
    assert.throws(() => readRegularFile(dir, 10, 'dir'), /dir: not a regular file/)
  })

  it('bounds the number of folders in a package folder', () => {
    const dir = join(temp, 'folders')
    for (let index = 0; index < 3; index += 1) mkdirSync(join(dir, `d${index}`), { recursive: true })
    assert.throws(() => collectFiles(dir, { maxFiles: 2 }), /more than 2 directories/)
    assert.equal(collectFiles(dir, { maxFiles: 3 }).size, 0)
  })
})

describe('signature verification matches the app', () => {
  const signed = () => {
    const files = collectFiles(SRC_DIR)
    const { bytes } = createSignatureFile(files, generateKeyPairSync('ed25519').privateKey)
    files.set(SIGNATURE_FILE, bytes)
    return { files, document: JSON.parse(bytes.toString('utf8')) }
  }

  it('refuses an oversized or non-UTF-8 signature.json without throwing', () => {
    const { files, document } = signed()
    files.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, pad: ' '.repeat(4096) })))
    assert.match(verifySignature(files).reason!, /larger than 4096 bytes/)
    files.set(SIGNATURE_FILE, Buffer.concat([Buffer.from('{"alg":"ed25519","publicKey":"'), Buffer.from([0xff]), Buffer.from('"}')]))
    assert.match(verifySignature(files).reason!, /not valid UTF-8 JSON/)
  })

  it('refuses unpadded or over-long base64 the app refuses', () => {
    const { files, document } = signed()
    files.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ ...document, publicKey: document.publicKey.replace(/=+$/, '') })))
    assert.match(verifySignature(files).reason!, /canonical base64/)
  })
})

describe('strict ZIP reader matches the app', () => {
  const archive = () => Buffer.from(buildArchive(SRC_DIR).bytes)
  // The first local header is at offset 0 (assets/icon.png).
  const cases: Array<[string, (bytes: Buffer) => void]> = [
    ['zeroed local CRC', bytes => bytes.writeUInt32LE(0, 14)],
    ['wrong local compressed size', bytes => bytes.writeUInt32LE(bytes.readUInt32LE(18) + 1, 18)],
    ['wrong local uncompressed size', bytes => bytes.writeUInt32LE(bytes.readUInt32LE(22) - 1, 22)],
    ['local flags mismatch', bytes => bytes.writeUInt16LE(0, 6)],
    ['local name bytes differ', bytes => { bytes[30] = 'A'.charCodeAt(0) }],
  ]
  for (const [label, tamper] of cases) {
    it(`rejects ${label}`, () => {
      const bytes = archive()
      assert.ok(readZip(bytes).size > 0)
      tamper(bytes)
      assert.throws(() => readZip(bytes), /local header disagrees/)
    })
  }

  it('rejects reparse points, other disks, ZIP64 markers and records past the central directory', () => {
    const one = () => writeZip(new Map([['a.json', Buffer.from('{}')]]))
    const central = (bytes: Buffer) => bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    const eocd = (bytes: Buffer) => bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const cases: Array<[(bytes: Buffer) => void, RegExp]> = [
      [bytes => { bytes.writeUInt16LE(20, central(bytes) + 4); bytes.writeUInt32LE(0x400, central(bytes) + 38) }, /reparse points/],
      [bytes => bytes.writeUInt16LE(1, central(bytes) + 34), /multi-disk/],
      [bytes => bytes.writeUInt32LE(0xffffffff, central(bytes) + 42), /ZIP64 entries/],
      [bytes => bytes.writeUInt32LE(0xffffffff, eocd(bytes) + 16), /ZIP64 archives/],
      [bytes => bytes.writeUInt16LE(0x200, central(bytes) + 32), /corrupt central directory/],
    ]
    for (const [tamper, pattern] of cases) {
      const bytes = one()
      tamper(bytes)
      assert.throws(() => readZip(bytes), pattern, String(pattern))
    }
  })

  it('rejects stored entries whose sizes differ in the central directory', () => {
    const bytes = archive()
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(bytes.readUInt32LE(central + 20) + 1, central + 20)
    assert.throws(() => readZip(bytes), /stored entry sizes differ/)
  })
})

describe('package text and paths', () => {
  it('rejects a plugin.json that is not valid UTF-8', () => {
    const files = packageWith(loadManifest())
    const json = files.get('plugin.json')!
    const at = json.indexOf(Buffer.from('Ponpon55837'))
    const broken = Buffer.concat([json.subarray(0, at), Buffer.from([0xff]), json.subarray(at + 1)])
    files.set('plugin.json', broken)
    assert.match(validatePackage(files).errors.join('\n'), /plugin\.json: invalid UTF-8 JSON/)
    const other = packageWith(loadManifest(), { add: { 'extra.json': Buffer.from([0x7b, 0x22, 0xc3, 0x22, 0x7d]) } })
    assert.match(validatePackage(other).errors.join('\n'), /extra\.json: invalid UTF-8 JSON/)
  })

  it('rejects paths that are not NFC', () => {
    const decomposed = 'café.json'
    const result = validatePackage(packageWith(loadManifest(), { add: { [decomposed]: '{}' } }))
    assert.match(result.errors.join('\n'), /NFC/)
  })

  it('rejects paths that differ only by case', () => {
    const files = packageWith(loadManifest(), { add: { 'Assets/Icon.png': Buffer.alloc(0) } })
    assert.match(validatePackage(files).errors.join('\n'), /Assets\/Icon\.png: duplicates assets\/icon\.png/)
  })

  it('stops reading a folder at the file-count and size caps and refuses links', () => {
    const dir = join(temp, 'collect')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'a.json'), '{}')
    writeFileSync(join(dir, 'sub', 'b.json'), '{"k":1}')
    assert.deepEqual([...collectFiles(dir).keys()], ['a.json', 'sub/b.json'])
    assert.throws(() => collectFiles(dir, { maxFiles: 1 }), /more than 1 files/)
    assert.throws(() => collectFiles(dir, { maxTotalBytes: 8 }), /larger than 8 bytes/)
    symlinkSync(join(dir, 'a.json'), join(dir, 'sub', 'link.json'))
    assert.throws(() => collectFiles(dir), /sub\/link\.json: symbolic links are not allowed/)
  })

  it('applies the app\'s plain-text rule to author', () => {
    for (const author of ['<>', ' \u0000 ', 'x'.repeat(65)]) {
      const manifest = loadManifest()
      manifest.author = author
      assert.match(validatePackage(packageWith(manifest)).errors.join('\n'), /^author: /m, JSON.stringify(author))
    }
  })

  it('does not parse an oversized plugin.json', () => {
    const files = packageWith(loadManifest())
    files.set('plugin.json', Buffer.alloc(256 * 1024 + 1, 0x20))
    assert.deepEqual(validatePackage(files).errors, ['plugin.json: larger than 256 KB'])
  })
})
