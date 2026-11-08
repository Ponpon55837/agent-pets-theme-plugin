import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { loadArchive } from '../scripts/lib/archive.mjs'
import { archiveName, buildArchive } from '../scripts/lib/build.mjs'
import { catalogEntry } from '../scripts/lib/catalog.mjs'
import { CATALOG_MAX_VERSIONS, compareSemver, formatIndex, mergeCatalogEntry, parseIndex } from '../scripts/lib/catalog-merge.mjs'
import { gitFreeEnv, REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.mjs'
import { assertKeyPathOutsideRepos } from '../scripts/lib/keyfile.mjs'
import { checkReleaseTag, readPublisher, versionFromTag } from '../scripts/lib/release.mjs'
import { loadManifest } from './helpers.mjs'

const PINNED = 'e78c75d80c8fb08e'
const node = (script, args) => spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], { encoding: 'utf8' })

const version = (value, extra = {}) => ({
  version: value,
  apiVersion: '1',
  minAppVersion: '1.12.0',
  url: `https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/panel-theme-collection-${value}.agentpet-plugin`,
  sha256: 'a'.repeat(64),
  size: 1000,
  publishedAt: '2026-11-08T00:00:00.000Z',
  ...extra,
})
const entry = (value, fingerprint = PINNED) => ({
  id: 'panel-theme-collection',
  name: { 'zh-TW': '面板主題合集', 'en-US': 'Panel Theme Collection' },
  description: { 'zh-TW': '新的描述。', 'en-US': 'A new description.' },
  author: 'Ponpon55837',
  homepage: 'https://github.com/Ponpon55837/agent-pets-theme-plugin',
  publicKeyFingerprint: fingerprint,
  versions: [version(value)],
})

// Hand-written in the catalog's own layout, so the round trip is checked against real text.
const INDEX_TEXT = `{
  "schemaVersion": 1,
  "plugins": [
    {
      "id": "update-radar",
      "name": {
        "zh-TW": "AI 更新雷達",
        "en-US": "AI Update Radar"
      },
      "author": "someone",
      "publicKeyFingerprint": "ffb643e57400dee3",
      "versions": [
        {
          "version": "0.3.1",
          "apiVersion": "1",
          "url": "https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/update-radar-0.3.1.agentpet-plugin",
          "sha256": "${'b'.repeat(64)}",
          "size": 57596,
          "publishedAt": "2026-11-06T04:09:02.897Z"
        }
      ]
    },
    {
      "id": "panel-theme-collection",
      "name": {
        "zh-TW": "面板主題合集",
        "en-US": "Panel Theme Collection"
      },
      "description": {
        "zh-TW": "可自訂面板顏色、字型與背景的主題（含淺色與深色）。",
        "en-US": "Panel themes with colours, fonts and backgrounds for light and dark modes."
      },
      "author": "Ponpon55837",
      "homepage": "https://github.com/Ponpon55837/agent-pets-theme-plugin",
      "publicKeyFingerprint": "${PINNED}",
      "versions": [
        {
          "version": "1.0.0",
          "apiVersion": "1",
          "minAppVersion": "1.12.0",
          "url": "https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/panel-theme-collection-1.0.0.agentpet-plugin",
          "sha256": "${'c'.repeat(64)}",
          "size": 57974,
          "publishedAt": "2026-11-08T09:27:07.779Z"
        }
      ]
    }
  ]
}
`

/** True when every line of `before` appears in `after` in order, i.e. the change only adds lines. */
function onlyAddsLines(before, after) {
  const added = after.split('\n')
  let at = 0
  for (const line of before.split('\n')) {
    while (at < added.length && added[at] !== line) at += 1
    if (at === added.length) return false
    at += 1
  }
  return true
}

let temp
before(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), 'panel-theme-release-')))
})
after(() => {
  rmSync(temp, { recursive: true, force: true })
})

describe('semver precedence', () => {
  it('orders core, pre-release and build metadata the way the catalog matches versions', () => {
    const ascending = ['0.9.9', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.10.0']
    for (let index = 1; index < ascending.length; index += 1) {
      assert.equal(compareSemver(ascending[index - 1], ascending[index]), -1, `${ascending[index - 1]} < ${ascending[index]}`)
      assert.equal(compareSemver(ascending[index], ascending[index - 1]), 1)
    }
    assert.equal(compareSemver('1.0.0+rebuild', '1.0.0'), 0)
    assert.throws(() => compareSemver('1.0', '1.0.0'), /not a semver version: "1.0"/)
    assert.throws(() => compareSemver('1.0.0', '01.0.0'), /not a semver version: "01.0.0"/)
  })
})

describe('catalog merge', () => {
  it('keeps the catalog layout, so a merge only adds lines', () => {
    const index = parseIndex(INDEX_TEXT)
    assert.equal(formatIndex(index), INDEX_TEXT)
    const text = formatIndex(mergeCatalogEntry(index, entry('1.0.1')).index)
    assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'))
    assert.ok(onlyAddsLines(INDEX_TEXT, text))
    assert.throws(() => parseIndex(INDEX_TEXT.trimEnd()), /2-space, trailing-newline form/)
    assert.throws(() => parseIndex(JSON.stringify(index)), /2-space, trailing-newline form/)
    assert.throws(() => parseIndex('{"schemaVersion": 2, "plugins": []}'), /schemaVersion 1/)
    assert.throws(() => parseIndex('{'), /not valid JSON/)
  })

  it('puts a new version first and keeps every other field of the listed plugin', () => {
    const index = parseIndex(INDEX_TEXT)
    const snapshot = structuredClone(index)
    const { index: merged, added } = mergeCatalogEntry(index, entry('1.0.1'))
    assert.equal(added, 'version')
    assert.deepEqual(index, snapshot, 'the input is not modified')
    const [radar, plugin] = merged.plugins
    assert.deepEqual(radar, snapshot.plugins[0])
    assert.deepEqual(plugin.versions.map(item => item.version), ['1.0.1', '1.0.0'])
    assert.deepEqual(plugin.versions[0], version('1.0.1'))
    const { versions, ...fields } = plugin
    const { versions: oldVersions, ...oldFields } = snapshot.plugins[1]
    assert.deepEqual(fields, oldFields, 'name and description stay as listed')
    assert.deepEqual(Object.keys(plugin), Object.keys(snapshot.plugins[1]))
    assert.deepEqual(versions.slice(1), oldVersions)
  })

  it('adds a plugin the catalog does not list yet at the end', () => {
    const index = parseIndex(INDEX_TEXT)
    const fresh = { ...entry('0.1.0'), id: 'another-theme-pack' }
    const { index: merged, added } = mergeCatalogEntry(index, fresh)
    assert.equal(added, 'plugin')
    assert.equal(merged.plugins.length, 3)
    assert.deepEqual(merged.plugins[2], fresh)
    assert.notEqual(merged.plugins[2], fresh, 'the entry is copied')
  })

  it('refuses a published, an equal-precedence or an older version', () => {
    const index = parseIndex(INDEX_TEXT)
    assert.throws(() => mergeCatalogEntry(index, entry('1.0.0')), /1\.0\.0 is already published; published versions are immutable/)
    assert.throws(() => mergeCatalogEntry(index, entry('1.0.0+rebuild')), /already published/)
    assert.throws(() => mergeCatalogEntry(index, entry('0.9.0')), /0\.9\.0 is older than the published 1\.0\.0/)
    assert.throws(() => mergeCatalogEntry(index, entry('1.0.0-rc.1')), /older than the published 1\.0\.0/)
  })

  it('refuses a key change, a full versions list, a duplicated id and malformed entries', () => {
    const index = parseIndex(INDEX_TEXT)
    assert.throws(() => mergeCatalogEntry(index, entry('1.0.1', '0123456789abcdef')), /listed with key e78c75d80c8fb08e, the archive is signed by 0123456789abcdef/)
    const full = structuredClone(index)
    full.plugins[1].versions = Array.from({ length: CATALOG_MAX_VERSIONS }, (_, minor) => version(`0.${minor}.0`))
    assert.throws(() => mergeCatalogEntry(full, entry('1.0.1')), /already lists 20 versions/)
    const twice = structuredClone(index)
    twice.plugins.push(structuredClone(twice.plugins[1]))
    assert.throws(() => mergeCatalogEntry(twice, entry('1.0.1')), /lists panel-theme-collection 2 times/)
    assert.throws(() => mergeCatalogEntry(index, { ...entry('1.0.1'), versions: [version('1.0.1'), version('1.0.2')] }), /exactly one version/)
    assert.throws(() => mergeCatalogEntry(index, { ...entry('1.0.1'), publicKeyFingerprint: undefined }), /16-hex publicKeyFingerprint/)
    assert.throws(() => mergeCatalogEntry(index, entry('v1.0.1')), /not semver/)
  })
})

describe('release tag and publisher pin', () => {
  it('accepts only v<semver> tags that equal the manifest version', () => {
    assert.equal(versionFromTag('v1.2.3'), '1.2.3')
    assert.equal(versionFromTag('v1.2.3-rc.1'), '1.2.3-rc.1')
    for (const tag of ['1.2.3', 'v1.2', 'v01.2.3', 'release-1.2.3', 'v1.2.3 ', '', undefined]) assert.throws(() => versionFromTag(tag), /v<semver>/, String(tag))
    assert.equal(checkReleaseTag('v1.0.0', '1.0.0'), '1.0.0')
    assert.throws(() => checkReleaseTag('v1.0.1', '1.0.0'), /tag v1\.0\.1 does not match src\/plugin\.json version 1\.0\.0/)
    assert.throws(() => checkReleaseTag('v1.0.0+b', '1.0.0'), /does not match/)
  })

  it('pins the published publisher key and nothing else', () => {
    assert.deepEqual(readPublisher(), { publicKeyFingerprint: PINNED })
    const path = join(temp, 'publisher.json')
    for (const bad of [{ publicKeyFingerprint: 'E78C75D80C8FB08E' }, { publicKeyFingerprint: PINNED, extra: 1 }, { fingerprint: PINNED }, [PINNED]]) {
      writeFileSync(path, JSON.stringify(bad))
      assert.throws(() => readPublisher(path), /publisher\.json must be exactly/, JSON.stringify(bad))
    }
  })

  it('release-check prints the outputs and refuses a mismatched tag or a published version', () => {
    const { version: current, id } = loadManifest()
    const ok = node('scripts/release-check.mjs', ['--tag', `v${current}`])
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(ok.stdout, `version=${current}\narchive=${id}-${current}.agentpet-plugin\nfingerprint=${PINNED}\n`)
    assert.match(node('scripts/release-check.mjs', ['--tag', 'v0.0.1']).stderr, /does not match src\/plugin\.json version/)
    assert.match(node('scripts/release-check.mjs', []).stderr, /usage:/)

    const catalog = join(temp, 'index.json')
    const index = parseIndex(INDEX_TEXT)
    index.plugins[1].versions[0].version = current
    writeFileSync(catalog, formatIndex(index))
    assert.match(node('scripts/release-check.mjs', ['--tag', `v${current}`, '--catalog', catalog]).stderr, /already published; published versions are immutable/)
    index.plugins[1].publicKeyFingerprint = '0123456789abcdef'
    writeFileSync(catalog, formatIndex(index))
    assert.match(node('scripts/release-check.mjs', ['--tag', `v${current}`, '--catalog', catalog]).stderr, /lists panel-theme-collection with key 0123456789abcdef, publisher\.json pins e78c75d80c8fb08e/)
    index.plugins.pop()
    writeFileSync(catalog, formatIndex(index))
    assert.equal(node('scripts/release-check.mjs', ['--tag', `v${current}`, '--catalog', catalog]).status, 0, 'an unlisted plugin may be published')
  })
})

describe('catalog-merge command', () => {
  it('checks the entry against the archive bytes and the pinned key before writing', () => {
    const { privateKey } = generateKeyPairSync('ed25519') // throwaway, never written
    const built = buildArchive(SRC_DIR, { privateKey })
    const archive = join(temp, archiveName(built.result.manifest))
    writeFileSync(archive, built.bytes)
    const testEntry = catalogEntry(loadArchive(archive), new Date('2026-11-08T00:00:00Z'))
    const entryPath = join(temp, 'entry.json')
    writeFileSync(entryPath, JSON.stringify(testEntry))
    const indexPath = join(temp, 'merge-index.json')
    writeFileSync(indexPath, INDEX_TEXT)
    const run = extra => node('scripts/catalog-merge.mjs', ['--index', indexPath, '--entry', entryPath, ...extra])

    // A throwaway key is not the pinned publisher key.
    assert.match(run(['--archive', archive]).stderr, new RegExp(`signed by ${testEntry.publicKeyFingerprint}, publisher\\.json pins ${PINNED}`))
    const other = join(temp, 'other', archiveName(built.result.manifest))
    mkdirSync(join(temp, 'other'))
    writeFileSync(other, Buffer.concat([built.bytes, Buffer.from([0])]))
    assert.match(run(['--archive', other]).stderr, /size \d+ differs from the archive/)
    const renamed = join(temp, 'renamed.agentpet-plugin')
    writeFileSync(renamed, built.bytes)
    assert.match(run(['--archive', renamed]).stderr, /url does not end with \/renamed\.agentpet-plugin/)
    assert.equal(readFileSync(indexPath, 'utf8'), INDEX_TEXT, 'nothing is written on failure')
    assert.match(node('scripts/catalog-merge.mjs', ['--index', indexPath]).stderr, /usage:/)
  })
})

describe('signing key in CI', () => {
  it('accepts $RUNNER_TEMP next to the workspace and refuses a key inside the checkout', () => {
    // The hosted runner layout: <work>/_temp beside <work>/<repo>/<repo>.
    const work = join(temp, 'work')
    const checkout = join(work, 'agent-pets-theme-plugin', 'agent-pets-theme-plugin')
    mkdirSync(join(work, '_temp'), { recursive: true })
    mkdirSync(checkout, { recursive: true })
    execFileSync('git', ['init', '-q', checkout], { env: gitFreeEnv() })
    assert.doesNotThrow(() => assertKeyPathOutsideRepos(join(work, '_temp', 'signing-key.pem')))
    assert.throws(() => assertKeyPathOutsideRepos(join(checkout, 'signing-key.pem')), /git work tree/)
    assert.throws(() => assertKeyPathOutsideRepos(join(checkout, 'dist', 'signing-key.pem')), /git work tree/)
  })
})
