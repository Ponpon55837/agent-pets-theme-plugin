#!/usr/bin/env node
// Prints the catalog index.json entry for a signed archive: size, sha256 and
// the publisher key fingerprint are read from the archive itself.
// Usage: node scripts/catalog-entry.mjs <signed archive> [--published-at <ISO time>]

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { cliArgs, die } from './lib/cli.mjs'
import { PACKAGE_LIMITS, validatePackage } from './lib/package.mjs'
import { sha256Hex, verifySignature } from './lib/signature.mjs'
import { readZip } from './lib/zip.mjs'

const MIN_APP_VERSION = '1.12.0'
const DESCRIPTION = {
  'zh-TW': '可自訂面板顏色、字型與背景的主題（含淺色與深色）。',
  'en-US': 'Panel themes with colours, fonts and backgrounds for light and dark modes.',
}
const HOMEPAGE = 'https://github.com/Ponpon55837/agent-pets-theme-plugin'
const PACKAGE_BASE_URL = 'https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/'

const USAGE = 'node scripts/catalog-entry.mjs <signed archive> [--published-at <ISO time>]'
const { options, positionals } = cliArgs({ string: ['published-at'] }, USAGE)
if (positionals.length !== 1) die(positionals.length === 0 ? `usage: ${USAGE}` : `expected exactly one archive path, got ${positionals.length}; usage: ${USAGE}`)
const bytes = readFileSync(positionals[0])
let files
try {
  files = readZip(bytes, { maxEntries: PACKAGE_LIMITS.maxFiles, maxTotalBytes: PACKAGE_LIMITS.maxTotalBytes })
} catch (error) {
  die(`invalid archive: ${error.message}`)
}
const result = validatePackage(files, { allowSignature: true })
if (!result.ok) die(`package rules failed:\n  ${result.errors.join('\n  ')}`)
const signature = verifySignature(files)
if (!signature.signed) die('the archive is unsigned; run npm run sign first')
if (!signature.valid) die(`signature invalid: ${signature.reason}`)

const publishedAt = options['published-at'] ? new Date(options['published-at']) : new Date()
if (Number.isNaN(publishedAt.getTime())) die('--published-at must be an ISO date-time')
const { manifest } = result
const name = basename(positionals[0])
const expected = `${manifest.id}-${manifest.version}.agentpet-plugin`
if (name !== expected) console.warn(`warning: archive name ${name} differs from ${expected}`)

const entry = {
  id: manifest.id,
  name: manifest.name,
  description: DESCRIPTION,
  author: manifest.author,
  homepage: HOMEPAGE,
  publicKeyFingerprint: signature.fingerprint,
  versions: [{
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    minAppVersion: MIN_APP_VERSION,
    url: `${PACKAGE_BASE_URL}${expected}`,
    sha256: sha256Hex(bytes),
    size: bytes.length,
    publishedAt: publishedAt.toISOString(),
  }],
}
console.log(JSON.stringify(entry, null, 2))
