import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { buildArchive } from '../scripts/lib/build.mjs'
import { REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.mjs'
import { assertKeyPathOutsideRepos, gitWorkTreeOf, isInside } from '../scripts/lib/keyfile.mjs'
import { collectFiles, validatePackage } from '../scripts/lib/package.mjs'
import { readZip } from '../scripts/lib/zip.mjs'
import { loadManifest, packageWith } from './helpers.mjs'

let temp

before(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), 'panel-theme-hardening-')))
})

after(() => {
  rmSync(temp, { recursive: true, force: true })
})

const gitEnvFree = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))

function makeRepo(name) {
  const dir = join(temp, name)
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', dir], { env: gitEnvFree() })
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
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/sign.mjs'), '--key', join(link, 'keys', 'key.pem'), '--out', join(temp, 'out')], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /inside this repository/)
  })

  it('ignores GIT_DIR and GIT_WORK_TREE from the environment', () => {
    const repo = makeRepo('other-repo')
    const saved = { dir: process.env.GIT_DIR, tree: process.env.GIT_WORK_TREE }
    process.env.GIT_DIR = '/nonexistent'
    process.env.GIT_WORK_TREE = '/nonexistent'
    try {
      assert.equal(realpathSync(gitWorkTreeOf(join(repo, 'key.pem'))), repo)
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

describe('strict ZIP reader matches the app', () => {
  const archive = () => Buffer.from(buildArchive(SRC_DIR).bytes)
  // The first local header is at offset 0 (assets/icon.png).
  const cases = [
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
    const json = files.get('plugin.json')
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

  it('does not parse an oversized plugin.json', () => {
    const files = packageWith(loadManifest())
    files.set('plugin.json', Buffer.alloc(256 * 1024 + 1, 0x20))
    assert.deepEqual(validatePackage(files).errors, ['plugin.json: larger than 256 KB'])
  })
})
