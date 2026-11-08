#!/usr/bin/env node
// Re-checks a built archive: bounded no-follow read, strict ZIP read, package
// rules, theme rules and the signature (if present).
//   --require-signature    an unsigned archive fails
//   --fingerprint <hex16>  the signing key must have this fingerprint (implies a signature)
//   --sha256 <hex64>       the archive bytes must have this SHA-256 (as in the catalog entry)
// Usage: node scripts/verify.mjs [--require-signature] [--fingerprint <hex>] [--sha256 <hex>] <archive>

import { loadArchive } from './lib/archive.mjs'
import { cliArgs, die } from './lib/cli.mjs'
import { describeThemes } from './lib/package.mjs'
import { formatFingerprint } from './lib/signature.mjs'

const USAGE = 'node scripts/verify.mjs [--require-signature] [--fingerprint <hex>] [--sha256 <hex>] <archive>'
const { options, positionals } = cliArgs({ boolean: ['require-signature'], string: ['fingerprint', 'sha256'] }, USAGE)
if (positionals.length !== 1) die(positionals.length === 0 ? `usage: ${USAGE}` : `expected exactly one archive path, got ${positionals.length}; usage: ${USAGE}`)
const expected = { fingerprint: options.fingerprint?.toLowerCase(), sha256: options.sha256?.toLowerCase() }
if (expected.fingerprint !== undefined && !/^[0-9a-f]{16}$/.test(expected.fingerprint)) die('--fingerprint must be 16 hex characters')
if (expected.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(expected.sha256)) die('--sha256 must be 64 hex characters')

let archive
try {
  archive = loadArchive(positionals[0])
} catch (error) {
  die(error.message)
}
const { bytes, sha256, files, result, signature } = archive
for (const line of describeThemes(result)) console.log(line)
for (const warning of result.warnings) console.warn(`warning: ${warning}`)
if (!result.ok) die(`package rules failed:\n  ${result.errors.join('\n  ')}`)
if (signature.signed && !signature.valid) die(`signature invalid: ${signature.reason}`)
if (!signature.signed && (options['require-signature'] || expected.fingerprint)) die('archive is unsigned')
if (expected.fingerprint && signature.fingerprint !== expected.fingerprint) die(`signed by key ${signature.fingerprint}, expected ${expected.fingerprint}`)
if (expected.sha256 && sha256 !== expected.sha256) die(`archive SHA-256 is ${sha256}, expected ${expected.sha256}`)
console.log(`\nok: ${result.manifest.id}@${result.manifest.version}`)
console.log(`files:       ${files.size}`)
console.log(`size:        ${bytes.length} bytes`)
console.log(`sha256:      ${sha256}`)
console.log(signature.signed ? `fingerprint: ${signature.fingerprint} (${formatFingerprint(signature.fingerprint)})` : 'signature:   none (unsigned)')
