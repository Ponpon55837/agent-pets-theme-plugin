#!/usr/bin/env node
// Adds a signed archive's catalog entry (catalog-entry.mjs output) to a
// checkout of the catalog repository's index.json, in place. With --archive
// the entry must describe exactly those bytes (name, size, sha256). The entry
// must carry the key pinned in publisher.json. See lib/catalog-merge.mjs for
// the merge rules.
//
// Usage: node scripts/catalog-merge.mjs --index <index.json> --entry <entry.json> [--archive <archive>]

import { writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { formatIndex, mergeCatalogEntry, parseIndex } from './lib/catalog-merge.mjs'
import { cliArgs, die } from './lib/cli.mjs'
import { readRegularFile } from './lib/files.mjs'
import { PACKAGE_LIMITS } from './lib/package.mjs'
import { readPublisher } from './lib/release.mjs'
import { sha256Hex } from './lib/signature.mjs'

const CATALOG_MAX_BYTES = 1024 * 1024
const ENTRY_MAX_BYTES = 64 * 1024
const USAGE = 'node scripts/catalog-merge.mjs --index <index.json> --entry <entry.json> [--archive <archive>]'
const { options, positionals } = cliArgs({ string: ['index', 'entry', 'archive'] }, USAGE)
if (!options.index || !options.entry || positionals.length > 0) die(`usage: ${USAGE}`)

try {
  const indexPath = resolve(options.index)
  const index = parseIndex(readRegularFile(indexPath, CATALOG_MAX_BYTES, 'index.json').bytes.toString('utf8'))
  const entry = JSON.parse(readRegularFile(resolve(options.entry), ENTRY_MAX_BYTES, 'the entry').bytes.toString('utf8'))
  const [version] = entry?.versions ?? []
  if (options.archive) {
    const { bytes } = readRegularFile(resolve(options.archive), PACKAGE_LIMITS.maxTotalBytes, 'archive')
    const name = basename(options.archive)
    if (typeof version?.url !== 'string' || !version.url.endsWith(`/${name}`)) die(`the entry url does not end with /${name}`)
    if (version.size !== bytes.length) die(`the entry size ${version.size} differs from the archive (${bytes.length} bytes)`)
    if (version.sha256 !== sha256Hex(bytes)) die('the entry sha256 differs from the archive')
  }
  const { publicKeyFingerprint } = readPublisher()
  if (entry?.publicKeyFingerprint !== publicKeyFingerprint) die(`the entry is signed by ${entry?.publicKeyFingerprint}, publisher.json pins ${publicKeyFingerprint}`)
  const merged = mergeCatalogEntry(index, entry)
  writeFileSync(indexPath, formatIndex(merged.index))
  console.log(`added ${merged.added === 'plugin' ? 'plugin' : 'version'} ${entry.id}@${version.version} to index.json`)
} catch (error) {
  die(error.message)
}
