// Release rules shared by the release scripts and the release workflow: the
// pinned publisher key (publisher.json), the tag/version rule and the text of
// the GitHub Release and the catalog pull request.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveName } from './build.mjs'
import { MIN_APP_VERSION } from './catalog.mjs'
import { parseSemver } from './catalog-merge.mjs'
import { REPO_ROOT } from './cli.mjs'

/** The publisher key fingerprint every release must be signed with, committed so a swapped CI secret cannot publish. */
export const PUBLISHER_FILE = resolve(REPO_ROOT, 'publisher.json')

/** Reads publisher.json: exactly { "publicKeyFingerprint": "<16 lowercase hex>" }. */
export function readPublisher(path = PUBLISHER_FILE) {
  const publisher = JSON.parse(readFileSync(path, 'utf8'))
  const keys = publisher && typeof publisher === 'object' && !Array.isArray(publisher) ? Object.keys(publisher) : []
  if (keys.length !== 1 || keys[0] !== 'publicKeyFingerprint' || !/^[0-9a-f]{16}$/.test(publisher.publicKeyFingerprint)) {
    throw new Error('publisher.json must be exactly { "publicKeyFingerprint": "<16 lowercase hex>" }')
  }
  return publisher
}

/** The version a release tag names: `v<semver>`, nothing else. Throws otherwise. */
export function versionFromTag(tag) {
  const version = typeof tag === 'string' && tag.startsWith('v') ? tag.slice(1) : ''
  if (!parseSemver(version)) throw new Error(`release tags are v<semver> such as v1.2.3, got ${JSON.stringify(tag)}`)
  return version
}

/** The catalog validator's rule for a file name under packages/. */
const CATALOG_PACKAGE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.agentpet-plugin$/

/**
 * Throws unless `tag` names exactly the manifest version and the archive name
 * is one the catalog accepts (so no build metadata: `+` is not allowed there).
 * Returns { version, archive }.
 */
export function checkReleaseTag(tag, manifest) {
  const version = versionFromTag(tag)
  if (version !== manifest?.version) throw new Error(`tag ${tag} does not match src/plugin.json version ${JSON.stringify(manifest?.version)}`)
  const archive = archiveName(manifest)
  if (!CATALOG_PACKAGE_NAME.test(archive)) throw new Error(`${JSON.stringify(archive)} is not a catalog package file name (letters, digits, . _ -; no build metadata)`)
  return { version, archive }
}

// A signed tag's message ends with the signature: OpenPGP, SSH or X.509 (gitsign, smimesign).
const SIGNATURE_START = /^-----BEGIN (?:PGP SIGNATURE|SSH SIGNATURE|SIGNED MESSAGE)-----$/m

/** The release notes text of an annotated tag's message: the signature block and surrounding blank space removed. */
export function tagMessageNotes(message) {
  const text = String(message ?? '').replace(/\r\n?/g, '\n')
  const start = text.search(SIGNATURE_START)
  return (start === -1 ? text : text.slice(0, start)).trim()
}

/**
 * The facts a release and its catalog pull request state, read from a loaded
 * archive (see loadArchive). Throws unless it passes the package rules and is
 * validly signed by `fingerprint`.
 */
export function releaseFacts({ bytes, sha256, result, signature }, fingerprint) {
  if (!result.ok) throw new Error(`package rules failed:\n  ${result.errors.join('\n  ')}`)
  if (!signature?.valid) throw new Error('the archive must carry a valid signature')
  if (signature.fingerprint !== fingerprint) throw new Error(`the archive is signed by ${signature.fingerprint}, publisher.json pins ${fingerprint}`)
  const { manifest } = result
  return { id: manifest.id, name: manifest.name['en-US'], version: manifest.version, archive: archiveName(manifest), sha256, size: bytes.length, fingerprint, minAppVersion: MIN_APP_VERSION }
}

const tableRow = (label, value) => `| ${label} | ${value} |`

/** The GitHub Release title. */
export function releaseTitle(facts) {
  return `${facts.name} ${facts.version}`
}

/** The GitHub Release notes: the tag message (or a default line) and the package facts. */
export function releaseNotes(facts, tagMessage = '') {
  const intro = tagMessageNotes(tagMessage) || `${releaseTitle(facts)}.`
  return [
    intro,
    '',
    '| | |',
    '|---|---|',
    tableRow('Package', `\`${facts.archive}\``),
    tableRow('SHA-256', `\`${facts.sha256}\``),
    tableRow('Size', `${facts.size} bytes`),
    tableRow('Key fingerprint', `\`${facts.fingerprint}\``),
    tableRow('Minimum app version', `\`${facts.minAppVersion}\``),
    '',
  ].join('\n')
}

/** The commit message of the catalog change. */
export function catalogCommitMessage(facts) {
  return `feat(catalog): publish ${facts.id} ${facts.version}`
}

/** The catalog pull request title. */
export function catalogPullRequestTitle(facts) {
  return `發布 ${facts.id} ${facts.version}`
}

/** The catalog pull request body. `runUrl` and `releaseUrl` must be https URLs. */
export function catalogPullRequestBody(facts, { runUrl, releaseUrl }) {
  for (const url of [runUrl, releaseUrl]) {
    if (typeof url !== 'string' || !/^https:\/\/[^\s()<>[\]]+$/.test(url)) throw new Error(`not an https URL: ${JSON.stringify(url)}`)
  }
  return [
    '由 agent-pets-theme-plugin 的發布流程自動建立，請審查後再合併。',
    '',
    '| 項目 | 值 |',
    '|---|---|',
    tableRow('版本', `\`${facts.version}\``),
    tableRow('SHA-256', `\`${facts.sha256}\``),
    tableRow('大小', `${facts.size} bytes`),
    tableRow('簽章指紋', `\`${facts.fingerprint}\``),
    tableRow('最低 App 版本', `\`${facts.minAppVersion}\``),
    '',
    `- 新增 \`packages/${facts.archive}\``,
    '- `index.json` 加入此版本，其他欄位不變',
    `- 簽署與驗證：[發布流程](${runUrl})，[GitHub Release](${releaseUrl})`,
    '',
  ].join('\n')
}
