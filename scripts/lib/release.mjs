// Release gates shared by release-check.mjs and the release workflow: the
// pinned publisher key (publisher.json) and the tag/version rule.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

/** Throws unless `tag` names exactly the manifest version (build metadata included). */
export function checkReleaseTag(tag, manifestVersion) {
  const version = versionFromTag(tag)
  if (version !== manifestVersion) throw new Error(`tag ${tag} does not match src/plugin.json version ${manifestVersion}`)
  return version
}
