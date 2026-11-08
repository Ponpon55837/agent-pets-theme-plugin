import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { loadArchive } from '../scripts/lib/archive.ts'
import { archiveName, buildArchive } from '../scripts/lib/build.ts'
import { catalogEntry, type CatalogEntry, type CatalogVersion } from '../scripts/lib/catalog.ts'
import { CATALOG_MAX_VERSIONS, type CatalogPlugin, compareSemver, formatIndex, mergeCatalogEntry, parseIndex, parseSemver } from '../scripts/lib/catalog-merge.ts'
import { gitFreeEnv, logSafe, REPO_ROOT, SRC_DIR } from '../scripts/lib/cli.ts'
import { assertKeyPathOutsideRepos } from '../scripts/lib/keyfile.ts'
import { catalogCommitMessage, catalogPullRequestBody, catalogPullRequestTitle, checkReleaseTag, readPublisher, releaseFacts, releaseNotes, releaseTitle, tagMessageNotes, versionFromTag } from '../scripts/lib/release.ts'
import { loadManifest } from './helpers.ts'

const PINNED = 'e78c75d80c8fb08e'
const node = (script: string, args: string[]) => spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], { encoding: 'utf8' })

const version = (value: string, extra: Partial<CatalogVersion> = {}): CatalogVersion => ({
  version: value,
  apiVersion: '1',
  minAppVersion: '1.12.0',
  url: `https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/panel-theme-collection-${value}.agentpet-plugin`,
  sha256: 'a'.repeat(64),
  size: 1000,
  publishedAt: '2026-11-08T00:00:00.000Z',
  ...extra,
})
const entry = (value: string, fingerprint = PINNED): CatalogEntry => ({
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
function onlyAddsLines(before: string, after: string): boolean {
  const added = after.split('\n')
  let at = 0
  for (const line of before.split('\n')) {
    while (at < added.length && added[at] !== line) at += 1
    if (at === added.length) return false
    at += 1
  }
  return true
}

let temp: string
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

  it('compares numbers beyond 2^53 exactly and reads versions as the catalog validator does', () => {
    assert.equal(compareSemver('9007199254740993.0.0', '9007199254740992.0.0'), 1)
    assert.equal(compareSemver('1.0.0-9007199254740993', '1.0.0-9007199254740992'), 1)
    assert.equal(parseSemver('1.0.0-01'), null, 'a numeric pre-release identifier has no leading zero')
    assert.deepEqual(parseSemver('1.0.0-0a.10'), { core: [1n, 0n, 0n], pre: ['0a', '10'] })
    assert.equal(parseSemver(`1.0.0-${'a'.repeat(95)}`), null, 'longer than 100 characters')
    assert.equal(parseSemver(1), null)
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
    const [radar, plugin] = merged.plugins as Array<CatalogPlugin & { versions: CatalogVersion[] }>
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
    assert.throws(() => mergeCatalogEntry(index, entry('1.0.1', '0123456789abcdef')), /listed with key "e78c75d80c8fb08e", the archive is signed by 0123456789abcdef/)
    const full = structuredClone(index)
    full.plugins[1].versions = Array.from({ length: CATALOG_MAX_VERSIONS }, (_, minor) => version(`0.${minor}.0`))
    assert.throws(() => mergeCatalogEntry(full, entry('1.0.1')), /already lists 20 versions/)
    const twice = structuredClone(index)
    twice.plugins.push(structuredClone(twice.plugins[1]))
    assert.throws(() => mergeCatalogEntry(twice, entry('1.0.1')), /lists panel-theme-collection 2 times/)
    assert.throws(() => mergeCatalogEntry(index, { ...entry('1.0.1'), versions: [version('1.0.1'), version('1.0.2')] }), /exactly one version/)
    assert.throws(() => mergeCatalogEntry(index, { ...entry('1.0.1'), publicKeyFingerprint: undefined } as unknown as CatalogEntry), /16-hex publicKeyFingerprint/)
    assert.throws(() => mergeCatalogEntry(index, entry('v1.0.1')), /not semver/)
    const noVersions = structuredClone(index)
    delete noVersions.plugins[1].versions
    assert.throws(() => mergeCatalogEntry(noVersions, entry('1.0.1')), /no versions list/)
  })
})

describe('release tag and publisher pin', () => {
  it('accepts only v<semver> tags that equal the manifest version', () => {
    assert.equal(versionFromTag('v1.2.3'), '1.2.3')
    assert.equal(versionFromTag('v1.2.3-rc.1'), '1.2.3-rc.1')
    for (const tag of ['1.2.3', 'v1.2', 'v01.2.3', 'release-1.2.3', 'v1.2.3 ', '', undefined]) assert.throws(() => versionFromTag(tag), /v<semver>/, String(tag))
    const manifest = { id: 'panel-theme-collection', version: '1.0.0' }
    assert.deepEqual(checkReleaseTag('v1.0.0', manifest), { version: '1.0.0', archive: 'panel-theme-collection-1.0.0.agentpet-plugin' })
    assert.throws(() => checkReleaseTag('v1.0.1', manifest), /tag v1\.0\.1 does not match src\/plugin\.json version "1\.0\.0"/)
    assert.throws(() => checkReleaseTag('v1.0.0+b', manifest), /does not match/)
    assert.throws(() => checkReleaseTag('v1.0.0+b', { ...manifest, version: '1.0.0+b' }), /not a catalog package file name/)
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
    const ok = node('scripts/release-check.ts', ['--tag', `v${current}`])
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(ok.stdout, `version=${current}\narchive=${id}-${current}.agentpet-plugin\nfingerprint=${PINNED}\n`)
    assert.match(node('scripts/release-check.ts', ['--tag', 'v0.0.1']).stderr, /does not match src\/plugin\.json version/)
    assert.match(node('scripts/release-check.ts', []).stderr, /usage:/)

    const catalog = join(temp, 'index.json')
    const index = parseIndex(INDEX_TEXT)
    const listed = index.plugins[1].versions as CatalogVersion[]
    listed[0].version = current
    writeFileSync(catalog, formatIndex(index))
    assert.match(node('scripts/release-check.ts', ['--tag', `v${current}`, '--catalog', catalog]).stderr, /already published; published versions are immutable/)
    index.plugins[1].publicKeyFingerprint = '0123456789abcdef'
    writeFileSync(catalog, formatIndex(index))
    assert.match(node('scripts/release-check.ts', ['--tag', `v${current}`, '--catalog', catalog]).stderr, /lists panel-theme-collection with key "0123456789abcdef", publisher\.json pins e78c75d80c8fb08e/)
    // A catalog value cannot start a workflow command in the log.
    index.plugins[1].publicKeyFingerprint = '\n::set-output name=archive::x'
    writeFileSync(catalog, formatIndex(index))
    assert.doesNotMatch(node('scripts/release-check.ts', ['--tag', `v${current}`, '--catalog', catalog]).stderr, /^\s*::/m)
    index.plugins.pop()
    writeFileSync(catalog, formatIndex(index))
    assert.equal(node('scripts/release-check.ts', ['--tag', `v${current}`, '--catalog', catalog]).status, 0, 'an unlisted plugin may be published')
  })
})

describe('catalog-merge command', () => {
  it('builds the entry from the archive and refuses one not signed by the pinned key', () => {
    const { privateKey } = generateKeyPairSync('ed25519') // throwaway, never written
    const built = buildArchive(SRC_DIR, { privateKey })
    const archive = join(temp, archiveName(built.result.manifest))
    writeFileSync(archive, built.bytes)
    const indexPath = join(temp, 'merge-index.json')
    writeFileSync(indexPath, INDEX_TEXT)
    const run = (args: string[]) => node('scripts/catalog-merge.ts', ['--index', indexPath, ...args])

    const fingerprint = loadArchive(archive).signature!.fingerprint
    assert.match(run(['--archive', archive, '--published-at', '2026-11-08T00:00:00Z']).stderr, new RegExp(`signed by ${fingerprint}, publisher\\.json pins ${PINNED}`))
    assert.match(run(['--archive', archive, '--published-at', 'yesterday']).stderr, /--published-at must be an ISO 8601/)
    assert.match(run(['--archive', join(temp, 'missing.agentpet-plugin'), '--published-at', '2026-11-08T00:00:00Z']).stderr, /archive: does not exist/)
    assert.equal(readFileSync(indexPath, 'utf8'), INDEX_TEXT, 'nothing is written on failure')
    assert.match(run([]).stderr, /usage:/)
    assert.match(run(['--archive', archive, '--entry', 'x', '--published-at', '2026-11-08T00:00:00Z']).stderr, /unknown option --entry/)
  })
})

describe('release text', () => {
  const { privateKey } = generateKeyPairSync('ed25519') // throwaway, never written
  const built = buildArchive(SRC_DIR, { privateKey })
  const loaded = () => {
    const path = join(temp, `text-${archiveName(built.result.manifest)}`)
    writeFileSync(path, built.bytes)
    return loadArchive(path)
  }

  it('strips OpenPGP, SSH and X.509 signature blocks from a tag message', () => {
    const body = 'Adds Dune Dusk.\n\n- New pill colours\n'
    for (const kind of ['PGP SIGNATURE', 'SSH SIGNATURE', 'SIGNED MESSAGE']) {
      assert.equal(tagMessageNotes(`${body}-----BEGIN ${kind}-----\nabc\n-----END ${kind}-----\n`), body.trim(), kind)
    }
    assert.equal(tagMessageNotes(`${body.replace(/\n/g, '\r\n')}-----BEGIN PGP SIGNATURE-----\r\nabc\r\n`), 'Adds Dune Dusk.\n\n- New pill colours')
    assert.equal(tagMessageNotes('Mentions -----BEGIN PGP SIGNATURE----- inline only'), 'Mentions -----BEGIN PGP SIGNATURE----- inline only')
    assert.equal(tagMessageNotes('-----BEGIN SSH SIGNATURE-----\nabc\n'), '')
    assert.equal(tagMessageNotes(undefined), '')
  })

  it('builds the notes and the pull request from the archive facts', () => {
    const archive = loaded()
    assert.throws(() => releaseFacts(archive, PINNED), /publisher\.json pins/)
    const facts = releaseFacts(archive, archive.signature!.fingerprint!)
    assert.deepEqual(Object.keys(facts), ['id', 'name', 'version', 'archive', 'sha256', 'size', 'fingerprint', 'minAppVersion'])
    assert.equal(facts.size, built.bytes.length)
    const notes = releaseNotes(facts, 'Release notes.\n-----BEGIN PGP SIGNATURE-----\nx\n')
    assert.ok(notes.startsWith('Release notes.\n\n| | |\n'))
    assert.ok(notes.includes(`| SHA-256 | \`${facts.sha256}\` |`))
    assert.ok(releaseNotes(facts).startsWith(`${releaseTitle(facts)}.\n`))
    assert.equal(catalogPullRequestTitle(facts), `發布 ${facts.id} ${facts.version}`)
    assert.equal(catalogCommitMessage(facts), `feat(catalog): publish ${facts.id} ${facts.version}`)
    const urls = { runUrl: 'https://github.com/o/r/actions/runs/1', releaseUrl: 'https://github.com/o/r/releases/tag/v1.0.0' }
    const body = catalogPullRequestBody(facts, urls)
    assert.ok(body.includes(`[發布流程](${urls.runUrl})`) && body.includes(`packages/${facts.archive}`))
    assert.throws(() => catalogPullRequestBody(facts, { ...urls, runUrl: 'javascript:alert(1)' }), /not an https URL/)
    assert.throws(() => catalogPullRequestBody(facts, { ...urls, releaseUrl: 'https://x/a)(b' }), /not an https URL/)
  })

  it('release-text refuses an archive not signed by the pinned key and unknown kinds', () => {
    const path = join(temp, 'cli-text.agentpet-plugin')
    writeFileSync(path, built.bytes)
    assert.match(node('scripts/release-text.ts', ['notes', '--archive', path]).stderr, /publisher\.json pins/)
    assert.match(node('scripts/release-text.ts', ['other', '--archive', path]).stderr, /usage:/)
    assert.match(node('scripts/release-text.ts', ['title', '--archive', path, '--run-url', 'https://x']).stderr, /--run-url does not apply to title/)
    assert.match(node('scripts/release-text.ts', ['pr-body', '--archive', path]).stderr, /needs --run-url and --release-url/)
  })
})

describe('log safety', () => {
  it('keeps file text from starting a workflow command', () => {
    assert.equal(logSafe('a\n::error::b\n  ::warning::c\rd'), 'a\n: :error::b\n  : :warning::c\\rd')
    assert.equal(logSafe('key :: value'), 'key :: value')
  })
})

describe('release workflow scripts', () => {
  const lib = resolve(REPO_ROOT, 'scripts/ci/lib.sh')
  const bash = (script: string) => spawnSync('bash', ['-c', `. "$0"; ${script}`, lib], { encoding: 'utf8' })

  it('accepts only v<semver> tags without build metadata and names the catalog branch', () => {
    for (const tag of ['v1.0.0', 'v1.2.3-rc.1', 'v10.0.0-beta-2']) assert.equal(bash(`TAG='${tag}' require_tag`).status, 0, tag)
    for (const tag of ['1.0.0', 'v1.0', 'v01.0.0', 'v1.0.0+b', 'v1.0.0;x', 'v1.0.0 ', 'v1.0.0\nx']) {
      const run = bash(`TAG=${JSON.stringify(tag)} require_tag`)
      assert.equal(run.status, 1, tag)
      assert.match(run.stderr, /^::error::Release tags are v<semver>/)
    }
    assert.equal(bash('publish_branch /tmp/release/panel-theme-collection-1.0.1.agentpet-plugin').stdout, 'publish/panel-theme-collection-1.0.1\n')
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
