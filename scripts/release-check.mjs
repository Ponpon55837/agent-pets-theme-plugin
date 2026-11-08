#!/usr/bin/env node
// The gate the release workflow runs before signing: the tag must name the
// src/plugin.json version, and with --catalog the catalog index.json must not
// list that version or a newer one (published versions are immutable) and
// must list the plugin, if at all, under the key pinned in publisher.json.
// Prints version=, archive= and fingerprint= lines for $GITHUB_OUTPUT.
//
// Usage: node scripts/release-check.mjs --tag v<version> [--catalog <index.json>]

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { archiveName } from './lib/build.mjs'
import { assertVersionIsNew, findPlugin, parseIndex } from './lib/catalog-merge.mjs'
import { cliArgs, die, SRC_DIR } from './lib/cli.mjs'
import { readRegularFile } from './lib/files.mjs'
import { checkReleaseTag, readPublisher } from './lib/release.mjs'

/** The catalog validator's index.json limit. */
const CATALOG_MAX_BYTES = 1024 * 1024
const USAGE = 'node scripts/release-check.mjs --tag v<version> [--catalog <index.json>]'
const { options, positionals } = cliArgs({ string: ['tag', 'catalog'] }, USAGE)
if (!options.tag || positionals.length > 0) die(`usage: ${USAGE}`)

try {
  const manifest = JSON.parse(readFileSync(resolve(SRC_DIR, 'plugin.json'), 'utf8'))
  const version = checkReleaseTag(options.tag, manifest.version)
  const { publicKeyFingerprint } = readPublisher()
  if (options.catalog) {
    const index = parseIndex(readRegularFile(resolve(options.catalog), CATALOG_MAX_BYTES, 'index.json').bytes.toString('utf8'))
    const listed = findPlugin(index, manifest.id)
    if (listed && listed.publicKeyFingerprint !== publicKeyFingerprint) {
      die(`the catalog lists ${manifest.id} with key ${listed.publicKeyFingerprint}, publisher.json pins ${publicKeyFingerprint}`)
    }
    if (listed) assertVersionIsNew(listed, version)
  }
  console.log(`version=${version}`)
  console.log(`archive=${archiveName(manifest)}`)
  console.log(`fingerprint=${publicKeyFingerprint}`)
} catch (error) {
  die(error.message)
}
