#!/usr/bin/env node
// Adds a signed archive to a checkout of the catalog repository's index.json,
// in place. The entry is built from the archive itself (as catalog-entry.mjs
// prints it, with the given publishedAt), so no hand-edited or downloaded
// entry is trusted. The archive must be signed by the key pinned in
// publisher.json and carry its canonical file name. See lib/catalog-merge.mjs
// for the merge rules.
//
// Usage: node scripts/catalog-merge.mjs --index <index.json> --archive <archive> --published-at <ISO time>

import { writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { loadArchive } from './lib/archive.mjs'
import { catalogEntry, parsePublishedAt } from './lib/catalog.mjs'
import { formatIndex, mergeCatalogEntry, readIndex } from './lib/catalog-merge.mjs'
import { cliArgs, die } from './lib/cli.mjs'
import { readPublisher, releaseFacts } from './lib/release.mjs'

const USAGE = 'node scripts/catalog-merge.mjs --index <index.json> --archive <archive> --published-at <ISO time>'
const { options, positionals } = cliArgs({ string: ['index', 'archive', 'published-at'] }, USAGE)
if (!options.index || !options.archive || !options['published-at'] || positionals.length > 0) die(`usage: ${USAGE}`)
const publishedAt = parsePublishedAt(options['published-at'])
if (!publishedAt) die('--published-at must be an ISO 8601 date-time such as 2026-11-08T00:00:00Z')

try {
  const indexPath = resolve(options.index)
  const index = readIndex(indexPath)
  const archive = loadArchive(resolve(options.archive))
  const facts = releaseFacts(archive, readPublisher().publicKeyFingerprint)
  if (basename(options.archive) !== facts.archive) die(`the archive must be named ${facts.archive}, as its catalog URL`)
  const merged = mergeCatalogEntry(index, catalogEntry(archive, publishedAt))
  writeFileSync(indexPath, formatIndex(merged.index))
  console.log(`added ${merged.added} ${facts.id}@${facts.version} to index.json`)
} catch (error) {
  die(error.message)
}
