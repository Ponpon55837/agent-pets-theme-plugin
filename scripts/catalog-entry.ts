#!/usr/bin/env node
// Prints the catalog index.json entry for a signed archive: size, sha256 and
// the publisher key fingerprint are read from the archive itself.
// Usage: node scripts/catalog-entry.ts <signed archive> [--published-at <ISO time>]

import { basename } from 'node:path'
import { loadArchive, type LoadedArchive } from './lib/archive.ts'
import { archiveName } from './lib/build.ts'
import { catalogEntry, parsePublishedAt } from './lib/catalog.ts'
import { cliArgs, die, errorMessage } from './lib/cli.ts'

const USAGE = 'node scripts/catalog-entry.ts <signed archive> [--published-at <ISO time>]'
const { options, positionals } = cliArgs({ string: ['published-at'] }, USAGE)
if (positionals.length !== 1) die(positionals.length === 0 ? `usage: ${USAGE}` : `expected exactly one archive path, got ${positionals.length}; usage: ${USAGE}`)
const publishedAt = options['published-at'] ? parsePublishedAt(options['published-at']) : new Date()
if (!publishedAt) die('--published-at must be an ISO 8601 date-time such as 2026-11-08T00:00:00Z')

let archive: LoadedArchive
try {
  archive = loadArchive(positionals[0])
} catch (error) {
  die(errorMessage(error))
}
const { result, signature } = archive
if (!result.ok || !result.manifest || !signature) die(`package rules failed:\n  ${result.errors.join('\n  ')}`)
if (!signature.signed) die('the archive is unsigned; run pnpm sign first')
if (!signature.valid) die(`signature invalid: ${signature.reason}`)

const expected = archiveName(result.manifest)
const name = basename(positionals[0])
if (name !== expected) console.warn(`warning: archive name ${name} differs from ${expected}; publish it as ${expected}`)
try {
  console.log(JSON.stringify(catalogEntry(archive, publishedAt), null, 2))
} catch (error) {
  die(errorMessage(error))
}
