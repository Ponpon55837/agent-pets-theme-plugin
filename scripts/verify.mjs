#!/usr/bin/env node
// Re-checks a built archive: strict ZIP read, package rules, theme rules and
// the signature (if present). With --require-signature an unsigned archive fails.
// Usage: node scripts/verify.mjs <archive> [--require-signature]

import { readFileSync } from 'node:fs'
import { die, parseArgs } from './lib/cli.mjs'
import { describeThemes, PACKAGE_LIMITS, validatePackage } from './lib/package.mjs'
import { formatFingerprint, sha256Hex, verifySignature } from './lib/signature.mjs'
import { readZip } from './lib/zip.mjs'

const { options, positionals } = parseArgs(process.argv.slice(2))
if (!positionals[0]) die('usage: node scripts/verify.mjs <archive> [--require-signature]')
const bytes = readFileSync(positionals[0])
if (bytes.length > PACKAGE_LIMITS.maxTotalBytes) die(`archive is ${bytes.length} bytes > 25 MiB`)
let files
try {
  files = readZip(bytes, { maxEntries: PACKAGE_LIMITS.maxFiles, maxTotalBytes: PACKAGE_LIMITS.maxTotalBytes })
} catch (error) {
  die(`invalid archive: ${error.message}`)
}
const result = validatePackage(files, { allowSignature: true })
for (const line of describeThemes(result)) console.log(line)
for (const warning of result.warnings) console.warn(`warning: ${warning}`)
if (!result.ok) die(`package rules failed:\n  ${result.errors.join('\n  ')}`)
const signature = verifySignature(files)
if (signature.signed && !signature.valid) die(`signature invalid: ${signature.reason}`)
if (!signature.signed && options['require-signature']) die('archive is unsigned')
console.log(`\nok: ${result.manifest.id}@${result.manifest.version}`)
console.log(`files:       ${files.size}`)
console.log(`size:        ${bytes.length} bytes`)
console.log(`sha256:      ${sha256Hex(bytes)}`)
console.log(signature.signed ? `fingerprint: ${signature.fingerprint} (${formatFingerprint(signature.fingerprint)})` : 'signature:   none (unsigned)')
